/**
 * Item 4 (live check a3295a0): seed accounts could no longer create a "seed-…-pro" page,
 * because #200/#202 reserve the seed-/ops- prefixes for everyone. Fleet-only exception:
 * the signed-in owner's own Personal page is fleet-labelled (account_kind seed/ops or a
 * seed_fleet_id) => reserved prefixes allowed. Real members stay blocked.
 * Server backstop is SQL for PM review (not run): /workspace/seed-pro-create-sql/.
 * Run: node js/seed-pro-handle-fleet.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
function src(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function fnSource(code, name) {
  var start = code.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name + " present");
  var depth = 0;
  for (var i = code.indexOf("{", start); i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}
var social = src("js/supabase-social.js");
var rules = src("js/handle-reserved.js");
var ME = "u-seed-0252";

function boot(myProfiles) {
  var sent = [];
  var ctx = {
    window: {},
    identity: function () { return { activeProfileId: "p1", supabaseUserId: ME }; },
    profileForId: function () { return { id: "p1", user_id: ME, handle: "seed-skye-0252", display_name: "Skye", bio: "" }; },
    client: function () { return { rest: function (t, o) { sent.push(o.method + ":" + (o.body.handle || "")); return Promise.resolve([o.body]); } }; },
    cacheProfile: function (r) { return r; }, setActiveProfile: function () {}, emit: function () {},
    state: { myProfiles: myProfiles }, PROFILE_RETURN_COLUMNS: "id", String: String,
  };
  var rc = { window: ctx.window }; vm.createContext(rc); vm.runInContext(rules, rc);
  vm.createContext(ctx);
  var names = ["normalizeHandle", "updateCurrentProfile", "createProfessionalProfile", "reservedHandle", "reservedHandleMessage"];
  if (social.indexOf("function ownerIsFleet(") >= 0) names.push("ownerIsFleet", "fleetKindOf");
  vm.runInContext(names.map(function (n) { return fnSource(social, n); }).join("\n"), ctx);
  return { ctx: ctx, sent: sent };
}
var personal = function (extra) { return Object.assign({ id: "p1", user_id: ME, kind: "personal", handle: "seed-skye-0252" }, extra); };
var failed = 0;
var checks = [];
function check(name, run) {
  checks.push(Promise.resolve().then(run).then(function () { console.log("  pass  " + name); },
    function (e) { failed++; console.log("  FAIL  " + name + " :: " + e.message); }));
}
function created(myProfiles, handle) {
  var b = boot(myProfiles);
  return b.ctx.createProfessionalProfile({ handle: handle }).then(function () { return b.sent.join(); }, function () { return "blocked:" + b.sent.length; });
}

check("seed owner (Personal account_kind seed) can create seed-…-pro", function () {
  return created([personal({ account_kind: "seed", seed_fleet_id: "seed-0252" })], "seed-skye-0252-pro").then(function (r) { assert.strictEqual(r, "POST:seed-skye-0252-pro"); });
});
check("seed owner labelled only by seed_fleet_id can create seed-…-pro", function () {
  return created([personal({ account_kind: "real", seed_fleet_id: "seed-0252" })], "seed-skye-0252-pro").then(function (r) { assert.strictEqual(r, "POST:seed-skye-0252-pro"); });
});
check("ops owner can create ops-…-pro", function () {
  return created([personal({ account_kind: "ops", seed_fleet_id: "ops-wire" })], "ops-wire-pro").then(function (r) { assert.strictEqual(r, "POST:ops-wire-pro"); });
});
check("real member stays blocked (no request sent)", function () {
  return created([personal({ handle: "sam", account_kind: "real", seed_fleet_id: null })], "seed-sam-pro").then(function (r) { assert.strictEqual(r, "blocked:0"); });
});
check("only the owner's own Personal page counts (a seed Pro row alone does not)", function () {
  return created([personal({ account_kind: "real" }), { id: "pro9", user_id: ME, kind: "professional", handle: "seed-x-pro", account_kind: "seed" }], "seed-y-pro").then(function (r) { assert.strictEqual(r, "blocked:0"); });
});
check("profiles not loaded yet: blocked (fail closed)", function () {
  return created([], "seed-skye-0252-pro").then(function (r) { assert.strictEqual(r, "blocked:0"); });
});
check("Tower inline handle check honours the fleet owner", function () {
  var t = src("js/tower.js");
  var ctx = { window: { CognationSupabaseSocial: { ownerIsFleet: function () { return true; } } } };
  vm.createContext(ctx);
  vm.runInContext(["normalizeHandle", "reservedHandleChange"].map(function (n) { return fnSource(t, n); }).join("\n"), ctx);
  assert.strictEqual(ctx.reservedHandleChange("seed-skye-0252-pro"), false);
  ctx.window.CognationSupabaseSocial.ownerIsFleet = function () { return false; };
  assert.strictEqual(ctx.reservedHandleChange("seed-skye-0252-pro"), true);
});
check("signup stays blocked for everyone (no exception there)", function () {
  assert.ok(!/ownerIsFleet/.test(src("js/login-signup-shell.js")));
  assert.ok(!/ownerIsFleet/.test(rules));
});
Promise.all(checks).then(function () {
  if (failed) { console.error(failed + " failed"); process.exit(1); }
  console.log("seed-pro-handle-fleet.test.js ok");
});
