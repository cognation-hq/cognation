/**
 * Tower #tower-profile-{handle} on a shared browser, signed out with live
 * sign-in configured. A (Personal + Pro) used this browser and left stamped
 * records in cognation.profiles.v1. Opening A's handle (CognationTowerOpenProfile,
 * a follower link, a pasted link) resolved the page from the local registry
 * first (getProfileById / getProfileByHandle), so a signed-out visitor saw A's
 * local copy: name, slogan, inline music, custom HTML, Pro page.
 * Now the signed-out (not live) branch of resolveActiveProfileId reads a local
 * record only when CognationAccounts.localRecordVisible allows it (the same
 * guard as the #348/#349 readers); otherwise it goes on to the server lookups
 * and the existing "viewed:" fallback.
 * Unchanged: sign-in off (local preview) and a demo session resolve local
 * records exactly as before; unstamped records still resolve signed out.
 * The live signed-in branch is not touched (server-first already).
 * Real js/accounts.js + the real resolveActiveProfileId / localRecordShown
 * source from js/tower.js in a vm. No network, no DB, no writes outside the
 * in-memory storage.
 * Run: node --test js/tower-handle-leftover-guard.test.js
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
function fn(srcText, name) {
  var start = srcText.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " found in tower.js");
  var end = srcText.indexOf("\n  }\n", start);
  return srcText.slice(start, end + 4);
}
var TOWER_SRC = read("js/tower.js");

var A_UID = "u-ada";
function aRecords() {
  return {
    "p-ada": { id: "p-ada", kind: "personal", accountUsername: "ada", handle: "ada", displayName: "ADA LOCAL",
      slogan: "ADA SLOGAN", musicUrl: "https://www.youtube.com/watch?v=ADAADAADA01", ownerUserId: A_UID },
    "p-ada-pro": { id: "p-ada-pro", kind: "professional", accountUsername: "ada", handle: "ada-pro", displayName: "ADA PRO", ownerUserId: A_UID },
    "p-loose": { id: "p-loose", kind: "personal", accountUsername: "loose", handle: "loose", displayName: "UNSTAMPED" }
  };
}

/* mode: "live" (sign-in configured) or "off"; session: null | demo; liveToken: a
   live Supabase session object with no app session (signing back in). */
function boot(opts) {
  var ls = store();
  ls.setItem("cognation.profiles.v1", JSON.stringify({ profiles: aRecords() }));
  ls.setItem("cognation.accounts.v1", JSON.stringify({ accounts: [
    { username: "ada", phone: "", profileIds: ["p-ada", "p-ada-pro"] },
    { username: "loose", phone: "", profileIds: ["p-loose"] }] }));
  if (opts.session) ls.setItem("cognation.session.v2", JSON.stringify(opts.session));
  var doc = { addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var win = { localStorage: ls, document: doc,
    CognationSupabase: { configured: function () { return opts.mode === "live"; }, getSession: function () { return null; } } };
  win.window = win;
  var ctx = { window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, JSON: JSON, Date: Date, console: console, String: String };
  vm.runInNewContext(read("js/accounts.js"), ctx);
  var slugBox = { v: "" };
  var harness =
    "var __slug = null;\n" +
    "function towerProfileSlug() { return __slug.v; }\n" +
    "function liveSignedInForTower() { return false; }\n" +
    "function getSessionObject() { try { return JSON.parse(localStorage.getItem('cognation.session.v2') || 'null'); } catch (e) { return null; } }\n" +
    "function slugIsViewerOwn() { return false; }\n" +
    "function normalizeHandle(h) { return String(h || '').replace(/^@/, '').toLowerCase(); }\n" +
    "function remoteSocial() { return null; }\n" +
    "function directoryFriendBySlug() { return null; }\n" +
    "function signInPending() { return false; }\n" +
    fn(TOWER_SRC, "localRecordShown") + "\n" +
    fn(TOWER_SRC, "resolveActiveProfileId") + "\n" +
    "this.__resolve = function (box) { __slug = box; return resolveActiveProfileId(); };";
  vm.runInNewContext(harness, ctx);
  return function (slug) { slugBox.v = slug; return ctx.__resolve(slugBox); };
}

var DEMO_SESSION = { username: "demo", source: "demo", activeProfileId: "prof-alexa-personal", profileKind: "personal" };

test("signed out, live sign-in configured: A's stamped leftovers are not resolved by id or handle", function () {
  var resolve = boot({ mode: "live", session: null });
  assert.strictEqual(resolve("ada"), "viewed:ada", "A's handle");
  assert.strictEqual(resolve("ada-pro"), "viewed:ada-pro", "A's Pro handle");
  assert.strictEqual(resolve("p-ada"), "viewed:p-ada", "A's Personal id");
  assert.strictEqual(resolve("p-ada-pro"), "viewed:p-ada-pro", "A's Pro id");
});

test("signed out, live sign-in configured: unstamped local records still resolve (as before)", function () {
  var resolve = boot({ mode: "live", session: null });
  assert.strictEqual(resolve("loose"), "p-loose");
  assert.strictEqual(resolve("p-loose"), "p-loose");
});

test("unchanged: sign-in off and a demo session resolve every local record as before", function () {
  [{ mode: "off", session: null }, { mode: "off", session: DEMO_SESSION }, { mode: "live", session: DEMO_SESSION }].forEach(function (o) {
    var resolve = boot(o);
    var tag = o.mode + (o.session ? " demo" : " no session");
    assert.strictEqual(resolve("ada"), "p-ada", tag + ": A's handle");
    assert.strictEqual(resolve("ada-pro"), "p-ada-pro", tag + ": A's Pro handle");
    assert.strictEqual(resolve("p-ada"), "p-ada", tag + ": A's id");
    assert.strictEqual(resolve("loose"), "p-loose", tag + ": unstamped");
  });
});
