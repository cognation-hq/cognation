/**
 * Real (non-seed) signed-in account with no user_birth row: honest rooms state.
 * Run: node js/real-account-rooms.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function mem() { var d = {}; return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; }
function load(signedIn) {
  var w = { CognationSupabase: { configured: function () { return true; }, getSession: function () { return signedIn ? { access_token: "t", user: { id: "u1" } } : null; } } };
  var ctx = vm.createContext({ window: w, document: { readyState: "complete", querySelector: function () { return null; }, querySelectorAll: function () { return []; }, addEventListener: function () {}, dispatchEvent: function () {} },
    localStorage: mem(), sessionStorage: mem(), console: console, CustomEvent: function () {}, setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number });
  vm.runInContext(fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8"), ctx);
  return w.CognationCommuneSwipe;
}
var api = load(true);
api.setDatingBirthAge(null);
assert.strictEqual(api.liveBirthMissing(), true, "real account without birth row");
assert.strictEqual(api.classroomAllowed(), false, "classrooms stay 18+");
var m = api.mapChatRoomError({ message: "under_13" });
assert.strictEqual(m.code, "no_birth", "null age is not reported as under 13");
assert.ok(/birth year and month/.test(m.message));
api.setDatingBirthAge(40);
assert.strictEqual(api.liveBirthMissing(), false);
assert.strictEqual(api.classroomAllowed(), true, "adult with birth row sees classrooms");
assert.strictEqual(api.mapChatRoomError({ message: "under_13" }).code, "under_13", "real under-13 unchanged");
assert.strictEqual(load(false).liveBirthMissing(), false, "signed-out unaffected");

var swipe = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
assert.ok(/data-commune-add-birth/.test(swipe) && /CognationBirthPrompt/.test(swipe), "empty state offers the birth month step");
assert.ok(!/fake room|demo room/i.test(swipe.slice(swipe.indexOf("liveBirthMissing()\n          ?"), swipe.indexOf("liveBirthMissing()\n          ?") + 800)), "no fake rooms in empty state");
var bp = fs.readFileSync(path.join(root, "js/birth-prompt.js"), "utf8");
assert.ok(/cognation:birth-saved/.test(bp), "birth prompt announces save");
var hy = fs.readFileSync(path.join(root, "js/seedops-dating-hydrate.js"), "utf8");
assert.ok(/"cognation:birth-saved"[\s\S]{0,200}removeItem\(BOOT_FLAG\)[\s\S]{0,60}run\(true\)/.test(hy), "re-reads birth age after save");
console.log("real-account-rooms tests passed");
