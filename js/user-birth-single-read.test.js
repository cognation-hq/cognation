/**
 * The user_birth age read is read-only and single-flight per user and session.
 *
 * SeedOps saw a double user_birth GET on a 390 reload. On a signed-in reload
 * the dating hydrate boots (200 ms) and reads user_birth; login.js then
 * confirms the session and fires cognation:session-started (closeGate), which
 * forces a second hydrate. If the first read had already answered, the
 * in-flight share was gone and user_birth was read again for the same user.
 * birth-prompt.js likewise looked the row up on its boot timer and again on
 * session-started. This load's own answer is reused for the same user and
 * session; sign-out, a user switch, auth-changed and birth-saved still read
 * fresh, a failed read is not reused (fail closed: unknown stays 0), and
 * nothing is ever written to read the age.
 * Run: node --test js/user-birth-single-read.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function mem(init) {
  var m = Object.assign({}, init || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
  };
}
function clock() {
  var now = 0, seq = 0, q = [];
  return {
    now: function () { return now; },
    setTimeout: function (fn, ms) { var id = ++seq; q.push({ id: id, at: now + (ms || 0), fn: fn }); return id; },
    clearTimeout: function (id) { q = q.filter(function (t) { return t.id !== id; }); },
    advance: async function (ms) {
      var end = now + ms;
      for (;;) {
        await new Promise(function (r) { setImmediate(r); });
        q.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
        if (!q.length || q[0].at > end) break;
        var t = q.shift();
        now = Math.max(now, t.at);
        t.fn();
      }
      now = end;
      await new Promise(function (r) { setImmediate(r); });
    },
  };
}
function node() {
  return {
    hidden: true, style: {}, isConnected: true,
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, appendChild: function () {}, addEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  };
}

var ROWS = { "u-1": { birth_year: 1996, birth_month: 3 }, "u-2": { birth_year: 2011, birth_month: 1 } };
var SHOWN = { "cognation.birthPrompt.shown.v1": JSON.stringify({ "u-1": 1, "u-2": 1 }) };
var LATENCY = 280; /* SeedOps 390 run */

function world(o) {
  var c = clock(), log = [], listeners = {}, S = { user: o.user || null, failBirth: !!o.failBirth };
  var ages = [];
  var doc = {
    readyState: "complete", body: node(),
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; }, createElement: node,
  };
  function later(v, fail) {
    return new Promise(function (res, rej) { c.setTimeout(function () { if (fail) rej(new Error("network")); else res(v); }, LATENCY); });
  }
  var win = {
    document: doc, addEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return S.user ? { supabaseUserId: S.user, source: "supabase", username: "member" } : null; } },
    CognationCommuneSwipe: { setDatingBirthAge: function (a) { ages.push({ user: S.user, age: a }); } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return S.user ? { access_token: "t" } : null; },
      getUser: function () { var u = S.user; return later(u ? { id: u, user_metadata: {} } : null); },
      rest: function (table, opts) {
        var q = String((opts && opts.query) || "");
        var method = (opts && opts.method) || "GET";
        log.push({ table: table, method: method, q: q });
        if (table === "user_birth") {
          var m = /user_id=eq\.([^&]+)/.exec(q);
          var row = m && ROWS[decodeURIComponent(m[1])];
          return later(row ? [row] : [], S.failBirth);
        }
        return later([]);
      },
      rpc: function (name) { log.push({ table: name, method: "RPC" }); return later(true); },
      updateUser: function () { log.push({ table: "auth/user", method: "PUT" }); return later({}); },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: mem(), sessionStorage: mem(o.session),
    CustomEvent: win.CustomEvent, console: console, Promise: Promise,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
  });
  ["js/birth-prompt.js", "js/seedops-dating-hydrate.js"].forEach(function (f) {
    vm.runInContext(src(f), ctx, { filename: f });
  });
  return {
    clock: c, S: S, ages: ages,
    fire: function (n) { doc.dispatchEvent(new win.CustomEvent(n, {})); },
    reads: function (user) {
      return log.filter(function (r) {
        return r.table === "user_birth" && r.method === "GET" && (!user || r.q.indexOf("user_id=eq." + user + "&") >= 0);
      }).length;
    },
    writes: function () { return log.filter(function (r) { return r.method !== "GET"; }); },
    lastAge: function () { return ages.length ? ages[ages.length - 1] : null; },
  };
}

