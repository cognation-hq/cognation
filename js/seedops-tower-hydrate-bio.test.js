/**
 * Seed Tower hydrate: the cached slogan follows the server bio (set, changed,
 * cleared), and the slogan display toggles to match. Other fields untouched.
 * Run: node js/seedops-tower-hydrate-bio.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var code = fs.readFileSync(path.join(__dirname, "seedops-tower-hydrate.js"), "utf8");

var records = {};
var win = {
  CognationSeedOps: {
    getByFleetId: function (fleet) { return { id: "local-" + fleet, displayName: "Ada" }; },
  },
  CognationAccounts: {
    getProfileById: function (id) { return records[id] ? JSON.parse(JSON.stringify(records[id])) : null; },
    saveProfileRecord: function (rec) { records[rec.id] = JSON.parse(JSON.stringify(rec)); },
  },
  addEventListener: function () {},
};
var ctx = vm.createContext({
  window: win,
  document: { readyState: "loading", addEventListener: function () {}, dispatchEvent: function () {} },
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
  CustomEvent: function () {},
  console: console,
  setTimeout: setTimeout,
});
vm.runInContext(code, ctx);
var api = win.CognationSeedOpsTowerHydrate;

function row(bio) {
  return { id: "srv-1", user_id: "u-1", handle: "ada", display_name: "Ada", bio: bio, seed_fleet_id: "seed-0001" };
}
function rec() { return records["local-seed-0001"]; }

/* First hydrate with an empty bio: no slogan, display off. */
api.mergeSeedProfiles([row("")]);
assert.strictEqual(rec().slogan || "", "");
assert.strictEqual(rec().publicWidgets.slogan, false);

/* Server bio set later: cache refreshes and display turns on. */
api.mergeSeedProfiles([row("Weekend hiker.")]);
assert.strictEqual(rec().slogan, "Weekend hiker.");
assert.strictEqual(rec().publicWidgets.slogan, true);

/* Changed (not only when empty). */
api.mergeSeedProfiles([row("Quiet mornings.")]);
assert.strictEqual(rec().slogan, "Quiet mornings.");
assert.strictEqual(rec().publicWidgets.slogan, true);

/* Owner hid the slogan; an unchanged bio must not flip it back on. */
var r = rec(); r.publicWidgets.slogan = false; records["local-seed-0001"] = r;
api.mergeSeedProfiles([row("Quiet mornings.")]);
assert.strictEqual(rec().publicWidgets.slogan, false, "unchanged bio keeps owner choice");

/* Cleared on the server: cache clears and display turns off. */
api.mergeSeedProfiles([row("")]);
assert.strictEqual(rec().slogan, "");
assert.strictEqual(rec().publicWidgets.slogan, false);

/* Row without a bio column leaves the cache alone. */
api.mergeSeedProfiles([row("Back again.")]);
var noBio = row(""); delete noBio.bio;
api.mergeSeedProfiles([noBio]);
assert.strictEqual(rec().slogan, "Back again.");
assert.strictEqual(rec().publicWidgets.friends, true, "other widgets untouched");

console.log("seedops-tower-hydrate-bio.test.js: ok");
