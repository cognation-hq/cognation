/**
 * Classroom sessions: RLS-shaped client checks, live gating on ECHO, the public
 * Cognation Calendar (no personal events), and the Tower visitor view.
 * Run: node js/classroom-sessions.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

var HOST = "11111111-1111-4111-8111-111111111111";
var HOST2 = "22222222-2222-4222-8222-222222222222";
var SEED_HOST = "33333333-3333-4333-8333-333333333333";
var PERSONAL = "44444444-4444-4444-8444-444444444444";
var OWNER_UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var OTHER_UID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var NOW = Date.parse("2026-10-20T19:45:00-05:00");
var MIN = 60000;

/* Pinned clock: the fixtures are built around NOW, and the code under test reads
   Date.now() / new Date(). Without this the test starts failing once the real clock
   passes the fixture sessions. Every module here (and the vm windows below, which get
   `Date: Date`) sees this pinned Date. Explicit arguments behave exactly as before. */
var RealDate = Date;
function PinnedDate() {
  var args = Array.prototype.slice.call(arguments);
  if (!(this instanceof PinnedDate)) return new RealDate(NOW).toString();
  return args.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(args)))() : new RealDate(NOW);
}
PinnedDate.prototype = RealDate.prototype;
PinnedDate.now = function () { return NOW; };
PinnedDate.parse = RealDate.parse;
PinnedDate.UTC = RealDate.UTC;
global.Date = PinnedDate;
assert.strictEqual(Date.now(), NOW, "clock pinned");
assert.strictEqual(new Date().getTime(), NOW, "new Date() pinned");
assert.ok(new Date(0) instanceof RealDate && new Date(0).getTime() === 0, "explicit dates unchanged");

function host(id, opts) {
  opts = opts || {};
  return { id: id, handle: opts.handle || "host-" + id.slice(0, 4), display_name: opts.name || "Host " + id.slice(0, 4),
    kind: opts.kind || "professional", account_kind: opts.accountKind || "real", photo_url: null, user_id: opts.uid || "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
}
function row(id, hostRow, opts) {
  opts = opts || {};
  var start = NOW + (opts.startMin == null ? 60 : opts.startMin) * MIN;
  return { id: id, host_profile_id: hostRow.id, title: opts.title || "Session " + id.slice(0, 4), kind: opts.kind || "classroom",
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + (opts.len || 60) * MIN).toISOString(),
    status: opts.status || "scheduled", rating: opts.rating || "PG-13", host: hostRow };
}
function sid(n) { return "c0000000-0000-4000-8000-00000000000" + n; }

/* Loads classroom-sessions.js (+ optionally the ECHO deck) in one window with a fake server. */
function loadAll(opts) {
  opts = opts || {};
  var serverRows = opts.rows || [];
  var calls = [];
  var win = { __COGNATION_CLASSROOM_NO_BOOT__: true };
  win.CognationSupabase = opts.noSupabase ? undefined : {
    configured: function () { return true; },
    getSession: function () { return opts.uid ? { user: { id: opts.uid } } : null; },
    rest: function (table, o) {
      calls.push({ table: table, o: o });
      if (opts.missing) { var e = new Error("relation does not exist"); e.status = 404; e.code = "PGRST205"; return Promise.reject(e); }
      return Promise.resolve(JSON.parse(JSON.stringify(serverRows)));
    },
    rpc: function () { return Promise.resolve(!!opts.viewerSeed); },
  };
  win.CognationAgeFloor = { viewerAge: function () { return opts.age == null ? 30 : opts.age; },
    ratingIsGPG: function (r) { return r === "G" || r === "PG"; } };
  win.CognationDatingFlag = { enabled: function () { return true; } };
  var local = memoryStorage();
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: opts.age == null ? 30 : opts.age, interests: [] }));
  var docListeners = {};
  var context = vm.createContext({
    window: win,
    document: {
      readyState: "complete",
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function (n, fn) { (docListeners[n] = docListeners[n] || []).push(fn); },
      dispatchEvent: function (ev) { (docListeners[ev.type] || []).forEach(function (fn) { fn(ev); }); },
      getElementById: function () { return null; },
    },
    localStorage: local, sessionStorage: memoryStorage(), console: console,
    CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval,
    isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Intl: Intl, Promise: Promise,
    Object: Object, Array: Array, String: String, Number: Number,
  });
  context.window = win;
  Object.keys(context).forEach(function (k) { if (!(k in win)) win[k] = context[k]; });
  win.document = context.document;
  vm.runInContext("var window = this.window;", context);
  vm.runInContext(src("js/classroom-sessions.js").replace("(typeof window !== \"undefined\" ? window : this)", "(window)"), context);
  if (opts.swipe) {
    vm.runInContext(src("js/commune-swipe.js"), context);
    win.CognationCommuneSwipe.setDatingBirthAge(opts.age == null ? 30 : opts.age);
  }
  if (opts.calendar) vm.runInContext(src("js/cognation-calendar.js").replace("(typeof window !== \"undefined\" ? window : this)", "(window)"), context);
  if (opts.tower) vm.runInContext(src("js/tower-classroom-sessions.js").replace("(typeof window !== \"undefined\" ? window : this)", "(window)"), context);
  return { win: win, api: win.CognationClassroomSessions, calls: calls, setRows: function (r) { serverRows = r; } };
}

