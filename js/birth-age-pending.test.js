/**
 * birthAgePending(): true whenever the viewer is signed in and this session's
 * user_birth read has not answered yet, including a fresh signed-in page load
 * (not only after an in-page sign-out). While pending: no "Add birth month"
 * offer (liveBirthMissing false) and no classroom cards for anyone. A "no row"
 * answer sets birthMissing (prompt shows); an age ends pending; signed out is
 * never pending. Nothing here writes to the server.
 * Run: node --test js/birth-age-pending.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    _d: d,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

/* Minimal element for the birth-month panel. */
function fakeElement(tag) {
  var handlers = {};
  var classes = {};
  var el = {
    tagName: String(tag || "div").toUpperCase(),
    hidden: false, isConnected: true, value: "", textContent: "", id: "", className: "", innerHTML: "",
    attrs: {}, children: {},
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k]; },
    addEventListener: function (t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    fire: function (t, ev) { (handlers[t] || []).forEach(function (fn) { fn(ev); }); },
    focus: function () {},
    reset: function () { this.resetCount = (this.resetCount || 0) + 1; },
    classList: {
      add: function (c) { classes[c] = true; },
      remove: function (c) { delete classes[c]; },
      toggle: function (c, on) { if (on) classes[c] = true; else delete classes[c]; },
      contains: function (c) { return !!classes[c]; },
    },
    querySelector: function (sel) {
      if (!this.children[sel]) this.children[sel] = fakeElement("div");
      return this.children[sel];
    },
  };
  return el;
}

var ADULT = {
  user: { id: "u-adult", app_metadata: {}, user_metadata: {} },
  session: { source: "supabase", supabaseUserId: "u-adult", username: "adult", activeProfileId: "p-adult" },
  row: { id: "p-adult", user_id: "u-adult", account_kind: "personal" },
  birth: { birth_year: 1996, birth_month: 1 }, /* 30 */
};
var TEEN = {
  user: { id: "u-teen", app_metadata: {}, user_metadata: {} },
  session: { source: "supabase", supabaseUserId: "u-teen", username: "teen", activeProfileId: "p-teen" },
  row: { id: "p-teen", user_id: "u-teen", account_kind: "personal" },
  birth: { birth_year: 2011, birth_month: 1 }, /* 15 */
};
function ageOf(acct) { return new Date().getFullYear() - acct.birth.birth_year; }

