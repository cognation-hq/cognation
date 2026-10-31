/**
 * accounts.js legacy mirror (cognation.tower.profile.v1) on a browser where the
 * demo record prof-alexa-personal was already polluted (stamped to user A by
 * the old ensureSeeded merge, before #347).
 * Before: every ensureSeeded pass (and the demo record's own Cognation-friend
 * save) mirrored the polluted demo record over A's legacy copy, because it is
 * stamped to A. A's inline music clear went to A's own record, then the next
 * seed pass put the demo record's old value back into the legacy copy, and the
 * Tower paint refilled the cleared field from it (restoreSavedTowerFields).
 * Now: the demo record is never mirrored while it carries an owner stamp, so
 * A's own saves keep the legacy copy. Stored records are not changed: the
 * polluted demo record stays exactly as it was.
 * Unchanged: fresh browsers (demo record unstamped) mirror exactly as before.
 * Run: node --test js/legacy-mirror-guard.test.js
 */
"use strict";
var assert = require("assert");
var test = require("node:test");
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
var PROFILES = "cognation.profiles.v1";
var SESSION = "cognation.session.v2";
var DEMO = "prof-alexa-personal";
var A = { username: "stub-me", source: "supabase", supabaseUserId: "u-a", activeProfileId: "p-a", profileKind: "personal" };
var OLD = "https://www.youtube.com/watch?v=OLDOLDOLD01";
var NEW = "https://www.youtube.com/watch?v=NEWNEWNEW02";

