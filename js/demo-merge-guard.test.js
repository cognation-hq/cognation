/**
 * accounts.js ensureSeeded / updateProfileTower on a shared browser.
 * 2a: a signed-in user's Tower copy (cognation.tower.profile.v1 stamped with
 *     ownerUserId) is never merged into the local demo record
 *     (prof-alexa-personal) — neither the create branch nor the one-time soft
 *     merge. Before, the demo record took the user's handle, so it "owned" it.
 * 2b: updateProfileTower checks for a handle clash only when the handle
 *     changes. Before, every Tower save carries the handle, so on a browser
 *     where the demo record already holds the user's handle the user's own
 *     save was refused ("already taken"), and the page repainted the OLD
 *     value (inline music set/clear reverted on the same page and on reload).
 *     A real change to a handle someone else holds is still refused.
 * Unchanged: an unstamped copy (local preview / old code paths) still merges
 * exactly as before, and the signed-out demo seeds exactly as before.
 * Run: node js/demo-merge-guard.test.js
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
var DEMO = "prof-alexa-personal";
var A = { username: "stub-a", source: "supabase", supabaseUserId: "u-a", activeProfileId: "p-a" };
var OLD = "https://www.youtube.com/watch?v=OLDOLDOLD01";
var NEW = "https://www.youtube.com/watch?v=NEWNEWNEW02";

function page(configured, preset) {
  var ls = store();
  Object.keys(preset || {}).forEach(function (k) { ls.setItem(k, preset[k]); });
  var doc = { addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var win = { localStorage: ls, document: doc, CognationSupabase: { configured: function () { return configured; } } };
  win.window = win;
  vm.runInNewContext(read("js/accounts.js"), { window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, JSON: JSON, Date: Date, console: console });
  return { ls: ls, accounts: win.CognationAccounts };
}
/* A's own Tower copy, as TowerProfileStore.save writes it (stamped). */
function aCopy(stamped) {
  var c = { handle: "stubme", displayName: "Stub A", bio: "A bio", musicUrl: OLD,
    widgetLayout: { header: { x: 1, y: 2 } }, customHtml: "<p>A</p>", avatarDataUrl: "data:image/png;base64,AAAA" };
  if (stamped) c.ownerUserId = "u-a";
  return c;
}
function demo(p) { return p.accounts.getProfileById(DEMO); }
function assertPristineDemo(rec, msg) {
  assert.ok(rec, msg + ": demo record exists");
  assert.strictEqual(rec.handle, "alexa", msg + ": demo keeps @alexa");
  assert.strictEqual(rec.displayName, "Alexa", msg + ": demo keeps its name");
  assert.ok(!("ownerUserId" in rec), msg + ": demo is not stamped to the user");
  assert.notStrictEqual(rec.musicUrl, OLD, msg + ": no user music");
  assert.notStrictEqual(rec.bio, "A bio", msg + ": no user bio");
  assert.notStrictEqual(rec.customHtml, "<p>A</p>", msg + ": no user html");
  assert.ok(!rec.__migratedFromLegacy, msg + ": no soft merge flag");
}

/* 2a, create branch (accounts.js ensureSeeded, demo record not there yet). */
function testStampedCopySkipsCreateMerge() {
  var p = page(true, { "cognation.session.v2": JSON.stringify(A), "cognation.tower.profile.v1": JSON.stringify(aCopy(true)) });
  p.accounts.ensureSeeded();
  assertPristineDemo(demo(p), "create branch, stamped copy");
  assert.strictEqual(JSON.parse(p.ls.getItem(TOWER)).ownerUserId, "u-a", "A's own copy stays as it was");
  assert.strictEqual(JSON.parse(p.ls.getItem(TOWER)).musicUrl, OLD);
}

/* 2a, soft merge (demo record exists, lacks avatar / layout / html). */
function testStampedCopySkipsSoftMerge() {
  var p = page(true, {});
  p.accounts.ensureSeeded(); /* signed-out boot: demo record created, no copy */
  assertPristineDemo(demo(p), "seeded demo");
  p.ls.setItem(SESSION, JSON.stringify(A));
  p.ls.setItem(TOWER, JSON.stringify(aCopy(true)));
  p.accounts.ensureSeeded();
  assertPristineDemo(demo(p), "soft merge, stamped copy");
  assert.ok(!demo(p).widgetLayout || !demo(p).widgetLayout.header, "no user layout");
  assert.notStrictEqual(demo(p).avatarDataUrl, "data:image/png;base64,AAAA", "no user photo");
}

/* Unchanged: an unstamped copy still merges as before (both branches, both modes). */
function testUnstampedCopyMergesAsBefore() {
  [false, true].forEach(function (configured) {
    var tag = configured ? "sign-in configured" : "local preview";
    var p = page(configured, { "cognation.tower.profile.v1": JSON.stringify(aCopy(false)) });
    p.accounts.ensureSeeded();
    var d = demo(p);
    assert.strictEqual(d.handle, "stubme", tag + ": create merge takes the copy's handle");
    assert.strictEqual(d.displayName, "Stub A", tag + ": and name");
    assert.strictEqual(d.musicUrl, OLD, tag + ": and music");
    assert.strictEqual(d.customHtml, "<p>A</p>", tag + ": and html");
    assert.deepStrictEqual(d.widgetLayout, { header: { x: 1, y: 2 } }, tag + ": and layout");

    var q = page(configured, {});
    q.accounts.ensureSeeded();
    q.ls.setItem(TOWER, JSON.stringify(aCopy(false)));
    q.accounts.ensureSeeded();
    var e = demo(q);
    assert.strictEqual(e.__migratedFromLegacy, true, tag + ": soft merge still runs once");
    assert.strictEqual(e.handle, "stubme", tag + ": soft merge takes the copy's fields");
    assert.deepStrictEqual(e.widgetLayout, { header: { x: 1, y: 2 } }, tag + ": soft merge layout");
  });
}

