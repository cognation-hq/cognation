/**
 * (a) After a reload, a signed-in session takes its name from the server
 *     profile row, not from a local CognationAccounts record. A local record
 *     is only a placeholder before the row loads, and only for the same user id.
 * (b) A failing PUT /auth/v1/user is retried at most once per changed value per
 *     page load (with backoff, never queued twice); a real change still writes once.
 * Run: node js/session-name-and-put-retry.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }
function makeDoc() {
  var listeners = {};
  return {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function (id) { return id === "login-gate" || id === "login-form" ? el() : null; },
    body: el(),
  };
}
function el() {
  return {
    hidden: false, textContent: "", style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, removeAttribute: function () {}, getAttribute: function () { return null; },
    addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    focus: function () {}, appendChild: function () {}, reset: function () {},
  };
}

/* ---------- (a) session name ---------- */

var SESSION_KEY = "cognation.session.v2";
/* Saved session for seed-0003: the server row says Alex. */
function savedSession(name) {
  return { username: "seed-0003", source: "supabase", supabaseUserId: "u-alex", activeProfileId: "p-alex",
    profileKind: "personal", profileHandle: "alex", profileDisplayName: name, startedAt: 1 };
}

function bootLogin(opts) {
  var doc = makeDoc();
  var ls = store();
  ls.setItem(SESSION_KEY, JSON.stringify(opts.session));
  var cache = {};
  (opts.rows || []).forEach(function (r) { cache[r.id] = r; });
  var local = opts.localRecords || {};
  var win = {
    document: doc, localStorage: ls, location: { hash: "", search: "" },
    CognationAccounts: {
      ensureSeeded: function () {},
      getProfileById: function (id) { return local[id] || null; },
      /* The local seed roster calls seed-0003 "Luna". */
      profilesForLogin: function () { return [{ id: "prof-seed-0003", kind: "personal", handle: "luna", displayName: "Luna" }]; },
    },
    CognationSupabaseSocial: { getProfile: function (id) { return cache[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getUser: function () { return Promise.resolve({ id: "u-alex" }); },
    },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
  };
  win.window = win;
  vm.runInNewContext(read("js/login.js"), {
    window: win, document: doc, localStorage: ls, location: win.location, CustomEvent: CustomEvent,
    console: console, Promise: Promise, JSON: JSON, Date: Date, setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    fetch: function () { return Promise.reject(new Error("no network")); },
  });
  return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
    return {
      session: function () { return JSON.parse(ls.getItem(SESSION_KEY)); },
      loadRow: function (row) { cache[row.id] = row; doc.dispatchEvent(new CustomEvent("cognation:remote-profile-loaded", { detail: { profileId: row.id } })); },
    };
  });
}

var ALEX_ROW = { id: "p-alex", user_id: "u-alex", kind: "personal", handle: "alex", display_name: "Alex" };

function testLocalLunaVsServerAlex() {
  /* A same-user local record with a stale name: placeholder only, then the server row wins. */
  return bootLogin({
    session: savedSession("Alex"),
    localRecords: { "p-alex": { id: "p-alex", kind: "personal", handle: "alex", displayName: "Luna", userId: "u-alex" } },
  }).then(function (t) {
    assert.strictEqual(t.session().activeProfileId, "p-alex", "session stays on the server profile");
    t.loadRow(ALEX_ROW);
    assert.strictEqual(t.session().profileDisplayName, "Alex", "server row overwrites the stale local name");
    return bootLogin({
      session: savedSession("Alex"),
      rows: [ALEX_ROW],
      localRecords: { "p-alex": { id: "p-alex", kind: "personal", handle: "alex", displayName: "Luna", userId: "u-alex" } },
    });
  }).then(function (t) {
    assert.strictEqual(t.session().profileDisplayName, "Alex", "cached server row beats the local record on reload");
  });
}

function testOtherUsersRecordIgnored() {
  return bootLogin({
    session: savedSession("Alex"),
    localRecords: { "p-alex": { id: "p-alex", kind: "personal", handle: "luna", displayName: "Luna", userId: "u-luna" } },
  }).then(function (t) {
    var s = t.session();
    assert.strictEqual(s.profileDisplayName, "Alex", "another user id's local record is ignored");
    assert.strictEqual(s.profileHandle, "alex");
    assert.strictEqual(s.activeProfileId, "p-alex", "local seed roster never replaces the server profile");
    /* A local record with no owner at all (old Tower save) is ignored too. */
    return bootLogin({ session: savedSession("Alex"), localRecords: { "p-alex": { id: "p-alex", displayName: "Luna" } } });
  }).then(function (t) {
    assert.strictEqual(t.session().profileDisplayName, "Alex", "ownerless local record is ignored");
    /* A server row owned by someone else is not used either. */
    return bootLogin({ session: savedSession("Alex"), rows: [{ id: "p-alex", user_id: "u-luna", display_name: "Luna" }] });
  }).then(function (t) {
    assert.strictEqual(t.session().profileDisplayName, "Alex", "a row for another user id is ignored");
  });
}

/* ---------- (b) PUT /auth/v1/user retry cap ---------- */

var dating = read("js/seedops-dating-hydrate.js");
var SCALE = 10; /* run the module's timers 10x faster */

