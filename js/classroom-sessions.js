/**
 * Classroom + Webinar sessions booked through Cognation (Alexa 2026-10-20).
 *
 * One server table, public.classroom_sessions (supabase/migrations/20261020_classroom_sessions.sql).
 * - Owners of a Professional Tower page book sessions (title, date/time, length).
 * - Everyone reads scheduled + live sessions on the public Cognation Calendar.
 * - The host's Go live sets status 'live'; End sets 'ended'.
 * - window.CognationProLive.livePages() lists the hosts live right now, so ECHO shows a
 *   live Classroom / Webinar card only while a session is live.
 *
 * No browser-only stand-ins: if the table is missing or sign-in is not configured,
 * every list is empty and the UI shows its quiet empty state. Personal calendar events
 * are never read here; they stay private in the profile record.
 * No real video yet: Join opens the silent classroom room. Streaming waits on spend approval.
 */
(function (root) {
  "use strict";

  var TABLE = "classroom_sessions";
  var KINDS = ["classroom", "webinar"];
  var LENGTHS = [30, 45, 60, 90, 120];
  var MAX_MINUTES = 240;
  /* A live row whose host never pressed End stops counting as live this long after
     its booked end time, so a forgotten session can't sit on ECHO forever. */
  var LIVE_GRACE_MS = 60 * 60 * 1000;
  /* Mirrors classroom_sessions_guard: scheduled -> live only from 30 min before starts_at through ends_at. */
  var GO_LIVE_EARLY_MS = 30 * 60 * 1000;
  var REFRESH_MS = 60 * 1000;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var HOST_COLUMNS = "id,handle,display_name,kind,account_kind,photo_url,user_id";
  var COLUMNS = "id,host_profile_id,title,kind,starts_at,ends_at,status,rating,created_at";

  var state = {
    rows: [],
    own: [],
    available: null, /* null = not asked yet, false = table missing / not configured */
    loading: null,
    viewerIsSeed: false,
    timer: null,
  };

  function now() { return Date.now(); }

  function client() {
    var sb = root.CognationSupabase;
    return sb && typeof sb.configured === "function" && sb.configured() ? sb : null;
  }

  function session() {
    var sb = root.CognationSupabase;
    try { return sb && sb.getSession ? sb.getSession() : null; } catch (e) { return null; }
  }

  function viewerUserId() {
    var s = session();
    return (s && s.user && s.user.id) || "";
  }

  function emit(name, detail) {
    try {
      if (root.document && typeof root.CustomEvent === "function") {
        root.document.dispatchEvent(new root.CustomEvent(name, { detail: detail || {} }));
      }
    } catch (e) {}
  }

  /* ---- Pure helpers (tested) ---------------------------------------------------- */

  function toMs(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v;
    return Date.parse(String(v));
  }

  function normalizeHost(h) {
    if (!h || typeof h !== "object") return null;
    return {
      id: String(h.id || ""),
      handle: String(h.handle || "").replace(/^@/, ""),
      displayName: String(h.display_name || h.displayName || h.handle || "").trim(),
      kind: String(h.kind || ""),
      accountKind: String(h.account_kind || h.accountKind || "real"),
      photoUrl: /^https:\/\//.test(String(h.photo_url || h.photoUrl || "")) ? String(h.photo_url || h.photoUrl) : "",
      userId: String(h.user_id || h.userId || ""),
    };
  }

  function normalizeRow(row) {
    if (!row || typeof row !== "object") return null;
    var kind = KINDS.indexOf(String(row.kind)) >= 0 ? String(row.kind) : "";
    var startsAt = toMs(row.starts_at != null ? row.starts_at : row.startsAt);
    var endsAt = toMs(row.ends_at != null ? row.ends_at : row.endsAt);
    var title = String(row.title || "").trim();
    if (!row.id || !kind || !title || isNaN(startsAt) || isNaN(endsAt)) return null;
    var status = ["scheduled", "live", "ended"].indexOf(String(row.status)) >= 0 ? String(row.status) : "scheduled";
    return {
      id: String(row.id),
      hostProfileId: String(row.host_profile_id || row.hostProfileId || (row.host && row.host.id) || ""),
      title: title.slice(0, 120),
      kind: kind,
      startsAt: startsAt,
      endsAt: endsAt,
      status: status,
      rating: String(row.rating || "PG-13"),
      host: normalizeHost(row.host),
    };
  }

  function isLiveNow(s, at) {
    if (!s || s.status !== "live") return false;
    var t = at == null ? now() : at;
    return t < s.endsAt + LIVE_GRACE_MS;
  }

  /* Mirrors cognation_classroom_session_status: a live row more than 60 min past ends_at is ended. */
  function effectiveStatus(s, at) {
    if (!s) return "";
    if (s.status === "live" && !isLiveNow(s, at)) return "ended";
    return s.status;
  }

  function withinGoLiveWindow(s, at) {
    if (!s) return false;
    var t = at == null ? now() : at;
    return t >= s.startsAt - GO_LIVE_EARLY_MS && t <= s.endsAt;
  }

  function isUpcoming(s, at) {
    if (!s || s.status !== "scheduled") return false;
    var t = at == null ? now() : at;
    return s.endsAt > t;
  }

  function ratingIsGPG(r) {
    var floor = root.CognationAgeFloor;
    if (floor && typeof floor.ratingIsGPG === "function") return floor.ratingIsGPG(r);
    r = String(r || "").toUpperCase();
    return r === "G" || r === "PG";
  }

  /**
   * Mirrors the server read policy so the UI never shows a row the server would hide
   * (the server is the real gate; this is the second lock). For an unknown age the
   * client is stricter (0 = G/PG only) than the server's 13 backstop.
   * viewer: { userId, isSeed, age }  (age 0 / null = unknown: G/PG only, as under 13)
   */
  function visibleToViewer(s, viewer) {
    if (!s || !s.host) return false;
    viewer = viewer || {};
    if (s.host.kind && s.host.kind !== "professional") return false;
    var own = !!(viewer.userId && s.host.userId && viewer.userId === s.host.userId);
    if (own) return true;
    if (s.status === "ended") return false;
    if (s.host.accountKind !== "real" && !viewer.isSeed) return false;
    var age = Number(viewer.age) || 0;
    /* Under 13 or unknown (0: signed out, user_birth pending or no row, or no
       user_birth reader on this page) sees G/PG only (#309). The server's 13
       default for an unknown age is a separate backstop. */
    if (age < 13 && !ratingIsGPG(s.rating)) return false;
    /* R (or any rating past PG-13) needs a known 18+ age. */
    var r = String(s.rating || "").toUpperCase();
    if (!ratingIsGPG(s.rating) && r !== "PG-13" && !(age >= 18)) return false;
    return true;
  }

  function viewerContext() {
    var age = 0;
    try {
      var floor = root.CognationAgeFloor;
      if (floor && typeof floor.viewerAge === "function") age = Number(floor.viewerAge()) || 0;
    } catch (e) {}
    return { userId: viewerUserId(), isSeed: !!state.viewerIsSeed, age: age };
  }

  function sortByStart(list) {
    return list.slice().sort(function (a, b) { return a.startsAt - b.startsAt || (a.id < b.id ? -1 : 1); });
  }

  /** Public Cognation Calendar rows: live now + upcoming, never ended, never personal events. */
  function publicAgenda(rows, opts) {
    opts = opts || {};
    var at = opts.now == null ? now() : opts.now;
    var filter = opts.filter === "classroom" || opts.filter === "webinar" ? opts.filter : "all";
    var viewer = opts.viewer || viewerContext();
    return sortByStart((rows || []).filter(function (s) {
      if (!s || !s.id || !s.host) return false;
      if (filter !== "all" && s.kind !== filter) return false;
      if (!(isLiveNow(s, at) || isUpcoming(s, at))) return false;
      return visibleToViewer(s, viewer);
    }));
  }

  function dayKey(ms) {
    var d = new Date(ms);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  /** "YYYY-MM-DD" -> "Tue, Oct 20" (the Cognation Calendar date format). */
  function dayDateLabel(key) {
    var d = new Date(String(key) + "T12:00:00");
    if (isNaN(d.getTime())) return String(key || "");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  /** Group agenda rows by local day: [{ key, label, date, rows }]. */
  function groupByDay(rows, at) {
    at = at == null ? now() : at;
    var today = dayKey(at);
    var tomorrow = dayKey(at + 86400000);
    var out = [];
    var index = {};
    rows.forEach(function (s) {
      var key = dayKey(isLiveNow(s, at) && s.startsAt < at ? at : s.startsAt);
      if (!index[key]) {
        var d = new Date(key + "T12:00:00");
        var label = key === today ? "Today" : key === tomorrow ? "Tomorrow"
          : d.toLocaleDateString(undefined, { weekday: "long" });
        var date = key === today || key === tomorrow
          ? dayDateLabel(key)
          : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        index[key] = { key: key, label: label, date: date, rows: [] };
        out.push(index[key]);
      }
      index[key].rows.push(s);
    });
    return out;
  }

  function minutesOf(s) {
    return Math.max(0, Math.round((s.endsAt - s.startsAt) / 60000));
  }

  function timeLabel(ms) {
    return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function zoneLabel(at) {
    try {
      var parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date(at == null ? now() : at));
      var z = parts.filter(function (p) { return p.type === "timeZoneName"; })[0];
      return z ? z.value : "";
    } catch (e) { return ""; }
  }

  /* RLS-shaped checks: who may book, go live, or end (the server enforces the same). */
  function ownsProPage(viewer, profile) {
    if (!viewer || !viewer.userId || !profile) return false;
    var kind = profile.kind || profile._profileKind;
    if (kind !== "professional") return false;
    var owner = profile.userId || profile.user_id || "";
    return !!owner && owner === viewer.userId && UUID_RE.test(String(profile.id || ""));
  }
  function canSchedule(viewer, profile) { return ownsProPage(viewer, profile); }
  function canGoLive(viewer, profile, s, rows, at) {
    if (!ownsProPage(viewer, profile) || !s || s.status !== "scheduled") return false;
    if (s.hostProfileId !== String(profile.id)) return false;
    if (!withinGoLiveWindow(s, at)) return false;
    /* Stale live rows (past ends_at + 60 min) do not block; the server ends them first. */
    return !(rows || []).some(function (r) { return r && r.hostProfileId === s.hostProfileId && r.id !== s.id && effectiveStatus(r, at) === "live"; });
  }
  function canEnd(viewer, profile, s) {
    return !!(ownsProPage(viewer, profile) && s && s.status === "live" && s.hostProfileId === String(profile.id));
  }
  function nextStatusAllowed(from, to) {
    return (from === "scheduled" && (to === "live" || to === "ended")) || (from === "live" && to === "ended");
  }

  /** Validate a booking form. Returns { ok, error, row }. Local date + time in the host's zone. */
  function validateBooking(input, at) {
    input = input || {};
    at = at == null ? now() : at;
    var title = String(input.title || "").trim();
    var kind = String(input.kind || "");
    var date = String(input.date || "");
    var time = String(input.time || "");
    var minutes = parseInt(input.minutes, 10);
    if (!title) return { ok: false, error: "Add a title." };
    if (title.length > 120) return { ok: false, error: "Keep the title under 120 characters." };
    if (KINDS.indexOf(kind) < 0) return { ok: false, error: "Pick Classroom or Webinar." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Pick a date and time." };
    if (!(minutes > 0) || minutes > MAX_MINUTES) return { ok: false, error: "Pick a length." };
    var p = date.split("-");
    var q = time.split(":");
    var start = new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1], 0, 0).getTime();
    if (isNaN(start)) return { ok: false, error: "Pick a date and time." };
    if (start < at - 5 * 60000) return { ok: false, error: "Pick a time that hasn't passed." };
    var end = start + minutes * 60000;
    return {
      ok: true,
      row: { title: title, kind: kind, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() },
    };
  }

  /** Shape ECHO reads through window.CognationProLive.livePages(). */
  function livePagesFrom(rows, opts) {
    opts = opts || {};
    var at = opts.now == null ? now() : opts.now;
    var viewer = opts.viewer || viewerContext();
    var seen = {};
    var out = [];
    sortByStart(rows || []).forEach(function (s) {
      if (!s || !s.host || !isLiveNow(s, at) || !visibleToViewer(s, viewer)) return;
      if (seen[s.host.id]) return;
      seen[s.host.id] = true;
      out.push({
        profileId: s.host.id,
        handle: s.host.handle,
        displayName: s.host.displayName,
        photoUrl: s.host.photoUrl,
        accountKind: s.host.accountKind,
        kind: "professional",
        live: true,
        sessionId: s.id,
        sessionKind: s.kind,
        sessionTitle: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        rating: s.rating,
      });
    });
    return out;
  }

  /* ---- Server ------------------------------------------------------------------- */

  function tableMissing(err) {
    var code = String((err && (err.code || (err.body && err.body.code))) || "");
    var status = Number(err && err.status) || 0;
    return status === 404 || code === "42P01" || code === "PGRST205" || code === "PGRST200";
  }

  function publicQuery(at) {
    var iso = new Date((at == null ? now() : at) - LIVE_GRACE_MS).toISOString();
    return "select=" + COLUMNS + ",host:profiles!host_profile_id(" + HOST_COLUMNS + ")" +
      "&or=(status.eq.live,and(status.eq.scheduled,ends_at.gt." + encodeURIComponent(iso) + "))" +
      "&order=starts_at.asc&limit=300";
  }

  function refresh() {
    var sb = client();
    if (!sb) {
      state.rows = [];
      state.available = false;
      emit("cognation:classroom-sessions-updated", { available: false });
      return Promise.resolve([]);
    }
    if (state.loading) return state.loading;
    state.loading = sb.rest(TABLE, { query: publicQuery() }).then(function (rows) {
      state.rows = (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean);
      state.available = true;
      return state.rows;
    }, function (err) {
      state.rows = [];
      state.available = tableMissing(err) ? false : state.available;
      return [];
    }).then(function (rows) {
      state.loading = null;
      emit("cognation:classroom-sessions-updated", { available: state.available });
      return rows;
    });
    return state.loading;
  }

  function refreshViewerSeed() {
    var sb = client();
    if (!sb || !viewerUserId() || typeof sb.rpc !== "function") { state.viewerIsSeed = false; return Promise.resolve(false); }
    return sb.rpc("cognation_am_i_seed", {}).then(function (v) {
      state.viewerIsSeed = v === true;
      return state.viewerIsSeed;
    }, function () { state.viewerIsSeed = false; return false; });
  }

  function loadOwn(profileId) {
    var sb = client();
    if (!sb || !UUID_RE.test(String(profileId || ""))) { state.own = []; return Promise.resolve([]); }
    var since = new Date(now() - LIVE_GRACE_MS).toISOString();
    return sb.rest(TABLE, {
      query: "select=" + COLUMNS + ",host:profiles!host_profile_id(" + HOST_COLUMNS + ")" +
        "&host_profile_id=eq." + encodeURIComponent(profileId) +
        "&status=neq.ended&ends_at=gt." + encodeURIComponent(since) + "&order=starts_at.asc&limit=100",
    }).then(function (rows) {
      state.own = (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean);
      return state.own;
    }, function () { state.own = []; return []; });
  }

  function book(profile, input) {
    var viewer = viewerContext();
    if (!canSchedule(viewer, profile)) return Promise.reject(new Error("Only the owner of this Professional page can book sessions here."));
    var checked = validateBooking(input);
    if (!checked.ok) return Promise.reject(new Error(checked.error));
    var sb = client();
    if (!sb) return Promise.reject(new Error("Sign in to book sessions."));
    var body = Object.assign({ host_profile_id: String(profile.id) }, checked.row);
    return sb.rest(TABLE, { method: "POST", body: body }).then(function (rows) {
      return Promise.all([loadOwn(profile.id), refresh()]).then(function () { return rows; });
    }, function (err) {
      if (tableMissing(err)) throw new Error("Booking opens once the sessions table is set up.");
      throw new Error("Could not book that session. Try again.");
    });
  }

  function setStatus(profile, s, status) {
    var viewer = viewerContext();
    var ok = status === "live" ? canGoLive(viewer, profile, s, state.own) : status === "ended" ? canEnd(viewer, profile, s) || (s && s.status === "scheduled" && ownsProPage(viewer, profile)) : false;
    if (!ok || !nextStatusAllowed(s && s.status, status)) return Promise.reject(new Error("That change isn't allowed."));
    var sb = client();
    if (!sb) return Promise.reject(new Error("Sign in first."));
    return sb.rest(TABLE, {
      method: "PATCH",
      query: "id=eq." + encodeURIComponent(s.id) + "&host_profile_id=eq." + encodeURIComponent(profile.id),
      body: { status: status },
    }).then(function () {
      return Promise.all([loadOwn(profile.id), refresh()]);
    }, function (err) {
      var msg = String((err && err.message) || "");
      if (/already_live/.test(msg)) throw new Error("You already have a live session. End it first.");
      if (/outside_window/.test(msg)) throw new Error("Go live opens 30 minutes before the session starts.");
      if (/times_locked/.test(msg)) throw new Error("Times can't change once a session has gone live or ended.");
      throw new Error("Could not update the session. Try again.");
    });
  }

  /* ---- Tower Go live (Professional pages) --------------------------------------- */

  function viewedProfile() {
    var store = root.CognationTowerProfileStore;
    var p = null;
    try { p = store && store.get ? store.get() : null; } catch (e) { p = null; }
    if (!p) return null;
    var id = String(p._profileId || p.id || "");
    var social = root.CognationSupabaseSocial;
    var userId = p.userId || p.user_id || "";
    if (!userId && social && typeof social.listProfiles === "function") {
      try {
        (social.listProfiles() || []).forEach(function (row) { if (row && row.id === id) userId = row.user_id || ""; });
      } catch (e2) {}
    }
    if (!userId && p._profileId && session() && session().user) {
      /* The signed-in owner's own page: tower.js already decided ownership. */
      var app = root.document && root.document.querySelector("[data-tower-app]");
      if (app && app.getAttribute("data-tower-is-owner") === "true") userId = session().user.id;
    }
    return { id: id, kind: (p._profileKind === "professional" || p.kind === "professional") ? "professional" : "personal",
      userId: userId, handle: p.handle || "", displayName: p.displayName || "" };
  }

  /** Owner's session to take live: the earliest scheduled one that ends in the future
   *  and starts within the next 30 minutes (or already started). */
  function sessionToGoLive(rows, at) {
    at = at == null ? now() : at;
    return sortByStart((rows || []).filter(function (s) {
      return s && s.status === "scheduled" && withinGoLiveWindow(s, at);
    }))[0] || null;
  }

  function liveOwnSession(rows, at) {
    return sortByStart((rows || []).filter(function (s) { return isLiveNow(s, at); }))[0] || null;
  }

  function setGoLiveStatus(text) {
    var doc = root.document;
    var el = doc && doc.querySelector("[data-classroom-golive-status]");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }

  function syncGoLiveButtons() {
    var doc = root.document;
    if (!doc) return;
    var p = viewedProfile();
    var pro = !!(p && p.kind === "professional");
    var live = pro ? liveOwnSession(state.own) : null;
    doc.querySelectorAll("[data-go-live]").forEach(function (btn) {
      if (!pro) { btn.removeAttribute("data-classroom-go-live"); return; }
      btn.setAttribute("data-classroom-go-live", live ? "live" : "ready");
      btn.textContent = live ? "End session" : "Go live";
      btn.setAttribute("aria-label", live ? "End live session" : "Go live");
    });
  }

  /** Called by live-stubs.js before its own Go live. Returns true when handled here. */
  function handleGoLive(btn) {
    var p = viewedProfile();
    if (!p || p.kind !== "professional") return false;
    var viewer = viewerContext();
    if (!ownsProPage(viewer, p)) {
      setGoLiveStatus("Sign in to your Professional page to go live.");
      return true;
    }
    var live = liveOwnSession(state.own);
    if (live) {
      setStatus(p, live, "ended").then(function () {
        setGoLiveStatus("Session ended. It has left ECHO.");
        syncGoLiveButtons();
      }, function (err) { setGoLiveStatus(err.message); });
      return true;
    }
    var next = sessionToGoLive(state.own);
    if (!next) {
      setGoLiveStatus("Book a session first (Edit profile, then Classroom sessions). You can go live up to 30 minutes before it starts.");
      var details = root.document && root.document.querySelector("[data-tower-edit-sessions]");
      if (details) details.open = true;
      return true;
    }
    setStatus(p, next, "live").then(function () {
      setGoLiveStatus("You're live: " + next.title + ". It shows on ECHO and the Cognation Calendar until you end it.");
      syncGoLiveButtons();
    }, function (err) { setGoLiveStatus(err.message); });
    return true;
  }

  /* ---- Join from the calendar: /#classroom-<sessionId> -------------------------- */

  function openFromHash() {
    var loc = root.location;
    var m = loc && /^#classroom-([0-9a-f-]{36})$/i.exec(String(loc.hash || ""));
    if (!m) return false;
    var s = state.rows.filter(function (r) { return r.id === m[1]; })[0];
    if (!s || !isLiveNow(s)) return false;
    var tab = root.document && root.document.getElementById("tab-commune");
    if (tab) tab.click();
    var swipe = root.CognationCommuneSwipe;
    if (swipe && typeof swipe.openLiveSession === "function") swipe.openLiveSession(s.host.id, s.kind);
    return true;
  }

  /* ---- Boot ----------------------------------------------------------------------- */

  function start() {
    if (!root.document || state.timer) return;
    var kick = function () {
      refreshViewerSeed().then(refresh).then(function () {
        var p = viewedProfile();
        return p && p.kind === "professional" ? loadOwn(p.id) : null;
      }).then(function () { syncGoLiveButtons(); openFromHash(); });
    };
    kick();
    state.timer = setInterval(function () {
      if (root.document.visibilityState && root.document.visibilityState !== "visible") return;
      kick();
    }, REFRESH_MS);
    var ownTimer = null;
    var reloadOwn = function () {
      if (ownTimer) clearTimeout(ownTimer);
      ownTimer = setTimeout(function () {
        ownTimer = null;
        var p = viewedProfile();
        (p && p.kind === "professional" ? loadOwn(p.id) : Promise.resolve(state.own = [])).then(function () {
          syncGoLiveButtons();
          emit("cognation:classroom-sessions-updated", { available: state.available });
        });
      }, 150);
    };
    root.document.addEventListener("cognation:tower-profile-updated", reloadOwn);
    root.document.addEventListener("cognation:tower-view-changed", reloadOwn);
    root.document.addEventListener("cognation:session-started", kick);
    root.document.addEventListener("cognation:session-ended", kick);
    root.addEventListener && root.addEventListener("hashchange", openFromHash);
  }

  var api = {
    TABLE: TABLE,
    KINDS: KINDS,
    LENGTHS: LENGTHS,
    LIVE_GRACE_MS: LIVE_GRACE_MS,
    GO_LIVE_EARLY_MS: GO_LIVE_EARLY_MS,
    effectiveStatus: effectiveStatus,
    withinGoLiveWindow: withinGoLiveWindow,
    normalizeRow: normalizeRow,
    isLiveNow: isLiveNow,
    isUpcoming: isUpcoming,
    visibleToViewer: visibleToViewer,
    publicAgenda: publicAgenda,
    groupByDay: groupByDay,
    dayDateLabel: dayDateLabel,
    minutesOf: minutesOf,
    timeLabel: timeLabel,
    zoneLabel: zoneLabel,
    ownsProPage: ownsProPage,
    canSchedule: canSchedule,
    canGoLive: canGoLive,
    canEnd: canEnd,
    nextStatusAllowed: nextStatusAllowed,
    validateBooking: validateBooking,
    livePagesFrom: livePagesFrom,
    sessionToGoLive: sessionToGoLive,
    tableMissing: tableMissing,
    publicQuery: publicQuery,
    viewerContext: viewerContext,
    refresh: refresh,
    loadOwn: loadOwn,
    book: book,
    setStatus: setStatus,
    handleGoLive: handleGoLive,
    syncGoLiveButtons: syncGoLiveButtons,
    viewedProfile: viewedProfile,
    rows: function () { return state.rows.slice(); },
    own: function () { return state.own.slice(); },
    available: function () { return state.available; },
    forHost: function (profileId, at) {
      var viewer = viewerContext();
      return publicAgenda(state.rows, { now: at, viewer: viewer }).filter(function (s) { return s.hostProfileId === String(profileId || ""); });
    },
    agenda: function (filter, at) { return publicAgenda(state.rows, { filter: filter, now: at }); },
    start: start,
  };

  root.CognationClassroomSessions = api;
  /* ECHO's live signal (#193). Live sessions only; nothing live -> empty. */
  root.CognationProLive = {
    livePages: function () { return livePagesFrom(state.rows); },
  };

  if (root.document && !root.__COGNATION_CLASSROOM_NO_BOOT__) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start);
    else start();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