/* login.js boot: getUser confirms the session, then closeGate() fires session-started. */
[300, 700, 1500].forEach(function (at) {
  test("signed-in reload, session-started @" + at + " ms: user_birth read once, no writes", async function () {
    var x = world({ user: "u-1", session: SHOWN });
    x.clock.setTimeout(function () { x.fire("cognation:session-started"); }, at);
    await x.clock.advance(8000);
    assert.equal(x.reads("u-1"), 1, "one user_birth GET on the reload");
    assert.deepEqual(x.writes(), [], "reading the age writes nothing");
    assert.deepEqual(x.lastAge(), { user: "u-1", age: 30 });
  });

  test("first load in a tab (prompt not shown yet), session-started @" + at + " ms: one age read + one prompt lookup", async function () {
    var x = world({ user: "u-1" });
    x.clock.setTimeout(function () { x.fire("cognation:session-started"); }, at);
    await x.clock.advance(8000);
    assert.equal(x.reads("u-1"), 2, "dating age read once, birth prompt looked up once");
    assert.deepEqual(x.writes(), []);
  });
});

test("signed out: no user_birth read, no writes, age unknown", async function () {
  var x = world({ user: null });
  await x.clock.advance(8000);
  assert.equal(x.reads(), 0);
  assert.deepEqual(x.writes(), []);
  x.ages.forEach(function (a) { assert.equal(a.age, null, "signed out never gets an age"); });
});

test("shared device: sign-out then another user reads their own row, never the first answer", async function () {
  var x = world({ user: "u-1", session: SHOWN });
  await x.clock.advance(8000);
  assert.equal(x.reads("u-1"), 1);
  x.S.user = null;
  x.fire("cognation:session-ended");
  await x.clock.advance(2000);
  x.S.user = "u-2";
  x.fire("cognation:session-started");
  await x.clock.advance(8000);
  assert.equal(x.reads("u-2"), 1, "u-2 gets a fresh read");
  assert.equal(x.reads("u-1"), 1, "u-1 is not read again");
  assert.deepEqual(x.lastAge(), { user: "u-2", age: 15 });
  x.ages.filter(function (a) { return a.user === "u-2"; }).forEach(function (a) {
    assert.notEqual(a.age, 30, "u-2 never gets u-1's age");
  });
  assert.deepEqual(x.writes(), []);
});

test("birth-saved and auth-changed read fresh", async function () {
  var x = world({ user: "u-1", session: SHOWN });
  await x.clock.advance(8000);
  x.fire("cognation:birth-saved");
  await x.clock.advance(8000);
  assert.equal(x.reads("u-1"), 2, "re-read after the birth month is saved");
  x.fire("cognation:auth-changed");
  await x.clock.advance(8000);
  assert.equal(x.reads("u-1"), 3, "re-read after auth-changed");
  assert.deepEqual(x.writes(), []);
});

test("a failed read is not reused: unknown stays 0 and session-started tries again", async function () {
  var x = world({ user: "u-1", session: SHOWN, failBirth: true });
  await x.clock.advance(8000);
  assert.equal(x.reads("u-1"), 1);
  assert.deepEqual(x.lastAge(), { user: "u-1", age: null }, "failed read: age unknown (fail closed)");
  x.S.failBirth = false;
  x.fire("cognation:session-started");
  await x.clock.advance(8000);
  assert.equal(x.reads("u-1"), 2, "the failure was not cached");
  assert.deepEqual(x.lastAge(), { user: "u-1", age: 30 });
  assert.deepEqual(x.writes(), []);
});

test("same device, same user signs out and back in: read fresh, not the earlier session's answer", async function () {
  var x = world({ user: "u-1", session: SHOWN });
  await x.clock.advance(8000);
  x.S.user = null;
  x.fire("cognation:session-ended");
  await x.clock.advance(2000);
  x.S.user = "u-1";
  x.fire("cognation:session-started");
  await x.clock.advance(8000);
  assert.equal(x.reads("u-1"), 2, "a new session reads user_birth again");
  assert.deepEqual(x.lastAge(), { user: "u-1", age: 30 });
  assert.deepEqual(x.writes(), []);
});

test("account switch with no session-ended in between: the new user is read, never given the old answer", async function () {
  var x = world({ user: "u-1", session: SHOWN });
  await x.clock.advance(8000);
  x.S.user = "u-2";
  x.fire("cognation:session-started");
  await x.clock.advance(8000);
  assert.equal(x.reads("u-2"), 1, "u-2 gets their own read");
  assert.deepEqual(x.lastAge(), { user: "u-2", age: 15 });
  x.ages.filter(function (a) { return a.user === "u-2"; }).forEach(function (a) {
    assert.notEqual(a.age, 30, "u-2 never gets u-1's age");
  });
  assert.deepEqual(x.writes(), []);
});
