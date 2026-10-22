/**
 * People search hides a mislabelled seed Pro page from real viewers
 * (Oct 22): seed Pro pages such as seed-shawn-0251-pro were saved with
 * account_kind 'real' and no fleet id, so they showed as real members.
 * Until seed-pulse-sql/02 relabels them, a 'seed-' Pro page takes its
 * owner's Personal account_kind / seed_fleet_id. A real member who picked
 * a 'seed-' handle stays real and visible. Seed viewers still see seeds.
 * Run: node js/search-hide-mislabeled-seed-pro.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var src = fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8");

function sliceFn(name) {
  var start = src.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name + " present");
  var depth = 0;
  for (var i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

var FNS = ["normalizeHandle", "cacheProfile", "profileForId", "profileForUser", "fleetKindOf",
  "ownerFleetKind", "effectiveAccountKind", "effectiveFleetId", "viewerIsFleet",
  "memberResults", "toTowerProfile"];

var SHAWN = "3a20e13b-0ff1-dd68-4d58-0bdc1d22fb4e";
var REAL = "11111111-2222-3333-4444-555555555555";
var ALEXA = "b3708574-46b7-48d3-9f78-b8f7c1b1c7d4";
var ROWS = [
  { id: "p-shawn", user_id: SHAWN, kind: "personal", handle: "seed-shawn-0251", display_name: "Shawn", account_kind: "seed", seed_fleet_id: "seed-0251" },
  { id: "pro-shawn", user_id: SHAWN, kind: "professional", handle: "seed-shawn-0251-pro", display_name: "Shawn Pro", account_kind: "real", seed_fleet_id: null },
  { id: "p-real", user_id: REAL, kind: "personal", handle: "seedling", display_name: "Sam", account_kind: "real" },
  { id: "pro-real", user_id: REAL, kind: "professional", handle: "seed-sam-pro", display_name: "Sam Seed Pro", account_kind: "real" },
];

function world(mine) {
  var ctx = {
    me: { supabaseUserId: ALEXA },
    state: { profiles: {}, handles: {}, myProfiles: [] },
    identity: function () { return ctx.me; },
    isSageRow: function () { return false; },
    Object: Object, String: String,
  };
  vm.createContext(ctx);
  vm.runInContext(FNS.map(sliceFn).join("\n"), ctx);
  ROWS.forEach(function (r) { ctx.cacheProfile(r); });
  ctx.state.myProfiles = mine.map(function (r) { return ctx.cacheProfile(r); });
  return ctx;
}
function handles(list) { return list.map(function (p) { return p.handle; }).sort(); }

// Real viewer (Alexa): mislabelled seed Pro hidden; seed personal + real 'seed-' Pro shown.
var real = world([{ id: "p-alexa", user_id: ALEXA, kind: "personal", handle: "lolol", account_kind: "real" }]);
assert.deepStrictEqual(handles(real.memberResults("s")), ["seed-sam-pro", "seed-shawn-0251", "seedling"].sort());
assert.deepStrictEqual(handles(real.memberResults("seed-shawn-0251-pro")), []);
assert.strictEqual(real.memberResults("seed-sam-pro")[0].account_kind, "real", "real 'seed-' handle stays real");

// Seed viewer: still sees the seed Pro page, labelled seed with the owner's fleet.
var seed = world([{ id: "p-skye", user_id: "skye", kind: "personal", handle: "seed-skye-0252", account_kind: "seed", seed_fleet_id: "seed-0252" }]);
var hit = seed.memberResults("seed-shawn-0251-pro");
assert.strictEqual(hit.length, 1);
assert.strictEqual(hit[0].account_kind, "seed");
assert.strictEqual(hit[0].seed_fleet_id, "seed-0251");
assert.strictEqual(seed.state.profiles["pro-shawn"].account_kind, "real", "cache row not mutated");

// toTowerProfile (Demo badge + friend gate) and mapPost share the guard.
var t = real.toTowerProfile(real.state.profiles["pro-shawn"]);
assert.strictEqual(t.isSeed, true);
assert.strictEqual(t.accountKind, "seed");
assert.strictEqual(t.seedFleetId, "seed-0251");
var r = real.toTowerProfile(real.state.profiles["pro-real"]);
assert.strictEqual(r.isSeed, false);
assert.strictEqual(r.accountKind, "real");
assert.ok(/effectiveAccountKind\(author\)/.test(sliceFn("mapPost")), "mapPost uses owner-based kind");

// Owner not loaded: unchanged (shown, real) rather than guessing from the handle.
delete real.state.profiles["p-shawn"];
assert.strictEqual(real.effectiveAccountKind(real.state.profiles["pro-shawn"]), "real");

console.log("search-hide-mislabeled-seed-pro: ok");
