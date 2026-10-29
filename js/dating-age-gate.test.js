/**
 * Dating 18+ gate from user_birth (not member_age 28). Run: node js/dating-age-gate.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var read = function (p) { return fs.readFileSync(path.join(root, p), "utf8"); };

// 1) ageFromBirth (hydrate) — Oct 2026, birth_month = 1 as the backfill stores.
var hwin = { location: { search: "" } };
hwin.window = hwin;
var store = {};
var ls = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
vm.runInNewContext(read("js/seedops-dating-hydrate.js"), {
  window: hwin, localStorage: ls, sessionStorage: ls, document: { addEventListener: function () {}, readyState: "loading" },
  CustomEvent: function () {}, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise,
});
var H = hwin.CognationSeedOpsDatingHydrate;
var now = new Date(2026, 9, 15);
assert.strictEqual(H.ageFromBirth(2013, 1, now), 13);
assert.strictEqual(H.ageFromBirth(2009, 1, now), 17);
assert.strictEqual(H.ageFromBirth(2008, 1, now), 18);
assert.strictEqual(H.ageFromBirth(2000, 1, now), 26);
assert.strictEqual(H.ageFromBirth(2008, 11, now), 17, "birthday month not reached");
assert.strictEqual(H.ageFromBirth(null, null, now), null, "unknown");
assert.strictEqual(H.seedAgeFromFleetId("seed-0001"), 13, "Ada 13");
assert.strictEqual(H.seedAgeFromFleetId("seed-0005"), 17, "Ana 17");

// 2) swipe gate: dating age only from user_birth; member_age 28 is ignored.
var api = (function () {
  var s2 = {}; var l2 = { getItem: function (k) { return k in s2 ? s2[k] : null; }, setItem: function (k, v) { s2[k] = String(v); }, removeItem: function (k) { delete s2[k]; } };
  /* Signed in (#309: a signed-out viewer's gates see age 0): a live session. */
  var viewerId = ["u", "viewer"].join("-");
  var w = { CognationDatingFlag: { enabled: function () { return true; } },
    CognationSupabase: { getSession: function () { return { access_token: "t-" + viewerId, user: { id: viewerId } }; } } };
  var ctx = vm.createContext({
    window: w, localStorage: l2, sessionStorage: l2, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    document: { addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, readyState: "loading", dispatchEvent: function () {} },
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
  });
  ctx.window = w;
  w.dispatchEvent = function () {}; w.addEventListener = function () {};
  vm.runInContext(read("js/commune-swipe.js"), ctx);
  return w.CognationCommuneSwipe;
})();
api.setMemberProfile({ age: 28 }); // stale metadata age
api.setSeeDating(true);
function allowedAt(age) { api.setDatingBirthAge(age); return api.datingAllowed(); }
assert.strictEqual(allowedAt(13), false, "13 refused even with member_age 28");
assert.strictEqual(allowedAt(17), false, "17 refused");
assert.strictEqual(allowedAt(null), false, "unknown refused (fail closed)");
assert.strictEqual(allowedAt(18), true, "18 allowed");
assert.strictEqual(allowedAt(26), true, "26 allowed");

// 3) candidate pool never includes under-18 or unknown age.
[13, 17, null, undefined, "x", 0].forEach(function (a) {
  assert.strictEqual(api.datingCandidateAgeOk({ age: a }), false, "candidate age " + a + " excluded");
});
assert.strictEqual(api.datingCandidateAgeOk({ age: 18 }), true);
assert.strictEqual(api.datingCandidateAgeOk({ age: 26 }), true);
assert.strictEqual(api.datingCandidateAgeOk({ age: 19, datingMinAge: 21 }), false, "21+ cards");

// 4) hydrate never invents a candidate age; switch stays off.
var hyd = read("js/seedops-dating-hydrate.js");
assert.ok(!/22 \+ \(Math\.abs/.test(hyd), "no index-based fallback age");
assert.ok(/var DATING_ENABLED = false;/.test(read("js/dating-flag.js")), "dating stays off until SeedOps recheck");

// 5) server SQL contract.
var sql = read("supabase/migrations/20261016_dating_age_gate.sql");
assert.ok(/NOT auto-run/.test(sql));
assert.ok(/coalesce\(public\.cognation_user_age\(p_user\) >= 18, false\)/.test(sql), "unknown age fails closed");
assert.ok(/if not public\.cognation_dating_enabled\(\) then return;/.test(sql));
assert.ok(/if not public\.cognation_dating_age_ok\(v_viewer\) then return;/.test(sql));
assert.ok(/vp\.account_kind = 'seed'/.test(sql) && /p\.account_kind = 'seed'/.test(sql), "seed<->seed only");
assert.ok(/cognation_user_age\(p\.user_id\) is not null\s+and public\.cognation_user_age\(p\.user_id\) >= 18/.test(sql), "pool 18+ known");
console.log("dating-age-gate ok");

// 6) Missing birth year = access age 13 (not under-13, not 28).
api.setMemberProfile({ age: 28 });
api.setDatingBirthAge(null);
assert.strictEqual(api.getMemberAge(), 13, "missing birth reads 13, never stale 28");
assert.ok(api.getMemberAge() >= 13, "not treated as under-13");
api.setMemberProfile({ age: 11 });
assert.strictEqual(api.getMemberAge(), 11, "lower stored age (Sage) still wins");
api.setDatingBirthAge(26);
assert.strictEqual(api.getMemberAge(), 26, "real birth age used");
assert.ok(/coalesce\(public\.cognation_user_age\(p_user\), 13\)/.test(sql), "server access age 13 when missing");
assert.ok(/birth-prompt\.js/.test(read("index.html")), "one-time birth ask kept");
console.log("dating-age-gate access-age ok");

// 7) Local cache can never override the server birth age; missing never 18+.
api.setMemberProfile({ age: 28 }); api.setDatingBirthAge(17);
assert.strictEqual(api.getMemberAge(), 17, "cache 28 cannot override server 17");
assert.strictEqual(api.datingAllowed(), false);
["", null, "abc", -1, 0].forEach(function (bad) {
  api.setMemberProfile({ age: 28 }); api.setDatingBirthAge(bad);
  assert.ok(api.getMemberAge() < 18, "unreadable birth " + bad + " never 18+");
  assert.strictEqual(api.datingAllowed(), false);
});
console.log("dating-age-gate cache-override ok");
