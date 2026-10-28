/**
 * Seed sign-in must not write auth metadata (SeedOps Oct 28: seed-0079 sent
 * PUT /auth/v1/user with member_age at sign-in). Seed defaults from
 * seedops-commune-alive.js and seedops-dating-hydrate.js fire
 * cognation:member-profile-updated; that event no longer persists anything.
 * Expect:
 *   - seed sign-in + commune-alive/hydrate defaults + render churn: 0 PUTs
 *   - no PUT body ever contains member_age (age comes only from user_birth)
 *   - the member flipping See dating: exactly 1 PUT, with see_dating only
 *   - profile Save (persistPrefs): exactly 1 PUT, no member_age
 * Run: node js/seed-signin-no-updateuser.test.js
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
var SCALE = 10; /* module timers run 10x faster */
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms / SCALE); }); }

function page() {
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
  /* seed-0079 turned See dating on in an earlier session; nothing else is saved. */
  var user = { id: "u-0079", app_metadata: {}, user_metadata: { see_dating: true } };
  var row = { id: "p-seed-0079", user_id: "u-0079", account_kind: "seed", seed_fleet_id: "seed-0079" };
  var session = null;
  var win = {
    document: doc, localStorage: ls,
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationDatingFlag: { enabled: function () { return true; } },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve(clone(user)); },
      updateUser: function (data) {
        puts.push(clone(data));
        Object.assign(user.user_metadata, data); /* GoTrue merges data into user_metadata */
        return Promise.resolve(clone(user));
      },
      rest: function (table, o) {
        if (table === "profiles" && /user_id=eq\./.test(o.query)) {
          return new Promise(function (resolve) { setTimeout(function () { resolve([clone(row)]); }, 300 / SCALE); });
        }
        return Promise.resolve([]);
      },
    },
  };
  /* Same contract as commune-swipe.js: setMemberProfile always emits
     member-profile-updated; setSeeDating(on, { byUser }) emits see-dating-changed. */
  var see = false;
  win.CognationCommuneSwipe = {
    getMemberProfile: function () { return JSON.parse(ls.getItem("cognation.member.profile.v1") || "{}"); },
    setMemberProfile: function (p) {
      ls.setItem("cognation.member.profile.v1", JSON.stringify(p || {}));
      doc.dispatchEvent(new CustomEvent("cognation:member-profile-updated", { detail: p }));
      return p;
    },
    getSeeDating: function () { return see; },
    setSeeDating: function (on, opts) {
      var prev = see; see = !!on;
      ls.setItem("cognation.commune.seeDating.v1", see ? "1" : "0");
      if (prev !== see) {
        doc.dispatchEvent(new CustomEvent("cognation:see-dating-changed", { detail: { seeDating: see, byUser: !!(opts && opts.byUser) } }));
      }
    },
    getMemberAge: function () { return parseInt(this.getMemberProfile().age, 10) || null; },
    rebuild: function () {},
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: console,
    setTimeout: function (fn, ms) { return setTimeout(fn, (ms || 0) / SCALE); }, clearTimeout: clearTimeout,
    setInterval: function (fn, ms) { return setInterval(fn, (ms || 0) / SCALE); }, clearInterval: clearInterval,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
    String: String, parseInt: parseInt, isNaN: isNaN,
  });
  ["js/age-floor-keywords.js", "js/seedops-u13-test-viewer.js", "js/seedops-dating-hydrate.js", "js/seedops-commune-alive.js"]
    .forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });

  function signIn() {
    session = { username: "seed-0079", accountKind: "seed", seedFleetId: "seed-0079" };
    doc.dispatchEvent(new CustomEvent("cognation:session-started"));
    return wait(600).then(function () {
      session = Object.assign({}, session, { source: "supabase", supabaseUserId: user.id, activeProfileId: row.id });
      doc.dispatchEvent(new CustomEvent("cognation:auth-changed"));
      /* member-profile-updated churn, like Tower / Commune renders */
      for (var i = 1; i <= 15; i++) {
        setTimeout(function () { var s = win.CognationCommuneSwipe; s.setMemberProfile(s.getMemberProfile()); }, (i * 150) / SCALE);
      }
      return wait(5000);
    });
  }
  return { win: win, puts: puts, signIn: signIn };
}

function noMemberAge(puts) {
  puts.forEach(function (p, i) {
    assert.ok(!Object.prototype.hasOwnProperty.call(p, "member_age"), "PUT #" + (i + 1) + " must not contain member_age: " + JSON.stringify(p));
  });
}

var p = page();
p.signIn().then(function () {
  var swipe = p.win.CognationCommuneSwipe;
  assert.strictEqual(swipe.getMemberAge(), 22, "seed still gets local age 22 (defaults applied)");
  assert.strictEqual(swipe.getSeeDating(), true, "seed default See dating on");
  assert.strictEqual(p.puts.length, 0, "seed sign-in + defaults: 0 PUT /auth/v1/user (got " + JSON.stringify(p.puts) + ")");

  /* The member flips See dating off. */
  swipe.setSeeDating(false, { byUser: true });
  return wait(2000);
}).then(function () {
  assert.strictEqual(p.puts.length, 1, "toggle flip: exactly 1 PUT (got " + JSON.stringify(p.puts) + ")");
  assert.deepStrictEqual(Object.keys(p.puts[0]), ["see_dating"], "toggle PUT carries see_dating only");
  assert.strictEqual(p.puts[0].see_dating, false);

  /* Profile Save: the member edits their profile, Save calls persistPrefs(). */
  var swipe = p.win.CognationCommuneSwipe;
  var prof = swipe.getMemberProfile();
  prof.country = "United States";
  prof.state = "IL";
  swipe.setMemberProfile(prof);
  return wait(2000).then(function () {
    assert.strictEqual(p.puts.length, 1, "member-profile-updated alone never writes");
    return p.win.CognationSeedOpsDatingHydrate.persistPrefs({ byUser: true });
  });
}).then(function () {
  return wait(500);
}).then(function () {
  assert.strictEqual(p.puts.length, 2, "Save: exactly 1 more PUT (got " + JSON.stringify(p.puts) + ")");
  assert.strictEqual(p.puts[1].member_state, "IL");
  noMemberAge(p.puts);

  /* Wiring: the real toggle marks byUser, and sign-up Save calls persistPrefs. */
  var swipeSrc = read("js/commune-swipe.js");
  var w = swipeSrc.slice(swipeSrc.indexOf("function wireDatingToggle"), swipeSrc.indexOf("function wireDatingToggle") + 900);
  assert.ok(/setSeeDating\(on, \{ byUser: true \}\)/.test(w), "toggle passes byUser");
  assert.ok(/byUser: !!\(opts && opts\.byUser\)/.test(swipeSrc), "setSeeDating emits detail.byUser");
  assert.ok(/persistPrefs\(\{ byUser: true \}\)/.test(read("js/login-signup-shell.js")), "sign-up Save calls persistPrefs");
  console.log("seed-signin-no-updateuser.test.js: ok");
}).catch(function (err) { console.error(err); process.exit(1); });
