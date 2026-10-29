/**
 * Birth prompt seed skip trusts only real markers: account kind / fleet id on
 * the session, or a session username on the seed or ops auth domain. A real
 * member whose username or email starts with "seed-" / "ops-" still gets asked.
 * Run: node js/birth-prompt-seed-gate.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var src = fs.readFileSync(path.join(__dirname, "birth-prompt.js"), "utf8");

/* Built at runtime from parts: no literal addresses in tests (HH rule). */
function addr(local, parts) { return local + "@" + parts.join("."); }
var SEED_DOMAIN = ["seed", "cognation", "internal"];
var OPS_DOMAIN = ["ops", "cognation", "internal"];
var MEMBER_DOMAIN = ["example", "test"];

function run(session) {
  var calls = [];
  var store = {};
  var body = { classList: { add: function () {}, remove: function () {} }, appendChild: function () {} };
  var ctx = {
    setTimeout: function (fn) { fn(); },
    sessionStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } },
    document: {
      readyState: "complete", body: body,
      addEventListener: function () {},
      querySelector: function () { return null; },
      getElementById: function () { return null; },
      createElement: function () {
        return { setAttribute: function () {}, querySelector: function () { return null; }, isConnected: true };
      },
    },
    window: {},
  };
  var s = Object.assign({ source: "supabase", supabaseUserId: "u-1" }, session);
  ctx.window.CognationAuth = { getSession: function () { return s; } };
  var liveUser = { id: "u-1", app_metadata: { provider: "email" }, user_metadata: {} };
  if (s.selfSetUserMetadata) liveUser.user_metadata = { account_kind: "seed", seed_fleet_id: "seed-0005", seedops: true };
  ctx.window.CognationSupabase = {
    rest: function (t, o) { calls.push(t); return Promise.resolve([]); },
    getSession: function () { return { access_token: "t", user: liveUser }; },
  };
  vm.runInNewContext(src, ctx);
  return new Promise(function (res) {
    setImmediate(function () { setImmediate(function () { res(calls); }); });
  });
}

var realCases = [
  { username: "seed-fan" },
  { username: "ops-team" },
  { username: addr("seed-fan", MEMBER_DOMAIN) },
  { username: addr("ops-team", MEMBER_DOMAIN) },
  { username: addr("seed-0001", MEMBER_DOMAIN) },
  /* Member who self-set user_metadata account_kind seed / seed_fleet_id / seedops:
     the session comes from the profiles row (account_kind real), so still asked. */
  { username: addr("jordan", MEMBER_DOMAIN), accountKind: "real", selfSetUserMetadata: true },
];
var seedCases = [
  { username: addr("seed-0001", SEED_DOMAIN) },
  { username: addr("ops-mod", OPS_DOMAIN) },
  { username: "fleet_0a1b2c3d4e5f", accountKind: "seed" },
  { username: "fleet_0a1b2c3d4e5f", seedFleetId: "seed-0002" },
];

Promise.all(realCases.map(run).concat(seedCases.map(run))).then(function (r) {
  realCases.forEach(function (c, i) {
    assert.deepStrictEqual(r[i], ["user_birth"], "real member still asked: case " + i);
  });
  seedCases.forEach(function (c, i) {
    assert.deepStrictEqual(r[realCases.length + i], [], "seed/ops session skipped: case " + i);
  });
  console.log("birth-prompt-seed-gate.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
