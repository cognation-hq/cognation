/**
 * ECHO Classroom card: only while a Professional page is actually live, from the real
 * Go live state (a classroom_sessions row with status 'live', inside its window:
 * ends_at + 60 min). Never from scheduled rows, demo/sample cards, the browser-only
 * Go live stub, or a browser-local Classroom event (Tower Add event -> Classroom pill,
 * localStorage cognation.classroom.event.v1, #257).
 *
 * Real commune-swipe.js, classroom-sessions.js and classroom-event.js in a vm with
 * in-memory storage. Nothing leaves the process.
 * Run: node --test js/echo-classroom-real-live.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

/* ECL_ROOT lets the same test run against another checkout (fail-on-base). */
var root = process.env.ECL_ROOT ? path.resolve(process.env.ECL_ROOT) : path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

var VIEWER_ID = ["u", "viewer"].join("-");
var HOST = { id: "11111111-1111-4111-8111-111111111111", handle: "ada-pro", display_name: "Ada", kind: "professional", account_kind: "real" };
var NOW = Date.parse("2026-10-30T15:00:00Z");
var MIN = 60000;

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

/* One page: the real classroom-event.js (local events) and the real ProLive signal
   from classroom-sessions.js fed with `rows`, then the real ECHO deck. */
function page(opts) {
  opts = opts || {};
  var local = memoryStorage();
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: [] }));
  var doc = {
    readyState: "complete",
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    dispatchEvent: function () { return true; },
  };
  var win = {
    localStorage: local, sessionStorage: memoryStorage(), document: doc,
    location: { hash: "", href: "https://cognation.test/", pathname: "/", search: "" },
    addEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationSupabase: { getSession: function () { return { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } }; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: local, sessionStorage: win.sessionStorage,
    location: win.location, console: console, CustomEvent: win.CustomEvent,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
  });
  vm.runInContext(src("js/classroom-event.js"), ctx);
  (opts.localEvents || []).forEach(function (ev) { win.CognationClassroomEvent.publish(ev); });
  if (opts.rows) {
    /* The real live signal shape (classroom-sessions.js livePagesFrom), clock pinned. */
    var cs = vm.createContext({ window: {}, console: console });
    cs.window.window = cs.window;
    vm.runInContext(src("js/classroom-sessions.js"), cs); /* no document: no boot, no fetch */
    var S = cs.window.CognationClassroomSessions;
    var rows = opts.rows.map(S.normalizeRow).filter(Boolean);
    win.CognationProLive = { livePages: function () { return S.livePagesFrom(rows, { now: NOW, viewer: { userId: VIEWER_ID, isSeed: false, age: 30 } }); } };
  }
  if (opts.goLiveStub) win.CognationLive = { echoCard: function () { return { id: "live-echo-share", type: "live" }; } };
  vm.runInContext(src("js/commune-swipe.js"), ctx);
  var api = win.CognationCommuneSwipe;
  api.setDatingBirthAge(30);
  return api;
}

function row(status, startOffMin, lenMin, extra) {
  var s = NOW + startOffMin * MIN;
  return Object.assign({
    id: "s-" + status + "-" + startOffMin, host_profile_id: HOST.id, title: "Budgeting basics", kind: "classroom",
    starts_at: new Date(s).toISOString(), ends_at: new Date(s + lenMin * MIN).toISOString(), status: status, rating: "PG-13", host: HOST,
  }, extra || {});
}
/* Copy out of the vm realm so deepStrictEqual compares plain arrays. */
function classrooms(api) { return JSON.parse(JSON.stringify(api.visibleClassroomSessions())); }
function deckClassrooms(api) {
  var lanes = { classroom: api.visibleClassroomSessions(), ad: [{ id: "a1", title: "Ad" }], chatroom: [{ id: "c1", title: "Room" }], fact: [{ id: "f1", title: "Fact" }], friend: [], event: [], know: [] };
  return api.paceDeck(lanes, [{ id: "d1" }], 20).filter(function (c) { return c.type === "classroom"; });
}
var TODAY = new Date(NOW).toISOString().slice(0, 10);

test("a browser-local Classroom event (Tower Add event, Classroom pill) never makes an ECHO Classroom card", function () {
  var api = page({ localEvents: [{ title: "Life skills", date: TODAY, time: "10:00" }, { title: "Next week", date: "2026-11-06", time: "18:00" }] });
  assert.deepStrictEqual(classrooms(api).map(function (c) { return c.id; }), [], "no card from local events");
  assert.strictEqual(deckClassrooms(api).length, 0, "no Classroom slot in the deck");
});

test("a local Classroom event next to a real live session: only the live session's card", function () {
  var api = page({ localEvents: [{ title: "Life skills", date: TODAY, time: "10:00" }], rows: [row("live", -10, 60)] });
  var ids = classrooms(api).map(function (c) { return c.id; });
  assert.deepStrictEqual(ids, ["class-live-" + HOST.id]);
  assert.strictEqual(classrooms(api)[0].live, true);
});

test("scheduled rows (even inside the Go live window) and ended rows make no card", function () {
  var api = page({ rows: [row("scheduled", 10, 60), row("scheduled", -5, 60, { id: "s2" }), row("ended", -30, 60)] });
  assert.strictEqual(classrooms(api).length, 0);
});

test("a live row shows while live and stops 60 min after ends_at (the server auto-stop)", function () {
  assert.strictEqual(classrooms(page({ rows: [row("live", -10, 60)] })).length, 1, "live now: one card");
  assert.strictEqual(classrooms(page({ rows: [row("live", -120, 61)] })).length, 1, "59 min past ends_at: still live");
  assert.strictEqual(classrooms(page({ rows: [row("live", -125, 60)] })).length, 0, "65 min past ends_at: ended, no card");
});

test("the Go live stub and the demo/sample deck are not a live signal", function () {
  var api = page({ goLiveStub: true });
  assert.strictEqual(classrooms(api).length, 0, "Go live stub: no card");
  assert.ok(api.sampleDeck(18).every(function (c) { return c.type !== "classroom"; }), "sample deck: no Classroom");
});
