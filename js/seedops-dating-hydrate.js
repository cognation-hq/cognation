/**
 * SeedOps — server→client hydrate for dating prefs + seed bios.
 *
 * Gap after Commune-alive (#31): datingEnabled / seeDating / city / age lived in
 * localStorage only, and ~79 SeedOps bios on public.profiles were never loaded.
 * This module:
 *   1) Reads viewer prefs from auth user_metadata (fallback: localStorage / seed defaults)
 *   2) Applies them to CognationCommuneSwipe (seeDating + member profile)
 *   3) Fetches seed profiles with nonempty bios and merges into CognationAccounts
 *      (dating opt-in, shared Demo City, SVG avatar) — cap 250, no fleet grow
 *   4) Persists viewer pref changes back to user_metadata when signed in
 *
 * Does not invent dating DB columns. Demo badge / real↛seed friend-block unchanged.
 */
(function () {
  "use strict";

  var LOG_CHANNEL = "dating-hydrate";
  var BOOT_FLAG = "cognation.seedops.datingHydrate.v1";
  var DEMO_CITY = "Demo City";
  var DEMO_STATE = "Demo";
  var DEMO_COUNTRY = "United States";
  var DEMO_AGE = 28;
  var FETCH_LIMIT = 100; /* covers the ~79 enriched bios; hard cap below */
  var HARD_CAP = 250;
  var INTEREST_DEFAULT = ["tech", "mental health", "jobs", "insurance", "gamers"];
  var persistTimer = null;
  /* JSON of the prefs payload the server already has (null = not read yet). */
  var serverPrefsJson = null;
  var persistChain = null;
  /* Failed writes: one retry per changed value per page load, with backoff. */
  var PERSIST_MAX_ATTEMPTS = 2;
  var PERSIST_RETRY_MS = 2000;
  var persistAttempts = {};
  var retryTimer = null;
  var retryJson = "";
  var hydrating = false;
  var ensureInFlight = null;

  function emitLog(payload) {
    if (window.CognationSeedOpsLog && typeof window.CognationSeedOpsLog.write === "function") {
      window.CognationSeedOpsLog.write(LOG_CHANNEL, payload || {});
    }
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:seedops-dating-hydrate", { detail: payload || {} })
      );
    } catch (e) {}
  }

  function readJson(store, key, fallback) {
    try {
      var raw = store.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(store, key, data) {
    try {
      store.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function client() {
    return window.CognationSupabase || null;
  }

  function isConfigured() {
    var sb = client();
    return !!(sb && typeof sb.configured === "function" && sb.configured());
  }

  /* Sage (seed-0248), the under-13 test viewer: no adult seed defaults, no prefs
     writes. See js/seedops-u13-test-viewer.js. False until her data loads. */
  function u13() {
    return window.CognationU13TestViewer || null;
  }
  function isU13TestViewer() {
    var h = u13();
    return !!(h && h.isU13TestViewer());
  }
  function u13Ready() {
    var h = u13();
    return h && typeof h.ready === "function" ? h.ready() : Promise.resolve(false);
  }

  function isSeedOrOpsSession() {
    try {
      if (window.CognationSeedOpsCommuneAlive && typeof window.CognationSeedOpsCommuneAlive.isSeedOrOpsSession === "function") {
        return !!window.CognationSeedOpsCommuneAlive.isSeedOrOpsSession();
      }
    } catch (e) {}
    try {
      var sb = client();
      if (sb && typeof sb.getUser === "function") {
        /* sync session metadata is on CognationAuth / cached user when present */
      }
      var session =
        window.CognationAuth && typeof window.CognationAuth.getSession === "function"
          ? window.CognationAuth.getSession()
          : readJson(localStorage, "cognation.session.v2", null);
      if (!session) return false;
      var uname = String(session.username || session.profileHandle || "");
      if (/^seed-\d{4}$/.test(uname) || /^ops-/.test(uname) || /^seed-/.test(uname)) return true;
      var kind = String(session.accountKind || session.account_kind || "");
      if (kind === "seed" || kind === "ops") return true;
    } catch (e2) {}
    return false;
  }

  function viewerFleetId() {
    try {
      var session =
        window.CognationAuth && typeof window.CognationAuth.getSession === "function"
          ? window.CognationAuth.getSession()
          : readJson(localStorage, "cognation.session.v2", null);
      if (!session) return "";
      var fleet = String(session.seedFleetId || session.seed_fleet_id || "");
      if (/^seed-\d{4}$/.test(fleet) || /^ops-/.test(fleet)) return fleet;
      var uname = String(session.username || "");
      if (/^seed-\d{4}$/.test(uname) || /^ops-/.test(uname)) return uname;
    } catch (e) {}
    return "";
  }

  function svgAvatar(name, idx) {
    var label = String(name || "S").slice(0, 1).toUpperCase();
    var hues = [200, 160, 320, 30, 260, 120, 10, 180];
    var h = hues[Math.abs(Number(idx) || 0) % hues.length];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
      '<rect width="240" height="240" fill="hsl(' +
      h +
      ',42%,42%)"/>' +
      '<text x="120" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="96" fill="#fff">' +
      label +
      "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function prefsFromMetadata(meta) {
    meta = meta || {};
    var age = parseInt(meta.member_age != null ? meta.member_age : meta.memberAge, 10);
    var city = meta.member_city || meta.memberCity || "";
    var state = meta.member_state || meta.memberState || "";
    var country = meta.member_country || meta.memberCountry || "";
    var interests = meta.member_interests || meta.memberInterests || null;
    var seeRaw = meta.see_dating;
    if (seeRaw == null) seeRaw = meta.seeDating;
    var seeDating = null;
    if (seeRaw === true || seeRaw === "1" || seeRaw === 1 || seeRaw === "true") seeDating = true;
    if (seeRaw === false || seeRaw === "0" || seeRaw === 0 || seeRaw === "false") seeDating = false;
    return {
      age: !isNaN(age) && age > 0 ? age : null,
      city: city ? String(city) : "",
      state: state ? String(state) : "",
      country: country ? String(country) : "",
      interests: interests,
      seeDating: seeDating,
      fromServer: !!(
        (seeDating != null) ||
        (age > 0) ||
        city ||
        state ||
        country ||
        interests
      ),
    };
  }

  /* Same shape and key order as prefsPayloadFromLocal(), from auth user_metadata. */
  function prefsPayloadFromMetadata(meta) {
    meta = meta || {};
    var p = prefsFromMetadata(meta);
    var interests = meta.member_interests || meta.memberInterests || null;
    if (Array.isArray(interests)) interests = interests.slice();
    return {
      see_dating: p.seeDating,
      member_age: p.age,
      member_city: p.city,
      member_state: p.state,
      member_country: p.country,
      member_interests: interests,
    };
  }

  function rememberServerPrefs(meta) {
    if (meta) serverPrefsJson = JSON.stringify(prefsPayloadFromMetadata(meta));
  }

  function prefsPayloadFromLocal() {
    var swipe = window.CognationCommuneSwipe;
    var member =
      (swipe && typeof swipe.getMemberProfile === "function" && swipe.getMemberProfile()) ||
      readJson(localStorage, "cognation.member.profile.v1", {}) ||
      {};
    var see =
      swipe && typeof swipe.getSeeDating === "function"
        ? !!swipe.getSeeDating()
        : localStorage.getItem("cognation.commune.seeDating.v1") === "1";
    var interests = member.interests;
    if (Array.isArray(interests)) interests = interests.slice();
    return {
      see_dating: see,
      member_age: parseInt(member.age, 10) || null,
      member_city: String(member.city || member.locality || ""),
      member_state: String(member.state || ""),
      member_country: String(member.country || ""),
      member_interests: interests || null,
    };
  }

  function applyViewerPrefs(prefs, opts) {
    opts = opts || {};
    var swipe = window.CognationCommuneSwipe;
    var next = {};
    var prev =
      (swipe && typeof swipe.getMemberProfile === "function" && swipe.getMemberProfile()) ||
      readJson(localStorage, "cognation.member.profile.v1", {}) ||
      {};
    Object.keys(prev).forEach(function (k) {
      next[k] = prev[k];
    });
    if (prefs.age != null) next.age = prefs.age;
    else if (!(parseInt(next.age, 10) > 0) && opts.seedDefaults) next.age = DEMO_AGE;
    if (prefs.city) {
      next.city = prefs.city;
      next.locality = prefs.city;
    } else if (!next.city && !next.locality && opts.seedDefaults) {
      next.city = DEMO_CITY;
      next.locality = DEMO_CITY;
    }
    if (prefs.state) next.state = prefs.state;
    else if (!next.state && opts.seedDefaults) next.state = DEMO_STATE;
    if (prefs.country) next.country = prefs.country;
    else if (!next.country && opts.seedDefaults) next.country = DEMO_COUNTRY;
    if (prefs.interests != null) next.interests = prefs.interests;
    else if (
      opts.seedDefaults &&
      (!next.interests || (Array.isArray(next.interests) && !next.interests.length))
    ) {
      next.interests = INTEREST_DEFAULT.slice();
    }
    /* seeDating before setMemberProfile — member-profile-updated rebuilds the deck,
       and dating cards must be eligible on that first rebuild (blank Card 1 race). */
    var see = prefs.seeDating;
    if (see == null && opts.seedDefaults) see = true; /* Alexa walk: no console paste */
    if (see != null && swipe && typeof swipe.setSeeDating === "function") {
      swipe.setSeeDating(!!see);
    } else if (see != null) {
      try {
        localStorage.setItem("cognation.commune.seeDating.v1", see ? "1" : "0");
      } catch (e) {}
    }
    if (swipe && typeof swipe.setMemberProfile === "function") {
      swipe.setMemberProfile(next);
    } else {
      writeJson(localStorage, "cognation.member.profile.v1", next);
    }
    return next;
  }

  function enrichDatingRecord(rec, index, viewerFleet, bio) {
    if (!rec || typeof rec !== "object") return rec;
    rec.city = rec.city || DEMO_CITY;
    rec.locality = rec.locality || rec.city || DEMO_CITY;
    rec.state = rec.state || DEMO_STATE;
    rec.country = rec.country || DEMO_COUNTRY;
    var trimmed = bio != null ? String(bio).trim().slice(0, 280) : "";
    if (trimmed) rec.bio = trimmed;
    else if (!String(rec.bio || "").trim()) {
      rec.bio = "Seed demo profile in " + DEMO_CITY + " — open to meeting someone local.";
    } else {
      rec.bio = String(rec.bio).trim().slice(0, 280);
    }
    var fleet = String(rec.seedFleetId || "");
    if (viewerFleet && fleet && fleet === viewerFleet) {
      rec.datingEnabled = false;
      rec.datingContent = false;
      rec.showDatingContent = false;
    } else {
      rec.datingEnabled = true;
      rec.datingContent = true;
      rec.showDatingContent = true;
      rec.datingMinAge = rec.datingMinAge || 18;
    }
    if (!rec.age) rec.age = 22 + (Math.abs(Number(index) || 0) % 20);
    if (!rec.avatarDataUrl && !rec.photo && !rec.avatarUrl) {
      rec.avatarDataUrl = svgAvatar(rec.displayName || "S", index);
    }
    return rec;
  }


  /** True when local profiles already carry dating opt-in + nonempty bios (cap-aware). */
  function datingBiosReady(minCount) {
    minCount = Math.max(1, Number(minCount) || 1);
    var ready = 0;
    function consider(rec) {
      if (!rec) return;
      var opted =
        rec.datingContent === true ||
        rec.datingEnabled === true ||
        rec.showDatingContent === true;
      if (!opted) return;
      if (!String(rec.bio || "").trim()) return;
      ready += 1;
    }
    var doc = readJson(localStorage, "cognation.profiles.v1", null);
    var profiles = doc && doc.profiles ? doc.profiles : {};
    Object.keys(profiles).forEach(function (id) {
      consider(profiles[id]);
    });
    if (ready >= minCount) return true;
    var accounts = window.CognationAccounts;
    if (accounts && typeof accounts.getProfileById === "function") {
      var n;
      for (n = 1; n <= 48 && ready < minCount; n++) {
        var pad = String(n);
        while (pad.length < 4) pad = "0" + pad;
        consider(accounts.getProfileById("prof-seed-" + pad));
      }
    }
    return ready >= minCount;
  }

  /**
   * Ensure dating-flagged bios exist locally. Re-runs server merge when the session
   * cache said ok but profiles were wiped / never enriched (blank dating Card 1).
   */
  function ensureDatingContent(opts) {
    opts = opts || {};
    if (datingBiosReady(opts.minCount)) {
      return Promise.resolve({ ok: true, ready: true, skipped: true });
    }
    if (ensureInFlight) return ensureInFlight;
    var alive = window.CognationSeedOpsCommuneAlive;
    if (alive && typeof alive.materializeDatingSample === "function") {
      try {
        alive.materializeDatingSample(opts.count || 48);
      } catch (eMat) {}
    }
    ensureInFlight = hydrate({ force: true, forceBios: true })
      .then(function (out) {
        if (!datingBiosReady(opts.minCount) && alive && typeof alive.bootstrap === "function") {
          try {
            alive.bootstrap({ force: true });
          } catch (eBoot) {}
        }
        refillDeck();
        return out;
      })
      .then(
        function (out) {
          ensureInFlight = null;
          return out;
        },
        function (err) {
          ensureInFlight = null;
          throw err;
        }
      );
    return ensureInFlight;
  }

  function mergeServerBios(rows) {
    var api = window.CognationSeedOps;
    var accounts = window.CognationAccounts;
    if (!api || typeof api.getByFleetId !== "function") {
      return { ok: false, error: "seedops_unavailable", merged: 0 };
    }
    if (!accounts || typeof accounts.saveProfileRecord !== "function") {
      return { ok: false, error: "accounts_unavailable", merged: 0 };
    }
    var viewer = viewerFleetId();
    var list = Array.isArray(rows) ? rows : [];
    var merged = 0;
    var dating = 0;
    var i;
    for (i = 0; i < list.length && merged < HARD_CAP; i++) {
      var row = list[i];
      if (!row) continue;
      var fleet = String(row.seed_fleet_id || row.seedFleetId || "");
      if (!fleet) continue;
      var base = api.getByFleetId(fleet);
      if (!base) continue;
      var existing =
        (accounts.getProfileById && accounts.getProfileById(base.id)) || base;
      var idx = 0;
      var m = /^seed-(\d{4})$/.exec(fleet);
      if (m) idx = Math.max(0, parseInt(m[1], 10) - 1);
      enrichDatingRecord(existing, idx, viewer, row.bio);
      if (row.id) existing.serverProfileId = String(row.id);
      if (row.display_name && !existing.displayName) {
        existing.displayName = String(row.display_name).slice(0, 80);
      }
      accounts.saveProfileRecord(existing);
      merged += 1;
      if (existing.datingContent) dating += 1;
    }
    return { ok: true, merged: merged, dating: dating };
  }

  function fetchSeedBios() {
    var sb = client();
    if (!sb || typeof sb.rest !== "function") {
      return Promise.reject(new Error("supabase_unavailable"));
    }
    var q =
      "select=id,handle,display_name,bio,account_kind,seed_fleet_id" +
      "&account_kind=eq.seed" +
      "&bio=neq." +
      (u13() ? "&" + u13().LIST_FILTER : "") +
      "&order=seed_fleet_id.asc" +
      "&limit=" +
      Math.min(FETCH_LIMIT, HARD_CAP);
    return sb.rest("profiles", { query: q }).then(function (rows) {
      return Array.isArray(rows) ? rows : [];
    });
  }

  function fetchUserMetadata() {
    var sb = client();
    if (!sb || typeof sb.getUser !== "function") {
      return Promise.resolve(null);
    }
    return sb
      .getUser()
      .then(function (user) {
        if (!user) return null;
        if (u13()) u13().noteUser(user);
        return user.user_metadata || user.userMetadata || null;
      })
      .catch(function () {
        return null;
      });
  }

  function persistPrefs(opts) {
    opts = opts || {};
    var sb = client();
    if (!isConfigured() || !sb || typeof sb.updateUser !== "function") {
      return Promise.resolve({ ok: false, skipped: true, error: "no_update_user" });
    }
    var session = sb.getSession && sb.getSession();
    if (!session || !session.access_token) {
      return Promise.resolve({ ok: false, skipped: true, error: "not_signed_in" });
    }
    /* One write at a time, and only when local prefs differ from what the
       server already has. Each page load fires several hydrates and
       member-profile-updated events; unchanged prefs must not PUT /auth/v1/user. */
    var run = function () {
      return u13Ready().then(function (sage) {
        if (sage) return { ok: true, skipped: true, error: "u13_test_viewer" };
        return runWrite();
      });
    };
    var runWrite = function () {
      var known = serverPrefsJson != null
        ? Promise.resolve(serverPrefsJson)
        : fetchUserMetadata().then(function (meta) { rememberServerPrefs(meta); return serverPrefsJson; });
      return known.then(function (serverJson) {
        if (serverJson == null) return { ok: false, skipped: true, error: "server_prefs_unknown" };
        var payload = prefsPayloadFromLocal();
        var json = JSON.stringify(payload);
        if (json === serverJson) return { ok: true, skipped: true, unchanged: true };
        var tries = persistAttempts[json] || 0;
        if (tries >= PERSIST_MAX_ATTEMPTS) return { ok: false, skipped: true, error: "persist_gave_up" };
        /* A retry for this value is already queued: don't queue or send another. */
        if (retryTimer && retryJson === json) return { ok: false, skipped: true, error: "retry_pending" };
        persistAttempts[json] = tries + 1;
        return sb.updateUser(payload).then(function () {
          serverPrefsJson = json;
          emitLog({ action: "persist", ok: true, payload: payload });
          return { ok: true, payload: payload };
        }, function (err) {
          if (persistAttempts[json] < PERSIST_MAX_ATTEMPTS && !retryTimer) {
            retryJson = json;
            retryTimer = setTimeout(function () {
              retryTimer = null;
              retryJson = "";
              persistPrefs();
            }, PERSIST_RETRY_MS * persistAttempts[json]);
          }
          throw err;
        });
      }).catch(function (err) {
        emitLog({
          action: "persist",
          ok: false,
          error: (err && err.message) || "persist_failed",
        });
        return { ok: false, error: (err && err.message) || "persist_failed" };
      });
    };
    persistChain = (persistChain || Promise.resolve()).then(run, run);
    return persistChain;
  }

  function schedulePersist() {
    if (hydrating) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      persistTimer = null;
      persistPrefs();
    }, 600);
  }

  function refillDeck() {
    var swipe = window.CognationCommuneSwipe;
    if (swipe && typeof swipe.rebuild === "function") {
      try {
        swipe.rebuild();
      } catch (e) {}
    }
  }

  /**
   * Main hydrate. Safe to call repeatedly; sessionStorage caches success unless force.
   */
  function hydrate(opts) {
    opts = opts || {};
    if (!isConfigured() && !opts.forceLocal) {
      return Promise.resolve({ ok: false, error: "supabase_not_configured", skipped: true });
    }
    var prior = readJson(sessionStorage, BOOT_FLAG, null);
    if (prior && prior.ok && !opts.force) {
      var biosOk = datingBiosReady(1);
      /* Cache is only valid when dating bios still live in CognationAccounts.
         Otherwise Card 1 / first dating card paints blank after See dating toggle. */
      if (!biosOk && (isSeedOrOpsSession() || opts.forceBios || prior.seedish)) {
        try {
          sessionStorage.removeItem(BOOT_FLAG);
        } catch (eStale) {}
        prior = null;
      } else {
        /* Re-apply age + seeDating so Classroom/dating gates match last hydrate. */
        var cachedPrefs = { age: prior.memberAge };
        if (prior.seeDating != null) cachedPrefs.seeDating = !!prior.seeDating;
        if (prior.memberAge != null || prior.seeDating != null) {
          applyViewerPrefs(cachedPrefs, { seedDefaults: false });
          refillDeck();
        } else if (isSeedOrOpsSession() && !isU13TestViewer()) {
          applyViewerPrefs({}, { seedDefaults: true });
          refillDeck();
        }
        return Promise.resolve({ ok: true, cached: true, prior: prior, biosReady: biosOk });
      }
    }
    hydrating = true;
    var seedish = isSeedOrOpsSession();
    var sage = false;
    return fetchUserMetadata()
      .then(function (meta) {
        return u13Ready().then(function (isSage) {
          sage = !!isSage;
          return meta;
        });
      })
      .then(function (meta) {
        rememberServerPrefs(meta);
        var prefs = prefsFromMetadata(meta);
        applyViewerPrefs(prefs, { seedDefaults: seedish && !sage });
        if (!seedish && !opts.forceBios) {
          return { ok: true, bios: { ok: true, merged: 0, dating: 0 }, prefs: prefs, seedish: false };
        }
        return fetchSeedBios()
          .then(function (rows) {
            var bios = mergeServerBios(rows);
            return { ok: !!bios.ok, bios: bios, prefs: prefs, seedish: true, fetched: rows.length };
          })
          .catch(function (err) {
            return {
              ok: false,
              bios: { ok: false, error: (err && err.message) || "fetch_failed", merged: 0 },
              prefs: prefs,
              seedish: true,
            };
          });
      })
      .then(function (result) {
        refillDeck();
        var out = {
          ok: !!(result && (result.ok || (result.bios && result.bios.merged > 0))),
          seedish: !!(result && result.seedish),
          merged: result && result.bios && result.bios.merged,
          dating: result && result.bios && result.bios.dating,
          fetched: result && result.fetched,
          seeDating:
            window.CognationCommuneSwipe && window.CognationCommuneSwipe.getSeeDating
              ? !!window.CognationCommuneSwipe.getSeeDating()
              : null,
          memberAge:
            window.CognationCommuneSwipe && window.CognationCommuneSwipe.getMemberAge
              ? window.CognationCommuneSwipe.getMemberAge()
              : null,
          at: new Date().toISOString(),
          error: result && result.bios && result.bios.error,
        };
        /* Prefer ok when prefs applied even if bios fetch empty (already hydrated). */
        if (result && result.prefs) out.ok = true;
        writeJson(sessionStorage, BOOT_FLAG, out);
        emitLog({ action: "hydrate", ok: out.ok, result: out });
        hydrating = false;
        /* Seed defaults should stick server-side so the next device skips
           localStorage. persistPrefs() only writes when they differ from the server. */
        if (seedish && !sage) {
          persistPrefs();
        }
        return out;
      })
      .catch(function (err) {
        hydrating = false;
        var fail = {
          ok: false,
          error: (err && err.message) || "hydrate_failed",
          at: new Date().toISOString(),
        };
        emitLog({ action: "hydrate", ok: false, error: fail.error });
        return fail;
      });
  }

  function boot() {
    function run(force) {
      hydrate({ force: !!force }).then(function () {
        /* no-op; log already emitted */
      });
    }
    setTimeout(function () {
      run(false);
    }, 200);
    document.addEventListener("cognation:session-started", function () {
      try {
        sessionStorage.removeItem(BOOT_FLAG);
      } catch (e) {}
      /* Eager age so Classroom cards / Open session see 18+ before async getUser. */
      if (isSeedOrOpsSession() && !isU13TestViewer()) {
        try {
          applyViewerPrefs({}, { seedDefaults: true });
          refillDeck();
        } catch (eEager) {}
      }
      run(true);
    });
    document.addEventListener("cognation:auth-changed", function () {
      try {
        sessionStorage.removeItem(BOOT_FLAG);
      } catch (e2) {}
      run(true);
    });
    document.addEventListener("cognation:member-profile-updated", function () {
      schedulePersist();
    });
    document.addEventListener("cognation:see-dating-changed", function (ev) {
      schedulePersist();
      var on = !!(ev && ev.detail && ev.detail.seeDating);
      if (!on) return;
      /* Toggle into Dating: refresh bios if cache left profiles empty (blank Card 1). */
      ensureDatingContent({ minCount: 1 }).then(function () {
        refillDeck();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.CognationSeedOpsDatingHydrate = {
    DEMO_CITY: DEMO_CITY,
    DEMO_AGE: DEMO_AGE,
    HARD_CAP: HARD_CAP,
    FETCH_LIMIT: FETCH_LIMIT,
    hydrate: hydrate,
    persistPrefs: persistPrefs,
    mergeServerBios: mergeServerBios,
    prefsFromMetadata: prefsFromMetadata,
    applyViewerPrefs: applyViewerPrefs,
    isSeedOrOpsSession: isSeedOrOpsSession,
    datingBiosReady: datingBiosReady,
    ensureDatingContent: ensureDatingContent,
  };
})();