/* Unchanged: the signed-out demo. */
function testSignedOutDemoUnchanged() {
  [false, true].forEach(function (configured) {
    var p = page(configured, {});
    var r = p.accounts.ensureSeeded();
    assertPristineDemo(r.personal, configured ? "signed out, configured" : "signed out, preview");
    assert.strictEqual(r.personal.kind, "personal");
    assert.ok(r.professional && r.professional.kind === "professional", "demo pro record seeded");
    assert.strictEqual(r.account.username, "alexa");
    if (configured) assert.strictEqual(p.ls.getItem(TOWER), null, "no unstamped copy written");
    else assert.strictEqual(JSON.parse(p.ls.getItem(TOWER)).handle, "alexa", "preview mirror as before");
  });
}

/* A browser polluted before this fix: the demo record already holds A's handle. */
function polluted() {
  var p = page(true, { "cognation.session.v2": JSON.stringify(A) });
  p.accounts.ensureSeeded();
  var d = demo(p);
  d.handle = "stubme"; d.ownerUserId = "u-a";
  p.accounts.saveProfileRecord(d);
  p.accounts.saveProfileRecord({ id: "p-a", kind: "personal", handle: "stubme", displayName: "Stub A", musicUrl: OLD, ownerUserId: "u-a" });
  p.accounts.saveProfileRecord({ id: "p-b", kind: "personal", handle: "bee", displayName: "Bee" });
  return p;
}

/* 2b: the user's own save with an unchanged handle is accepted. */
function testUnchangedHandleSaves() {
  var p = polluted();
  var r = p.accounts.updateProfileTower("p-a", { handle: "stubme", displayName: "Stub A", musicUrl: NEW });
  assert.strictEqual(r.ok, true, "own save with the same handle: " + r.error);
  assert.strictEqual(p.accounts.getProfileById("p-a").musicUrl, NEW, "the new value is stored");
  var c = p.accounts.updateProfileTower("p-a", { handle: "@StubMe", musicUrl: "" });
  assert.strictEqual(c.ok, true, "same handle written differently is no change");
  assert.strictEqual(p.accounts.getProfileById("p-a").musicUrl, "", "a clear is stored");
  assert.strictEqual(p.accounts.getProfileById("p-a").handle, "stubme");
  assertPolluterKept(p);
}

/* 2b: a real change to a handle someone else holds is still refused. */
function testTakenHandleChangeRefused() {
  var p = polluted();
  var r = p.accounts.updateProfileTower("p-a", { handle: "bee", musicUrl: NEW });
  assert.strictEqual(r.ok, false, "change to a taken handle refused");
  assert.strictEqual(r.error, "Handle @bee is already taken.", "same wording as before");
  var stored = p.accounts.getProfileById("p-a");
  assert.strictEqual(stored.handle, "stubme", "stored handle unchanged");
  assert.strictEqual(stored.musicUrl, OLD, "refused save writes nothing");
  var f = p.accounts.updateProfileTower("p-a", { handle: "free-one" });
  assert.strictEqual(f.ok, true, "change to a free handle still works");
  assert.strictEqual(p.accounts.getProfileById("p-a").handle, "free-one");
}

/* Already-polluted browsers: stored data is left as it is. */
function assertPolluterKept(p) {
  var d = demo(p);
  assert.strictEqual(d.handle, "stubme", "polluted demo record is not cleaned up");
  assert.strictEqual(d.ownerUserId, "u-a");
  p.accounts.ensureSeeded();
  assert.strictEqual(demo(p).handle, "stubme", "ensureSeeded doesn't rewrite it either");
}

/* Same-page revert (#346 follow-up): inline music set / clear, then the page
   repaints from the account record. Fresh browser, signed in: A's Tower copy
   is stamped, ensureSeeded runs (resolveActiveProfileId), then the inline
   commit saves A's Tower blob (carries the unchanged handle). The account
   record must hold the new value for the repaint to show it. */
function testSamePageRevert() {
  var p = page(true, { "cognation.session.v2": JSON.stringify(A) });
  p.accounts.saveProfileRecord({ id: "p-a", kind: "personal", handle: "stubme", displayName: "Stub A", musicUrl: OLD, ownerUserId: "u-a" });
  assert.strictEqual(JSON.parse(p.ls.getItem(TOWER)).ownerUserId, "u-a", "A's stamped copy mirrored");
  p.accounts.ensureSeeded();
  assert.strictEqual(p.accounts.getProfileByHandle("stubme").id, "p-a", "@stubme still belongs to A");
  [NEW, ""].forEach(function (v) {
    var blob = Object.assign({}, aCopy(true), { musicUrl: v });
    var r = p.accounts.updateProfileTower("p-a", blob);
    assert.strictEqual(r.ok, true, "inline commit accepted (" + (v ? "set" : "clear") + "): " + r.error);
    assert.strictEqual(p.accounts.getProfileById("p-a").musicUrl, v, "repaint source holds the new value");
    p.accounts.ensureSeeded(); /* the next resolveActiveProfileId */
    assert.strictEqual(p.accounts.getProfileById("p-a").musicUrl, v, "still new after the next seed pass");
  });
}

testStampedCopySkipsCreateMerge();
testStampedCopySkipsSoftMerge();
testUnstampedCopyMergesAsBefore();
testSignedOutDemoUnchanged();
testUnchangedHandleSaves();
testTakenHandleChangeRefused();
testSamePageRevert();
console.log("demo-merge-guard.test.js: ok");