function page(configured, preset) {
  var ls = store();
  Object.keys(preset || {}).forEach(function (k) { ls.setItem(k, preset[k]); });
  var doc = { addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var win = { localStorage: ls, document: doc, CognationSupabase: { configured: function () { return configured; } } };
  win.window = win;
  vm.runInNewContext(read("js/accounts.js"), { window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, JSON: JSON, Date: Date, console: console });
  return { ls: ls, accounts: win.CognationAccounts, preset: preset };
}
/* Reload: same storage, accounts.js boots again (its boot runs ensureSeeded). */
function reload(p) {
  var snap = {};
  Object.keys(p.ls._d).forEach(function (k) { snap[k] = p.ls._d[k]; });
  return page(true, snap);
}
/* A's Tower blob as TowerProfileStore.save sends it (stamped). */
function aBlob(music) {
  return { handle: "stubme", displayName: "Stub Me", musicUrl: music, ownerUserId: "u-a" };
}

/* The POLLUTE=1 trace state: A signed in, A's own record p-a (stamped), and the
   demo record overwritten with A's copy (A's handle, A's music, A's stamp). */
function polluted(opts) {
  opts = opts || {};
  var p = page(true, { "cognation.session.v2": JSON.stringify(A) });
  p.accounts.saveProfileRecord({ id: "p-a", kind: "personal", accountUsername: "stub-me", handle: "stubme", displayName: "Stub Me", musicUrl: OLD, ownerUserId: "u-a" });
  var d = p.accounts.getProfileById(DEMO);
  d.handle = "stubme"; d.displayName = "Stub Me"; d.musicUrl = OLD; d.ownerUserId = "u-a";
  if (opts.noCognationFriend) d.friendIds = [];
  p.accounts.saveProfileRecord(d);
  return reload(p);
}
function demoRaw(p) { return JSON.stringify(JSON.parse(p.ls.getItem(PROFILES)).profiles[DEMO]); }
function legacy(p) { return JSON.parse(p.ls.getItem(TOWER) || "{}"); }
function stripTime(s) { return String(s).replace(/"updatedAt":\d+/g, '"updatedAt":0'); }

function check(p, v, tag) {
  assert.strictEqual(p.accounts.getProfileById("p-a").musicUrl, v, tag + ": account record");
  assert.strictEqual(legacy(p).musicUrl, v, tag + ": legacy copy");
  assert.strictEqual(legacy(p).ownerUserId, "u-a", tag + ": legacy copy is A's");
}

/* Clear and set stick through seed passes and a same-browser reload. */
function testClearAndSetStick() {
  [false, true].forEach(function (noFriend) {
    var p = polluted({ noCognationFriend: noFriend });
    var tag0 = noFriend ? " (demo record missing its Cognation friend)" : "";
    var demoBefore = demoRaw(p);
    [NEW, "", NEW, ""].forEach(function (v, i) {
      var what = (v ? "set" : "clear") + " #" + (i + 1) + tag0;
      var r = p.accounts.updateProfileTower("p-a", aBlob(v));
      assert.strictEqual(r.ok, true, what + ": saved " + r.error);
      check(p, v, what + ", right after the save");
      for (var n = 0; n < 3; n++) { p.accounts.ensureSeeded(); check(p, v, what + ", after seed pass " + (n + 1)); }
      p = reload(p);
      check(p, v, what + ", after a same-browser reload");
    });
    /* Read-only to stored data: the polluted demo record is left as it was
       (bar the Cognation friend the boot adds, as before). */
    var after = JSON.parse(demoRaw(p)), before = JSON.parse(demoBefore);
    assert.strictEqual(after.ownerUserId, "u-a", "demo record keeps its stamp" + tag0);
    assert.strictEqual(after.musicUrl, OLD, "demo record keeps its music" + tag0);
    assert.strictEqual(after.handle, "stubme", "demo record keeps its handle" + tag0);
    if (!noFriend) assert.strictEqual(stripTime(JSON.stringify(after)), stripTime(JSON.stringify(before)), "demo record byte-identical");
  });
}

/* A boot on a polluted browser with A's cleared copy already in place does not
   put the demo record's old music back into the copy. */
function testBootKeepsClearedCopy() {
  var p = polluted();
  p.ls.setItem(TOWER, JSON.stringify({ handle: "stubme", displayName: "Stub Me", musicUrl: "", ownerUserId: "u-a" }));
  p = reload(p);
  assert.strictEqual(legacy(p).musicUrl, "", "boot leaves the cleared copy");
  p.accounts.ensureSeeded();
  assert.strictEqual(legacy(p).musicUrl, "", "seed pass leaves the cleared copy");
}

/* Any field clear, not only music. */
function testOtherFieldClearSticks() {
  var p = polluted();
  var d = p.accounts.getProfileById(DEMO); /* the polluted record has a slogan */
  d.slogan = "OLD SLOGAN"; p.accounts.saveProfileRecord(d);
  var r = p.accounts.updateProfileTower("p-a", Object.assign(aBlob(""), { slogan: "" }));
  assert.strictEqual(r.ok, true);
  p.accounts.ensureSeeded();
  assert.strictEqual(legacy(p).slogan, "", "slogan clear stays in the legacy copy");
  p = reload(p);
  assert.strictEqual(legacy(p).slogan, "", "and after reload");
}

/* Unchanged: fresh browsers. The unstamped demo record mirrors as before on
   local preview and in a demo session; signed out with sign-in configured
   nothing unstamped is mirrored; signed in, A's own saves mirror. */
function testUnchangedPaths() {
  var off = page(false, {});
  assert.strictEqual(legacy(off).handle, "alexa", "sign-in off: demo record mirrored");
  var demoSess = page(true, { "cognation.session.v2": JSON.stringify({ username: "alexa", source: "demo", activeProfileId: DEMO }) });
  assert.strictEqual(legacy(demoSess).handle, "alexa", "demo session: demo record mirrored");
  var out = page(true, {});
  assert.strictEqual(out.ls.getItem(TOWER), null, "signed out, sign-in configured: no mirror");
  var fresh = page(true, { "cognation.session.v2": JSON.stringify(A) });
  assert.strictEqual(fresh.ls.getItem(TOWER), null, "fresh signed-in boot: demo record not mirrored");
  fresh.accounts.saveProfileRecord({ id: "p-a", kind: "personal", handle: "stubme", displayName: "Stub Me", musicUrl: OLD, ownerUserId: "u-a" });
  [NEW, ""].forEach(function (v) {
    assert.strictEqual(fresh.accounts.updateProfileTower("p-a", aBlob(v)).ok, true);
    fresh.accounts.ensureSeeded();
    check(fresh, v, "fresh browser " + (v ? "set" : "clear"));
  });
}

test("unchanged: fresh browser, demo session, signed out, sign-in off", testUnchangedPaths);
test("polluted browser: inline music clear and set stick (store, legacy copy, seed passes, reload)", testClearAndSetStick);
test("polluted browser: a boot keeps A's cleared legacy copy", testBootKeepsClearedCopy);
test("polluted browser: any field clear sticks (slogan)", testOtherFieldClearSticks);
