/**
 * #82 follow-up, shared device: Ada logs out, Alex signs in on the same browser.
 * - cognation.tower.profile.v1 is never rewritten unstamped after logout: the
 *   accounts mirror (seed / dating hydrates, demo seeding) writes it only for a
 *   record stamped to the signed-in user when sign-in is configured.
 * - Through logout and Alex's next sign-in the copy stays empty, or is stamped
 *   to Alex; it never holds Ada.
 * - The Tower header repaints on session-ended / session-started (it used to keep
 *   Ada's name and avatar in the DOM until Alex's server row loaded).
 * Run: node js/shared-device-tower-copy.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function store() {
  var d = {};
  return { _d: d, getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }
var TOWER = "cognation.tower.profile.v1";
var SESSION = "cognation.session.v2";
var ADA = { username: "seed-0001", source: "supabase", supabaseUserId: "u-ada", activeProfileId: "p-ada" };
var ALEX = { username: "seed-0003", source: "supabase", supabaseUserId: "u-alex", activeProfileId: "p-alex" };

function page(configured) {
  var ls = store();
  var doc = { addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var win = { localStorage: ls, document: doc, CognationSupabase: { configured: function () { return configured; } } };
  win.window = win;
  vm.runInNewContext(read("js/accounts.js"), { window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, JSON: JSON, Date: Date, console: console });
  return { ls: ls, accounts: win.CognationAccounts };
}
function towerCopy(ls) { var raw = ls.getItem(TOWER); return raw ? JSON.parse(raw) : null; }
function adaSeedRecord() { return { id: "prof-seed-0001", kind: "personal", displayName: "Ada", avatarDataUrl: "" }; }

function testLogoutThenAlex() {
  var p = page(true);
  assert.strictEqual(towerCopy(p.ls), null, "boot with sign-in configured: demo seeding doesn't write an unstamped copy");
  /* Ada signed in: a seed hydrate saves her (unstamped) seed record. */
  p.ls.setItem(SESSION, JSON.stringify(ADA));
  p.accounts.saveProfileRecord(adaSeedRecord());
  assert.strictEqual(towerCopy(p.ls), null, "a hydrated seed record is not mirrored as 'your' Tower copy");
  /* Ada's own Tower save (tower.js stamps ownerUserId) is mirrored, stamped. */
  p.accounts.saveProfileRecord(Object.assign(adaSeedRecord(), { id: "p-ada", ownerUserId: "u-ada" }));
  assert.strictEqual(towerCopy(p.ls).ownerUserId, "u-ada");
  /* Logout (login.js): session and both copies cleared. */
  p.ls.removeItem(SESSION); p.ls.removeItem(TOWER);
  /* In-flight hydrate lands after logout. */
  p.accounts.saveProfileRecord(adaSeedRecord());
  p.accounts.saveProfileRecord(Object.assign(adaSeedRecord(), { id: "p-ada", ownerUserId: "u-ada" }));
  p.accounts.ensureSeeded();
  assert.strictEqual(towerCopy(p.ls), null, "nothing rewrites the copy after logout");
  /* Alex signs in; hydrates run again. */
  p.ls.setItem(SESSION, JSON.stringify(ALEX));
  p.accounts.saveProfileRecord(adaSeedRecord());
  p.accounts.saveProfileRecord(Object.assign(adaSeedRecord(), { id: "p-ada", ownerUserId: "u-ada" }));
  assert.strictEqual(towerCopy(p.ls), null, "Ada's records never land in Alex's copy");
  p.accounts.saveProfileRecord({ id: "p-alex", kind: "personal", displayName: "Alex", ownerUserId: "u-alex" });
  var copy = towerCopy(p.ls);
  assert.strictEqual(copy.ownerUserId, "u-alex", "Alex's own save: stamped to Alex");
  assert.strictEqual(copy.displayName, "Alex");
}

function testLocalPreviewUnchanged() {
  var p = page(false);
  assert.ok(towerCopy(p.ls), "local preview: demo seeding still mirrors the copy");
  p.accounts.saveProfileRecord(adaSeedRecord());
  assert.strictEqual(towerCopy(p.ls).displayName, "Ada", "local preview mirror unchanged");
}

function testHeaderRepaintsOnSessionChange() {
  var src = read("js/tower.js");
  assert.ok(/\["cognation:session-ended", "cognation:session-started"\]\.forEach\(function \(name\) \{\s*document\.addEventListener\(name, function \(\) \{ renderProfileChrome\(root\); \}\);/.test(src),
    "Tower header repaints on logout and sign-in");
  assert.ok(/function legacyTowerBlob\(\)[\s\S]{0,400}legacyBlobOwned\(parsed\) \? parsed : null/.test(src), "the copy is read only through legacyBlobOwned");
}

testLogoutThenAlex();
testLocalPreviewUnchanged();
testHeaderRepaintsOnSessionChange();
console.log("shared-device-tower-copy.test.js: ok");