/* One page: every module loaded once, accounts switched in place. */
function page(initial) {
  var listeners = {};
  var body = fakeElement("body");
  var doc = {
    readyState: "complete",
    body: body,
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { listeners[t] = (listeners[t] || []).filter(function (f) { return f !== fn; }); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function (tag) { return fakeElement(tag); },
  };
  body.appendChild = function (el) { h.panels.push(el); };
  var ls = store();
  var ss = store();
  var acct = initial || null; /* signed-in account, null when signed out */
  var h = {
    doc: doc, ls: ls, ss: ss, panels: [], puts: [], events: [], writes: [],
    /* per user id: ms delay before user_birth answers */
    birthDelay: {},
    rpcImpl: null,
  };
  doc.addEventListener("cognation:birth-saved", function (ev) { h.events.push(["birth-saved", ev.detail]); });
  var win = {
    document: doc, localStorage: ls, sessionStorage: ss, location: { search: "", pathname: "/commune.html" },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    CognationDatingFlag: { enabled: function () { return true; } }, /* forced on for this test */
    /* One live classroom on a Professional page (18+). */
    CognationProLive: { livePages: function () {
      return [{ profileId: "pro-1", live: true, kind: "professional", sessionKind: "classroom",
        title: "Live classroom title", displayName: "Teacher", handle: "teacher", minAge: 18 }];
    } },
    CognationAuth: { getSession: function () { return acct ? clone(acct.session) : null; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return acct ? { access_token: "t-" + acct.user.id, user: { id: acct.user.id } } : null; },
      getUser: function () { return Promise.resolve(acct ? clone(acct.user) : null); },
      updateUser: function (data) {
        h.writes.push(["updateUser"]);
        h.puts.push({ user: acct && acct.user.id, data: clone(data) });
        return Promise.resolve(acct ? clone(acct.user) : null);
      },
      rpc: function (name, args) {
        h.writes.push(["rpc", name]);
        if (name === "set_my_birth_month" && h.rpcImpl) return h.rpcImpl(args);
        return Promise.resolve(false);
      },
      rest: function (table, o) {
        var method = String((o && o.method) || "GET").toUpperCase();
        if (method !== "GET" || (o && o.body != null)) h.writes.push(["rest", method, table]);
        var q = (o && o.query) || "";
        var m = /user_id=eq\.([^&]+)/.exec(q);
        var id = m ? decodeURIComponent(m[1]) : "";
        var who = [ADULT, TEEN, h.extra].filter(function (a) { return a && a.user.id === id; })[0];
        if (table === "user_birth") {
          var rows = who && who.birth ? [clone(who.birth)] : [];
          return wait(h.birthDelay[id] || 0).then(function () { return rows; });
        }
        if (table === "profiles" && who) return Promise.resolve([clone(who.row)]);
        return Promise.resolve([]);
      },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: ss, console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String, parseInt: parseInt, isNaN: isNaN,
  });
  ["js/age-floor-keywords.js", "js/seedops-u13-test-viewer.js", "js/commune-swipe.js",
    "js/seedops-dating-hydrate.js", "js/birth-prompt.js"]
    .forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });

  h.win = win;
  h.swipe = win.CognationCommuneSwipe;
  h.floor = win.CognationAgeFloor;
  h.emit = function (type, detail) { doc.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); };
  /* login.js closeGate / openGate order */
  h.signIn = function (a) { acct = a; h.emit("cognation:session-started"); };
  h.signOut = function () { acct = null; h.emit("cognation:session-ended"); };
  h.gates = function () {
    return {
      classroom: h.swipe.classroomAllowed(),
      dating: h.swipe.datingAllowed(),
      pending: h.swipe.birthAgePending(),
      missing: h.swipe.liveBirthMissing(),
      sessions: h.swipe.visibleClassroomSessions().length,
      birthAge: h.swipe.getDatingBirthAge(),
      viewerAge: h.floor.viewerAge(),
    };
  };
  /* Samples every gate until stop() so a short leak is caught. */
  h.sampler = function () {
    var seen = [];
    var t = setInterval(function () { seen.push(h.gates()); }, 5);
    return { seen: seen, stop: function () { clearInterval(t); seen.push(h.gates()); return seen; } };
  };
  return h;
}


var NO_ROW = {
  user: { id: "u-new", app_metadata: {}, user_metadata: {} },
  session: { source: "supabase", supabaseUserId: "u-new", username: "newbie", activeProfileId: "p-new" },
  row: { id: "p-new", user_id: "u-new", account_kind: "personal" },
  birth: null,
};
function withExtra(h, a) { h.extra = a; return h; }

test("fresh signed-in load (adult): pending until user_birth answers; no birth-month offer or classroom meanwhile", async function () {
  var h = page(ADULT);
  h.birthDelay[ADULT.user.id] = 250;
  var first = h.gates();
  assert.strictEqual(first.pending, true, "pending right after load, before user_birth answers");
  assert.strictEqual(first.missing, false, "no Add birth month offer for an account that has one");
  assert.strictEqual(first.sessions, 0, "no classroom cards while pending");
  var s = h.sampler();
  await wait(300); /* boot hydrate starts at 200ms; user_birth answers 250ms later */
  var mid = s.stop();
  mid.forEach(function (g, i) {
    if (!g.pending) return;
    assert.strictEqual(g.missing, false, "sample " + i + ": no birth-month offer while pending");
    assert.strictEqual(g.sessions, 0, "sample " + i + ": no classroom titles while pending");
    assert.strictEqual(g.classroom, false, "sample " + i + ": classroom closed while pending");
  });
  await wait(300);
  var t = h.gates();
  assert.strictEqual(t.pending, false, "age arrived: not pending");
  assert.strictEqual(t.birthAge, ageOf(ADULT));
  assert.strictEqual(t.missing, false);
  assert.strictEqual(t.classroom, true, "adult: classroom open once the age is known");
  assert.strictEqual(t.sessions, 1, "adult sees the live classroom after the age arrives");
  [].concat(mid, [t]).forEach(function (g, i) {
    assert.strictEqual(g.missing, false, "sample " + i + ": the adult never saw Add birth month");
  });
  assert.deepStrictEqual(h.writes, [], "0 writes");
});