function pageLoad(server, session, local, script) {
  var doc = makeDoc();
  var puts = [];
  var ls = store(local);
  var t0 = Date.now();
  var win = {
    document: doc,
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve({ user_metadata: JSON.parse(JSON.stringify(server.meta)) }); },
      updateUser: function (data) {
        puts.push({ at: Date.now() - t0, data: JSON.parse(JSON.stringify(data)) });
        if (server.fail) { var e = new Error("Forbidden"); e.status = 403; return Promise.reject(e); }
        Object.assign(server.meta, data);
        return Promise.resolve({ user_metadata: server.meta });
      },
      rest: function () { return Promise.resolve([]); },
    },
  };
  var see = ls.getItem("cognation.commune.seeDating.v1") === "1";
  win.CognationCommuneSwipe = {
    getMemberProfile: function () { return JSON.parse(ls.getItem("cognation.member.profile.v1") || "{}"); },
    setMemberProfile: function (p) {
      ls.setItem("cognation.member.profile.v1", JSON.stringify(p || {}));
      doc.dispatchEvent(new CustomEvent("cognation:member-profile-updated", { detail: p }));
      return p;
    },
    getSeeDating: function () { return see; },
    setSeeDating: function (on) {
      var prev = see; see = !!on;
      ls.setItem("cognation.commune.seeDating.v1", see ? "1" : "0");
      if (prev !== see) doc.dispatchEvent(new CustomEvent("cognation:see-dating-changed", { detail: { seeDating: see } }));
    },
    getMemberAge: function () { return parseInt(this.getMemberProfile().age, 10) || null; },
    rebuild: function () {},
  };
  win.window = win;
  vm.runInNewContext(dating, {
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: console,
    setTimeout: function (fn, ms) { return setTimeout(fn, (ms || 0) / SCALE); }, clearTimeout: clearTimeout,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
  });
  var swipe = win.CognationCommuneSwipe;
  function rerender() { swipe.setMemberProfile(swipe.getMemberProfile()); }
  setTimeout(function () { doc.dispatchEvent(new CustomEvent("cognation:session-started")); }, 5);
  (script || []).forEach(function (step) { setTimeout(function () { step(swipe, doc, rerender); }, step.at); });
  return new Promise(function (resolve) { setTimeout(function () { resolve(puts); }, 1500); });
}

function at(ms, fn) { fn.at = ms; return fn; }
var SEED = { username: "seed-0003", seedFleetId: "seed-0003", activeProfileId: "prof-seed-0003", accountKind: "seed" };
var REAL = { username: "member-login", activeProfileId: "p-real", source: "supabase", supabaseUserId: "u-real" };

function testFailingPutCapped() {
  /* Writes blocked server-side; many sync events across the page load. */
  var script = [];
  for (var i = 1; i <= 25; i++) {
    script.push(at(i * 40, function (swipe, doc, rerender) {
      rerender();
      doc.dispatchEvent(new CustomEvent("cognation:auth-changed"));
      doc.dispatchEvent(new CustomEvent("cognation:session-started"));
    }));
  }
  return pageLoad({ meta: {}, fail: true }, SEED, null, script).then(function (puts) {
    assert.ok(puts.length <= 2, "failing PUT: at most 2 per load (got " + puts.length + ")");
    assert.strictEqual(puts.length, 2, "one retry after the first failure");
    assert.strictEqual(JSON.stringify(puts[0].data), JSON.stringify(puts[1].data), "retry is the same value");
    assert.strictEqual(puts[0].data.member_age, 28, "seedDefaults age 28 is the value that was written");
    assert.ok(puts[1].at - puts[0].at >= 2000 / SCALE - 20, "retry waits for the backoff");
  });
}

function testRealChangeWritesOnce() {
  var meta = { see_dating: false, member_age: 34, member_city: "Springfield", member_state: "IL", member_country: "United States", member_interests: ["jobs"] };
  var local = {
    "cognation.member.profile.v1": JSON.stringify({ age: 34, city: "Springfield", locality: "Springfield", state: "IL", country: "United States", interests: ["jobs"] }),
    "cognation.commune.seeDating.v1": "0",
  };
  var script = [
    at(150, function (swipe) { var p = swipe.getMemberProfile(); p.age = 41; swipe.setMemberProfile(p); }),
  ];
  for (var i = 4; i <= 25; i++) script.push(at(i * 40, function (s, d, rerender) { rerender(); }));
  return pageLoad({ meta: meta }, REAL, local, script).then(function (puts) {
    assert.strictEqual(puts.length, 1, "a real change writes exactly once (got " + puts.length + ")");
    assert.strictEqual(puts[0].data.member_age, 41);
  });
}

function testUnchangedSeedDefaultsNoPut() {
  /* seedDefaults (age 28 + demo place/interests) already on the server: no PUT. */
  var meta = { see_dating: true, member_age: 28, member_city: "Demo City", member_state: "Demo", member_country: "United States",
    member_interests: ["tech", "mental health", "jobs", "insurance", "gamers"] };
  var script = [];
  for (var i = 1; i <= 10; i++) script.push(at(i * 60, function (s, d, rerender) { rerender(); }));
  return pageLoad({ meta: meta }, SEED, null, script).then(function (puts) {
    assert.strictEqual(puts.length, 0, "age 28 already saved: no PUT (got " + puts.length + ")");
  });
}

testLocalLunaVsServerAlex()
  .then(testOtherUsersRecordIgnored)
  .then(testFailingPutCapped)
  .then(testRealChangeWritesOnce)
  .then(testUnchangedSeedDefaultsNoPut)
  .then(function () { console.log("session-name-and-put-retry.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