(async function () {
  var A = loadAll().api;

  /* ---- RLS-shaped client checks --------------------------------------------------- */
  var owner = { userId: OWNER_UID };
  var proPage = { id: HOST, kind: "professional", userId: OWNER_UID };
  assert.strictEqual(A.canSchedule(owner, proPage), true, "owner books on their Professional page");
  assert.strictEqual(A.canSchedule({ userId: OTHER_UID }, proPage), false, "someone else cannot book on it");
  assert.strictEqual(A.canSchedule({ userId: "" }, proPage), false, "signed out cannot book");
  assert.strictEqual(A.canSchedule(owner, { id: PERSONAL, kind: "personal", userId: OWNER_UID }), false, "never on a personal page");
  assert.strictEqual(A.canSchedule(owner, { id: "prof-alexa-professional", kind: "professional", userId: OWNER_UID }), false, "local demo record is not a server page");
  var sched = A.normalizeRow(row(sid(1), host(HOST, { uid: OWNER_UID })));
  var other = A.normalizeRow(row(sid(2), host(HOST2), { status: "live" }));
  /* sched starts at NOW + 60 min; Go live opens 30 min before start (NOW + 30 min). */
  var GO_LIVE_AT = NOW + 30 * MIN;
  assert.strictEqual(A.canGoLive(owner, proPage, sched, [sched], GO_LIVE_AT), true, "host goes live on own scheduled session");
  assert.strictEqual(A.canGoLive({ userId: OTHER_UID }, proPage, sched, [sched], GO_LIVE_AT), false, "only the host");
  assert.strictEqual(A.canGoLive(owner, { id: HOST, kind: "personal", userId: OWNER_UID }, sched, [sched], GO_LIVE_AT), false, "only a Professional page");
  var liveOwn = A.normalizeRow(row(sid(3), host(HOST, { uid: OWNER_UID }), { status: "live" }));
  assert.strictEqual(A.canGoLive(owner, proPage, sched, [sched, liveOwn], GO_LIVE_AT), false, "one live session per host");
  assert.strictEqual(A.canGoLive(owner, proPage, other, [other], GO_LIVE_AT), false, "not another host's session");
  assert.strictEqual(A.canGoLive(owner, proPage, sched, [sched], NOW), false, "at NOW (60 min early) Go live is still closed");
  assert.strictEqual(A.canEnd(owner, proPage, liveOwn), true, "host ends own live session");
  assert.strictEqual(A.canEnd({ userId: OTHER_UID }, proPage, liveOwn), false, "only the host ends it");
  [["scheduled", "live", true], ["scheduled", "ended", true], ["live", "ended", true],
   ["live", "scheduled", false], ["ended", "live", false], ["ended", "scheduled", false]].forEach(function (c) {
    assert.strictEqual(A.nextStatusAllowed(c[0], c[1]), c[2], c[0] + " -> " + c[1]);
  });
  var ok = A.validateBooking({ title: " Budgeting basics ", kind: "webinar", date: "2026-10-21", time: "18:00", minutes: "45" }, NOW);
  assert.ok(ok.ok, "valid booking");
  assert.strictEqual(ok.row.title, "Budgeting basics");
  assert.strictEqual((Date.parse(ok.row.ends_at) - Date.parse(ok.row.starts_at)) / MIN, 45, "length saved as ends_at");
  assert.deepStrictEqual(Object.keys(ok.row).sort(), ["ends_at", "kind", "starts_at", "title"], "client never sends status or host user");
  assert.strictEqual(A.validateBooking({ title: "", kind: "classroom", date: "2026-10-21", time: "18:00", minutes: 60 }, NOW).ok, false);
  assert.strictEqual(A.validateBooking({ title: "x", kind: "party", date: "2026-10-21", time: "18:00", minutes: 60 }, NOW).ok, false);
  assert.strictEqual(A.validateBooking({ title: "x", kind: "classroom", date: "2026-10-19", time: "18:00", minutes: 60 }, NOW).ok, false, "no past times");
  assert.strictEqual(A.validateBooking({ title: "x", kind: "classroom", date: "2026-10-21", time: "18:00", minutes: 300 }, NOW).ok, false, "max 4 hours");

  /* Visibility mirrors the read policy. */
  var realViewer = { userId: OTHER_UID, isSeed: false, age: 30 };
  var seedRow = A.normalizeRow(row(sid(4), host(SEED_HOST, { accountKind: "seed" })));
  assert.strictEqual(A.visibleToViewer(seedRow, realViewer), false, "seed host hidden from real viewers");
  assert.strictEqual(A.visibleToViewer(seedRow, { userId: OTHER_UID, isSeed: true, age: 30 }), true, "seeds see seeds");
  var pg13 = A.normalizeRow(row(sid(5), host(HOST2)));
  assert.strictEqual(A.visibleToViewer(pg13, { userId: OTHER_UID, age: 12 }), false, "under-13: G/PG only");
  assert.strictEqual(A.visibleToViewer(A.normalizeRow(row(sid(6), host(HOST2), { rating: "PG" })), { userId: OTHER_UID, age: 12 }), true);
  assert.strictEqual(A.visibleToViewer(A.normalizeRow(row(sid(7), host(PERSONAL, { kind: "personal" }))), realViewer), false, "personal page never hosts");
  assert.strictEqual(A.visibleToViewer(A.normalizeRow(row(sid(8), host(HOST2), { status: "ended" })), realViewer), false, "ended is not public");

  /* ---- Live gating: live shows on ECHO, ended removes ----------------------------- */
  var realNow = Date.now;
  Date.now = function () { return NOW; };
  try {
    var liveRows = [
      row(sid(1), host(HOST, { name: "Ada", handle: "ada-pro" }), { status: "live", startMin: -15, title: "Budgeting basics" }),
      row(sid(2), host(HOST2, { name: "Bo", handle: "bo-pro" }), { status: "scheduled", startMin: 120 }),
      row(sid(3), host(SEED_HOST, { accountKind: "seed" }), { status: "live", startMin: -5 }),
    ];
    var w = loadAll({ rows: liveRows, swipe: true, uid: OTHER_UID });
    await w.api.refresh();
    var pages = w.win.CognationProLive.livePages();
    assert.strictEqual(pages.length, 1, "only the real live host (seed hidden from a real viewer, scheduled not live)");
    assert.strictEqual(pages[0].profileId, HOST);
    assert.strictEqual(pages[0].sessionKind, "classroom");
    var swipe = w.win.CognationCommuneSwipe;
    var cards = swipe.classroomCatalog();
    assert.strictEqual(cards.length, 1, "live Classroom card on ECHO");
    assert.strictEqual(cards[0].title, "Budgeting basics");
    assert.strictEqual(cards[0].handle, "ada-pro", "host link goes to their Tower");
    assert.strictEqual(swipe.liveWebinarCards().length, 0, "a Classroom session is not a Webinar card");
    var html = swipe.liveSessionCardHtml(cards[0]);
    assert.ok(/cgn-live-pill[^>]*>.*LIVE/.test(html), "LIVE pill");
    assert.ok(/href="#tower-profile-ada-pro"/.test(html), "host link to Tower");
    assert.ok(/Join quietly · camera and mic off/.test(html), "silent join");
    assert.ok(/Leaves ECHO when the session ends/.test(html), "leaves ECHO line");
    assert.ok(!/Remind me/i.test(html));
    var deck = swipe.paceDeck({ classroom: swipe.visibleClassroomSessions(), ad: [{ id: "a1" }], chatroom: [{ id: "c1" }], fact: [{ id: "f1" }] }, [], 12);
    assert.ok(deck.some(function (c) { return c.type === "classroom" && c.live; }), "live card in the 1:1 mix");

    /* Webinar session -> Professional deck Webinar card only. */
    var web = loadAll({ rows: [row(sid(4), host(HOST2, { name: "Bo", handle: "bo-pro" }), { status: "live", kind: "webinar", startMin: -1, rating: "PG" })], swipe: true, uid: OTHER_UID });
    await web.api.refresh();
    assert.strictEqual(web.win.CognationCommuneSwipe.classroomCatalog().length, 0);
    assert.strictEqual(web.win.CognationCommuneSwipe.liveWebinarCards().length, 1, "live Webinar card");

    /* Host presses End: status ended -> the card comes down. */
    liveRows[0].status = "ended";
    w.setRows(liveRows);
    await w.api.refresh();
    assert.strictEqual(w.win.CognationProLive.livePages().length, 0, "ended removes");
    assert.strictEqual(swipe.classroomCatalog().length, 0, "ECHO card removed once ended");

    /* A live row long past its booked end (host never pressed End) stops counting. */
    var stale = A.normalizeRow(row(sid(9), host(HOST), { status: "live", startMin: -240, len: 60 }));
    assert.strictEqual(A.isLiveNow(stale, NOW), false, "stale live row drops after the grace window");

    /* Table not set up yet: nothing live, nothing listed, quiet. */
    var missing = loadAll({ missing: true, swipe: true, calendar: true });
    await missing.api.refresh();
    assert.strictEqual(missing.api.available(), false);
    assert.strictEqual(missing.win.CognationProLive.livePages().length, 0);
    assert.ok(/data-cal-empty/.test(missing.win.CognationCalendarPage.renderAgendaHtml(missing.api.agenda("all"), {})), "calendar empty state");
    var none = loadAll({ noSupabase: true });
    await none.api.refresh();
    assert.strictEqual(none.win.CognationProLive.livePages().length, 0, "no sign-in config: nothing live");

    /* ---- Public Cognation Calendar: sessions only, never personal events ---------- */
    var calRows = [
      row(sid(1), host(HOST, { name: "Ada", handle: "ada-pro" }), { status: "live", startMin: -15, title: "Budgeting basics" }),
      row(sid(2), host(HOST2, { name: "Bo", handle: "bo-pro" }), { kind: "webinar", startMin: 75, title: "Async work" }),
      row(sid(3), host(HOST2), { status: "ended", startMin: -120, title: "Old one" }),
      row(sid(5), host(PERSONAL, { kind: "personal" }), { title: "Coffee with Jordan" }),
      row(sid(6), host(SEED_HOST, { accountKind: "seed" }), { title: "Seed class" }),
    ];
    var c = loadAll({ rows: calRows, calendar: true, uid: OTHER_UID });
    await c.api.refresh();
    var all = c.api.agenda("all");
    assert.deepStrictEqual(all.map(function (s) { return s.title; }), ["Budgeting basics", "Async work"], "live + upcoming, public, real hosts only");
    assert.deepStrictEqual(c.api.agenda("webinar").map(function (s) { return s.title; }), ["Async work"], "Webinar chip");
    assert.deepStrictEqual(c.api.agenda("classroom").map(function (s) { return s.title; }), ["Budgeting basics"], "Classroom chip");
    var page = c.win.CognationCalendarPage.renderAgendaHtml(all, { now: NOW });
    assert.ok(/Today/.test(page) && /Budgeting basics/.test(page) && /Async work/.test(page));
    assert.strictEqual((page.match(/data-cal-join/g) || []).length, 1, "Join only on the live row");
    assert.ok(/href="\/#tower-profile-ada-pro"/.test(page) && /View Tower/.test(page), "host link to Tower");
    assert.ok(!/Coffee with Jordan|Old one|Seed class/.test(page), "no personal events, ended or seed rows");
    assert.ok(!/Remind me/i.test(page), "no Remind me");
    var query = c.calls[0].o.query;
    assert.ok(/^select=/.test(query) && /status\.eq\.live/.test(query) && /status\.eq\.scheduled/.test(query), "reads scheduled + live only");
    assert.strictEqual(c.calls[0].table, "classroom_sessions", "reads only the sessions table");
    assert.ok(/All[\s\S]*Classroom[\s\S]*Webinar/.test(c.win.CognationCalendarPage.filtersHtml("all")), "filter chips");
    var calSrc = src("js/cognation-calendar.js") + src("js/classroom-sessions.js");
    assert.ok(!/calendarEvents/.test(calSrc), "calendar code never reads personal calendar events");

    /* ---- Tower visitor view: this host's public sessions only --------------------- */
    var forHost = c.api.forHost(HOST2);
    assert.deepStrictEqual(forHost.map(function (s) { return s.title; }), ["Async work"], "only this host, only public (no ended)");
    assert.deepStrictEqual(c.api.forHost(PERSONAL), [], "personal page lists no sessions");
    var towerSrc = src("js/tower.js");
    var vis = towerSrc.slice(towerSrc.indexOf("function renderVisitorCalendar"), towerSrc.indexOf("function refreshTowerCalendars"));
    assert.ok(/busyBlocksOnly\(sharedCalendarEvents\(p\)/.test(vis), "personal events stay busy-only for visitors");
    assert.ok(/isTowerOwner\(p\)\)[\s\S]{0,60}box\.hidden = true/.test(vis), "owner does not get the visitor view");
    assert.ok(/api\.forHost\(/.test(vis), "visitor sees the host's public sessions");
    assert.ok(!/ownerControls: true/.test(vis), "no owner controls for visitors");

    /* Owner booking form. */
    var t = loadAll({ tower: true });
    var form = t.win.CognationTowerClassroomSessions.ownerHtml({ canBook: true, rows: [] });
    assert.ok(/name="title"/.test(form) && /type="date"/.test(form) && /type="time"/.test(form) && /name="minutes"/.test(form), "title, date/time, length");
    assert.ok(/value="classroom"/.test(form) && /value="webinar"/.test(form), "Classroom or Webinar");
    assert.ok(/No sessions booked yet/.test(form));
    assert.ok(/disabled/.test(t.win.CognationTowerClassroomSessions.ownerHtml({ canBook: false })), "not signed in: form disabled");
  } finally {
    Date.now = realNow;
  }

  /* ---- Removals + rules ------------------------------------------------------------ */
  var stubs = src("js/live-stubs.js");
  assert.ok(!/function echoCard/.test(stubs) && !/echoCard:/.test(stubs), "live-stubs 'X is live' ECHO card removed");
  assert.ok(!/data-live-share-echo/.test(src("index.html")), "Share to Echo removed");
  assert.ok(!/CognationLive\.echoCard/.test(src("js/commune-swipe.js")), "ECHO no longer injects the stub card");
  assert.ok(/sessions\.handleGoLive\(btn\)/.test(stubs), "Go live on a Professional page sets the server session live");
  var cal = src("calendar.html");
  assert.ok(/<h1[^>]*>Cognation Calendar<\/h1>/.test(cal), "exact name: Cognation Calendar");
  assert.ok(!/Remind me|Demo|local only/i.test(cal + src("js/cognation-calendar.js")), "no Remind me, no demo banners");
  var mine = src("js/classroom-sessions.js") + src("js/cognation-calendar.js") + src("js/tower-classroom-sessions.js");
  assert.ok(!/localStorage/.test(mine), "no browser-storage stand-ins");
  var sql = src("supabase/migrations/20261020_classroom_sessions.sql");
  ["classroom sessions public read", "classroom sessions host reads own", "classroom sessions host books", "classroom sessions host updates"].forEach(function (n) {
    assert.ok(sql.indexOf('create policy "' + n + '"') !== -1, "policy " + n);
  });
  assert.ok(/cognation_classroom_session_status\(status, ends_at\) in \('scheduled', 'live'\)/.test(sql), "public read: scheduled + live (stale live counts as ended)");
  assert.ok(/with check \(status = 'scheduled' and public\.cognation_owns_pro_profile/.test(sql), "book as scheduled, own Pro page only");
  assert.ok(/p\.kind = 'professional'/.test(sql) && /classroom_session_already_live/.test(sql), "go-live: Professional page, one at a time");
  assert.ok(!/calendar_events|calendarEvents/.test(sql), "personal events are not in the table");
  var css = src("css/styles.css");
  var tail = css.slice(css.indexOf("Classroom sessions + public Cognation Calendar"));
  assert.ok(!/#ED9300|yellow/i.test(tail), "no yellow / amber in the new styles");

  /* ---- Designer nits (#194): visitor day heading + live card JOIN spacing -------- */
  var tsrc = src("js/tower.js");
  function sliceFn(name) {
    var i = tsrc.indexOf("function " + name + "(");
    assert.ok(i !== -1, name + " exists");
    var depth = 0, j = tsrc.indexOf("{", i);
    for (var k = j; k < tsrc.length; k++) {
      if (tsrc[k] === "{") depth++;
      else if (tsrc[k] === "}" && --depth === 0) return tsrc.slice(i, k + 1);
    }
  }
  var csApi = { dayDateLabel: function (key) {
    var d = new Date(String(key) + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } };
  var headingBox = { window: { CognationClassroomSessions: csApi } };
  vm.runInNewContext(sliceFn("eventsForDate") + "\n" + sliceFn("visitorDayHeading") + "\nthis.h = visitorDayHeading;", headingBox);
  var oct20 = csApi.dayDateLabel("2026-10-20");
  assert.strictEqual(oct20, "Tue, Oct 20", "Cognation Calendar date format");
  assert.strictEqual(headingBox.h([], "2026-10-20"), "Tue, Oct 20", "no event: no Busy, readable date");
  assert.strictEqual(headingBox.h([{ date: "2026-10-21", busy: true }], "2026-10-20"), "Tue, Oct 20", "event on another day: no Busy");
  assert.strictEqual(headingBox.h([{ date: "2026-10-20", busy: true }], "2026-10-20"), "Busy · Tue, Oct 20", "event that day: Busy");
  assert.ok(!/2026-10-20/.test(headingBox.h([{ date: "2026-10-20" }], "2026-10-20")), "never the raw ISO date");
  headingBox.window.CognationClassroomSessions = null;
  assert.strictEqual(headingBox.h([], "2026-10-20"), "Tue, Oct 20", "same format without the sessions module");
  var visSrc = sliceFn("renderVisitorCalendar");
  assert.ok(/visitorDayHeading\(events, view\.selected\)/.test(visSrc) && !/"Busy · " \+ escapeHtml\(view\.selected\)/.test(visSrc), "visitor heading uses the helper");
  var realCs = loadAll({});
  assert.strictEqual(realCs.api.dayDateLabel("2026-10-20"), "Tue, Oct 20", "shared helper in classroom-sessions.js");
  var joinRule = tail.match(/\.commune-card--live-session \.commune-live-join \{[^}]*\}/);
  assert.ok(joinRule && /margin-top: 8px !important/.test(joinRule[0]) && !/margin-top: auto/.test(joinRule[0]), "JOIN sits 8px margin + 8px gap (~16px) under Open seats");
  assert.ok(/\.commune-card--live-session \{[^}]*gap: 0\.5rem/.test(tail), "card gap .5rem");
  assert.ok(/\.commune-card--live-session \.commune-live-foot \{ margin-top: auto !important; \}/.test(tail), "spare space goes above the foot line, not above JOIN");

  /* ---- PM SQL ruling (#194): auto-stop, go-live window, time lock ---------------- */
  var sql2 = src("supabase/migrations/20261020_classroom_sessions.sql");
  var flat = sql2.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
  // (a) 60-minute auto-stop is real in the DB, no cron.
  assert.ok(/create or replace function public\.cognation_classroom_session_status\(p_status text, p_ends_at timestamptz\)/.test(flat), "(a) effective-status helper");
  assert.ok(/when p_status = 'live' and now\(\) > p_ends_at \+ interval '60 minutes' then 'ended'/.test(flat), "(a) live + now() > ends_at + 60 min counts as ended");
  var readPol = flat.slice(flat.indexOf('create policy "classroom sessions public read"'), flat.indexOf('drop policy if exists "classroom sessions host reads own"'));
  assert.ok(/using \( public\.cognation_classroom_session_status\(status, ends_at\) in \('scheduled', 'live'\)/.test(readPol), "(a) public read treats stale live as ended");
  assert.ok(!/using \( status in/.test(readPol), "(a) public read no longer trusts raw status");
  var guard = flat.slice(flat.indexOf("create or replace function public.classroom_sessions_guard()"), flat.indexOf("drop trigger if exists classroom_sessions_guard"));
  assert.ok(/update public\.classroom_sessions s set status = 'ended' where s\.host_profile_id = new\.host_profile_id and s\.status = 'live' and s\.id <> new\.id and now\(\) > s\.ends_at \+ interval '60 minutes';/.test(guard), "(a) go live first ends this host's stale live rows");
  var endIdx = guard.indexOf("set status = 'ended'"), liveIdx = guard.indexOf("classroom_session_already_live");
  assert.ok(endIdx !== -1 && endIdx < liveIdx, "(a) stale rows ended before the one-live check");
  assert.ok(/public\.cognation_classroom_session_status\(s\.status, s\.ends_at\) = 'live' \) then raise exception 'classroom_session_already_live'/.test(guard), "(a) one-live-per-host ignores stale rows");
  assert.ok(!/cron|pg_cron|schedule\(/i.test(flat), "(a) no cron or scheduler");
  // (b) go-live window.
  assert.ok(/if now\(\) < new\.starts_at - interval '30 minutes' or now\(\) > new\.ends_at then raise exception 'classroom_session_outside_window';/.test(guard), "(b) scheduled -> live only 30 min before start through end");
  assert.ok(guard.indexOf("classroom_session_outside_window") > guard.indexOf("if new.status = 'live' and (tg_op = 'INSERT' or old.status <> 'live')"), "(b) window applies on the move to live");
  // (c) times lock.
  assert.ok(/if \(old\.status <> 'scheduled' or new\.status <> 'scheduled'\) and \(new\.starts_at <> old\.starts_at or new\.ends_at <> old\.ends_at\) then raise exception 'classroom_session_times_locked';/.test(guard), "(c) starts_at / ends_at locked once not scheduled");
  // Client mirrors the same rules.
  var cl = loadAll({}).api;
  var T0 = Date.UTC(2026, 9, 21, 15, 0);
  var P1 = "11111111-2222-4333-8444-555555555555";
  var sch = { id: "s1", hostProfileId: P1, status: "scheduled", startsAt: T0, endsAt: T0 + 3600000 };
  assert.strictEqual(cl.GO_LIVE_EARLY_MS, 30 * 60000);
  assert.ok(!cl.withinGoLiveWindow(sch, T0 - 31 * 60000), "(b) client: 31 min early is closed");
  assert.ok(cl.withinGoLiveWindow(sch, T0 - 30 * 60000), "(b) client: 30 min early opens");
  assert.ok(cl.withinGoLiveWindow(sch, T0 + 3600000), "(b) client: open through ends_at");
  assert.ok(!cl.withinGoLiveWindow(sch, T0 + 3600001), "(b) client: closed after ends_at");
  assert.strictEqual(cl.sessionToGoLive([sch], T0 + 3600001), null, "(b) client: Go live won't pick a session past its end");
  var liveRow = { id: "s0", hostProfileId: P1, status: "live", startsAt: T0 - 3 * 3600000, endsAt: T0 - 2 * 3600000 };
  assert.strictEqual(cl.effectiveStatus(liveRow, T0 - 2 * 3600000 + 59 * 60000), "live", "(a) client: inside 60 min still live");
  assert.strictEqual(cl.effectiveStatus(liveRow, T0), "ended", "(a) client: past ends_at + 60 min is ended");
  var ownerView = { userId: "u1", signedIn: true };
  var proPage = { id: P1, kind: "professional", userId: "u1", user_id: "u1" };
  assert.ok(cl.ownsProPage(ownerView, proPage), "fixture owner owns the Pro page");
  {
    assert.ok(cl.canGoLive(ownerView, proPage, sch, [liveRow], T0), "(a) client: stale live row does not block Go live");
    assert.ok(!cl.canGoLive(ownerView, proPage, sch, [Object.assign({}, liveRow, { endsAt: T0 + 600000 })], T0), "(a) client: a real live row blocks");
    assert.ok(!cl.canGoLive(ownerView, proPage, sch, [], T0 - 45 * 60000), "(b) client: too early");
  }
  var clSrc = src("js/classroom-sessions.js");
  assert.ok(/body: \{ status: status \}/.test(clSrc), "(c) client never patches times on a status change");
  assert.ok(/outside_window/.test(clSrc) && /times_locked/.test(clSrc), "server errors mapped to plain messages");
  console.log("classroom-sessions ok");
})().catch(function (e) { console.error(e); process.exit(1); });
