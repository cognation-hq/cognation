/**
 * Sign-in race (SeedOps): on Sage's sign-in the site sent PUT /auth/v1/user
 * with member_age 28 / see_dating true about 1.5s after submit, and the age
 * readers showed 28 for ~1.85s. isU13TestViewer() is false until the login
 * state and profile row load, and "not loaded" was treated as "not Sage".
 * Here the login state is ready only after a delay and the profile row loads
 * even later. Expect: Sage 0 PUTs and her age never reads 28; a normal seed
 * still gets age 28 with exactly one write.
 * Run: node js/u13-sign-in-race.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

var SCALE = 10; /* module timers and the scenario below run 10x faster */

/* t (ms, unscaled) after submit:
     0     Supabase token exists; CognationAuth has only the username (login state not ready)
     0     cognation:session-started
     600   login state ready (source supabase + user id); cognation:auth-changed
     row   profiles row for the user arrives (opts.rowDelay) */
function signIn(opts) {
  var listeners = {};
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { listeners[t] = (listeners[t] || []).filter(function (f) { return f !== fn; }); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
  };
  var ls = store();
  var puts = [];
  var ages = [];
  var t0 = Date.now();
  var session = null;
  var win = {
    document: doc, localStorage: ls,
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve(clone(opts.user)); },
      updateUser: function (data) {
        puts.push({ at: (Date.now() - t0) * SCALE, data: clone(data) });
        Object.assign(opts.user.user_metadata, data);
        return Promise.resolve(clone(opts.user));
      },
      rest: function (table, o) {
        if (table === "profiles" && /user_id=eq\./.test(o.query)) {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              if (opts.rowFails) reject(new Error("timeout"));
              else resolve(opts.row ? [clone(opts.row)] : []);
            }, opts.rowDelay / SCALE);
          });
        }
        return Promise.resolve([]);
      },
    },
  };
  var see = false;
  win.CognationCommuneSwipe = {
    getMemberProfile: function () { return JSON.parse(ls.getItem("cognation.member.profile.v1") || "{}"); },
    setMemberProfile: function (p) {
      ls.setItem("cognation.member.profile.v1", JSON.stringify(p || {}));
      ages.push(p && p.age != null ? parseInt(p.age, 10) : null);
      doc.dispatchEvent(new CustomEvent("cognation:member-profile-updated", { detail: p }));
      return p;
    },
    getSeeDating: function () { return see; },
    setSeeDating: function (on) {
      var prev = see; see = !!on;
      if (prev !== see) doc.dispatchEvent(new CustomEvent("cognation:see-dating-changed", { detail: { seeDating: see } }));
    },
    getMemberAge: function () { return parseInt(this.getMemberProfile().age, 10) || null; },
    rebuild: function () {},
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: console,
    setTimeout: function (fn, ms) { return setTimeout(fn, (ms || 0) / SCALE); }, clearTimeout: clearTimeout,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
    String: String, parseInt: parseInt, isNaN: isNaN,
  });
  ["js/age-floor-keywords.js", "js/seedops-u13-test-viewer.js", "js/seedops-dating-hydrate.js", "js/seedops-commune-alive.js"]
    .forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });

  /* Every age reader, sampled through the sign-in. */
  var floor = win.CognationAgeFloor;
  function sample() {
    ages.push(win.CognationCommuneSwipe.getMemberAge());
    ages.push(floor.viewerAge() || null);
  }
  var sampler = setInterval(sample, 50 / SCALE);

  setTimeout(function () {
    session = { username: opts.username, accountKind: "seed", seedFleetId: opts.username };
    doc.dispatchEvent(new CustomEvent("cognation:session-started"));
  }, 1);
  setTimeout(function () {
    session = Object.assign({}, session, { source: "supabase", supabaseUserId: opts.user.id, activeProfileId: "p-" + opts.username });
    doc.dispatchEvent(new CustomEvent("cognation:auth-changed"));
  }, 600 / SCALE);
  /* member-profile-updated churn, like the real page */
  for (var i = 1; i <= 20; i++) {
    setTimeout(function () { var s = win.CognationCommuneSwipe; s.setMemberProfile(s.getMemberProfile()); }, (i * 150) / SCALE);
  }
  return new Promise(function (resolve) {
    setTimeout(function () {
      clearInterval(sampler);
      resolve({ puts: puts, ages: ages, win: win });
    }, 6000 / SCALE);
  });
}

var SAGE_USER = { id: "u-sage", app_metadata: {}, user_metadata: { test_role: "u13-viewer", member_age: 11 } };
var SAGE_ROW = { id: "p-sage", user_id: "u-sage", account_kind: "seed", seed_fleet_id: "seed-0248" };

function testSageRowLate() {
  return signIn({ username: "seed-0248", user: clone(SAGE_USER), row: SAGE_ROW, rowDelay: 2500 }).then(function (r) {
    assert.strictEqual(r.puts.length, 0, "Sage: 0 PUT /auth/v1/user (got " + JSON.stringify(r.puts) + ")");
    assert.ok(r.ages.indexOf(28) === -1, "Sage's age never reads 28: " + JSON.stringify(r.ages.filter(function (a) { return a != null; }).slice(0, 12)));
    assert.strictEqual(r.win.CognationCommuneSwipe.getMemberAge(), 11, "Sage ends at 11");
    assert.strictEqual(r.win.CognationU13TestViewer.isU13TestViewer(), true, "profile row did load in the end");
  });
}

function testSageRowFails() {
  /* Profile row never loads: still no write and no 28 (test_role in metadata). */
  return signIn({ username: "seed-0248", user: clone(SAGE_USER), row: SAGE_ROW, rowDelay: 1500, rowFails: true }).then(function (r) {
    assert.strictEqual(r.puts.length, 0, "Sage with no profile row: 0 PUTs");
    assert.ok(r.ages.indexOf(28) === -1, "no 28 without the profile row either");
  });
}

function testNormalSeedOneWrite() {
  var user = { id: "u-0003", app_metadata: {}, user_metadata: {} };
  var row = { id: "p-seed-0003", user_id: "u-0003", account_kind: "seed", seed_fleet_id: "seed-0003" };
  return signIn({ username: "seed-0003", user: user, row: row, rowDelay: 2500 }).then(function (r) {
    assert.strictEqual(r.win.CognationCommuneSwipe.getMemberAge(), 28, "normal seed still gets age 28");
    assert.strictEqual(r.puts.length, 1, "normal seed: exactly one write (got " + r.puts.length + ")");
    assert.strictEqual(r.puts[0].data.member_age, 28);
    assert.ok(r.puts[0].at >= 2500, "write waits for the profile row (at " + r.puts[0].at + "ms)");
  });
}

function testUnitChecks() {
  var h = require("./seedops-u13-test-viewer.js");
  assert.strictEqual(h.metadataHasTestRole({ test_role: "u13-viewer" }), true);
  assert.strictEqual(h.metadataHasTestRole({ test_role: "other" }), false);
  assert.strictEqual(h.metadataHasTestRole(null), false);
}

testSageRowLate()
  .then(testSageRowFails)
  .then(testNormalSeedOneWrite)
  .then(testUnitChecks)
  .then(function () { console.log("u13-sign-in-race.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