test("fresh signed-in load (teen): no classroom titles while pending, none after the age arrives", async function () {
  var h = page(TEEN);
  h.birthDelay[TEEN.user.id] = 150;
  var s = h.sampler();
  await wait(500);
  var seen = s.stop();
  assert.strictEqual(seen[0].pending, true, "teen pending on load");
  seen.forEach(function (g, i) {
    assert.strictEqual(g.sessions, 0, "sample " + i + ": no classroom titles for the teen");
    assert.strictEqual(g.missing, false, "sample " + i + ": no birth-month offer for the teen");
  });
  var t = h.gates();
  assert.strictEqual(t.pending, false);
  assert.strictEqual(t.birthAge, ageOf(TEEN));
  assert.strictEqual(t.classroom, false);
  assert.deepStrictEqual(h.writes, [], "0 writes");
});

test("'no row' answer: birthMissing, not pending, the birth-month offer shows (classroom card kept for Join)", async function () {
  var h = page(NO_ROW);
  withExtra(h, NO_ROW);
  h.birthDelay[NO_ROW.user.id] = 100;
  var first = h.gates();
  assert.strictEqual(first.pending, true, "pending before the read answers");
  assert.strictEqual(first.missing, false, "no offer before the read answers");
  assert.strictEqual(first.sessions, 0);
  await wait(450);
  var t = h.gates();
  assert.strictEqual(t.pending, false, "no row: not pending");
  assert.strictEqual(t.missing, true, "no row: birthMissing, Add birth month shows");
  assert.strictEqual(t.birthAge, null);
  assert.strictEqual(t.classroom, false, "classroom still closed (18+)");
  assert.strictEqual(t.sessions, 1, "card kept so Join can offer Add birth month (unchanged)");
  assert.deepStrictEqual(h.writes, [], "0 writes");
});

test("signed out: never pending, no offer, no classroom", async function () {
  var h = page(null);
  var s = h.sampler();
  await wait(400);
  s.stop().forEach(function (g, i) {
    assert.strictEqual(g.pending, false, "sample " + i + ": signed out is not pending");
    assert.strictEqual(g.missing, false, "sample " + i + ": no birth-month offer signed out");
    assert.strictEqual(g.sessions, 0, "sample " + i + ": no classroom signed out");
    assert.strictEqual(g.classroom, false);
  });
  assert.deepStrictEqual(h.writes, [], "0 writes");
});

test("signed-out load, then sign-in (no reload): pending until that account's read answers", async function () {
  var h = page(null);
  await wait(400); /* signed-out boot hydrate settles */
  h.birthDelay[ADULT.user.id] = 120;
  h.signIn(ADULT);
  var mid = h.gates();
  assert.strictEqual(mid.pending, true, "pending right after sign-in");
  assert.strictEqual(mid.missing, false, "no Add birth month offer before the read");
  assert.strictEqual(mid.sessions, 0, "no classroom before the read");
  await wait(300);
  var t = h.gates();
  assert.strictEqual(t.pending, false);
  assert.strictEqual(t.birthAge, ageOf(ADULT));
  assert.strictEqual(t.sessions, 1);
  assert.deepStrictEqual(h.writes, [], "0 writes");
});
