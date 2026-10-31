/**
 * Friend pictures on a shared browser. A used this browser and left stamped
 * records (ownerUserId = A) in cognation.profiles.v1, with a local
 * avatarDataUrl. paintFriendPicture looked the friend up with
 * getProfileByHandle and painted that local photo with no visibility check.
 * paintRingFace (the PULSE halo spots, via CognationCircleFall.fillSpots) and
 * circleTopicPhoto use it, so signed-in B with A as a server friend saw A's
 * LOCAL photo in the halo whenever the server row had no photo_url, or the
 * photo_url failed to load (fallBackIfPhotoFails repaints with paintRingFace).
 * Now paintFriendPicture paints a local photo only when
 * CognationAccounts.localRecordVisible allows that record (localRecordShown,
 * the same guard as #348/#349/#350); otherwise it keeps the initials it
 * already painted, exactly what a fresh browser shows.
 * Unchanged: sign-in off, a demo session, the viewer's own stamped records,
 * and unstamped records signed out paint the local photo as before. A server
 * photo_url that loads still wins (paintCircleRingShell, not touched).
 * Real js/accounts.js + the real tower.js functions in a vm. No network, no
 * DB, no writes outside the in-memory storage.
 * Run: node --test js/tower-friend-picture-guard.test.js
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

var PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
var A_UID = "u-ada";
var B_UID = "u-bee";
function records() {
  return {
    "p-ada": { id: "p-ada", kind: "personal", accountUsername: "ada", handle: "ada", displayName: "ADA LOCAL",
      avatarDataUrl: PNG, ownerUserId: A_UID },
    "p-bee-pal": { id: "p-bee-pal", kind: "personal", accountUsername: "beepal", handle: "beepal", displayName: "BEE OWN",
      avatarDataUrl: PNG, ownerUserId: B_UID },
    "p-loose": { id: "p-loose", kind: "personal", accountUsername: "loose", handle: "loose", displayName: "UNSTAMPED",
      avatarDataUrl: PNG }
  };
}

/* mode: "live" (sign-in configured) or "off"; session: null | demo | B signed in;
   liveToken: a live Supabase session with no app session (signing back in). */
function boot(opts) {
  var ls = store();
  ls.setItem("cognation.profiles.v1", JSON.stringify({ profiles: records() }));
  ls.setItem("cognation.accounts.v1", JSON.stringify({ accounts: [
    { username: "ada", phone: "", profileIds: ["p-ada"] },
    { username: "beepal", phone: "", profileIds: ["p-bee-pal"] },
    { username: "loose", phone: "", profileIds: ["p-loose"] }] }));
  if (opts.session) ls.setItem("cognation.session.v2", JSON.stringify(opts.session));
  var doc = { addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var win = { localStorage: ls, document: doc,
    CognationSupabase: { configured: function () { return opts.mode === "live"; },
      getSession: function () { return opts.liveToken || null; } } };
  win.window = win;
  var ctx = { window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, JSON: JSON, Date: Date, console: console, String: String };
  vm.runInNewContext(read("js/accounts.js"), ctx);
  var before = JSON.stringify(ls._d);
  var harness =
    "var FRIEND_AVATAR_COLORS = ['#f5c6d6', '#c6e2f5'];\n" +
    fn(TOWER_SRC, "friendHandleFromId") + "\n" +
    fn(TOWER_SRC, "friendInitials") + "\n" +
    fn(TOWER_SRC, "friendAvatarStyle") + "\n" +
    fn(TOWER_SRC, "localRecordShown") + "\n" +
    fn(TOWER_SRC, "paintFriendPicture") + "\n" +
    fn(TOWER_SRC, "pulseRingInitials") + "\n" +
    fn(TOWER_SRC, "paintRingFace") + "\n" +
    "this.__paint = paintFriendPicture; this.__ring = paintRingFace;";
  vm.runInNewContext(harness, ctx);
  return {
    paint: function (handle, name) { var n = node(); ctx.__paint(n, { id: handle, name: name }, 0); return n; },
    ring: function (handle, name) { var n = node(); ctx.__ring(n, { handle: handle, name: name, userId: "srv-" + handle }, 0); return n; },
    storageUnchanged: function () { return JSON.stringify(ls._d) === before; }
  };
}
function node() {
  var attrs = {};
  return { style: {}, textContent: "", attrs: attrs,
    setAttribute: function (k, v) { attrs[k] = String(v); }, removeAttribute: function (k) { delete attrs[k]; } };
}
function hasLocalPhoto(n) { return String(n.style.backgroundImage || "").indexOf("data:image/png") >= 0; }

var DEMO_SESSION = { username: "demo", source: "demo", activeProfileId: "prof-alexa-personal", profileKind: "personal" };
var B_SESSION = { username: "beepal", source: "supabase", supabaseUserId: B_UID, activeProfileId: "p-bee-pal", profileKind: "personal" };

test("signed-in B: A's stamped leftover photo is not painted (Top Friends picture, PULSE halo face)", function () {
  var t = boot({ mode: "live", session: B_SESSION });
  var pic = t.paint("ada", "Ada Server");
  assert.strictEqual(hasLocalPhoto(pic), false, "no local photo");
  assert.strictEqual(pic.textContent, "AS", "initials from the name it was given");
  var ring = t.ring("ada", "Ada Server");
  assert.strictEqual(hasLocalPhoto(ring), false, "halo: no local photo");
  assert.strictEqual("data-pulse-photo" in ring.attrs, false, "halo: not marked as a photo");
  assert.strictEqual(ring.textContent, "AS", "halo: server-name initials, as on a fresh browser");
  assert.ok(t.storageUnchanged(), "storage unchanged");
});

test("signed out, live sign-in configured: A's stamped photo is not painted; unstamped still is", function () {
  var t = boot({ mode: "live", session: null });
  assert.strictEqual(hasLocalPhoto(t.paint("ada", "Ada")), false, "A's stamped");
  assert.strictEqual(hasLocalPhoto(t.ring("ada", "Ada")), false, "A's stamped, halo");
  assert.strictEqual(hasLocalPhoto(t.paint("loose", "Loose")), true, "unstamped, as before");
  var back = boot({ mode: "live", session: null, liveToken: { access_token: "x", user: { id: "u-other" } } });
  assert.strictEqual(hasLocalPhoto(back.ring("ada", "Ada")), false, "live token, no app session");
  assert.ok(t.storageUnchanged() && back.storageUnchanged(), "storage unchanged");
});

test("unchanged: B's own stamped record still paints its local photo", function () {
  var t = boot({ mode: "live", session: B_SESSION });
  var ring = t.ring("beepal", "Bee");
  assert.strictEqual(hasLocalPhoto(ring), true);
  assert.ok("data-pulse-photo" in ring.attrs);
});

test("unchanged: sign-in off and a demo session paint every local photo as before", function () {
  [{ mode: "off", session: null }, { mode: "off", session: DEMO_SESSION }, { mode: "live", session: DEMO_SESSION }].forEach(function (o) {
    var t = boot(o);
    var tag = o.mode + (o.session ? " demo" : " no session");
    assert.strictEqual(hasLocalPhoto(t.paint("ada", "Ada")), true, tag + ": A");
    assert.strictEqual(hasLocalPhoto(t.ring("ada", "Ada")), true, tag + ": A halo");
    assert.strictEqual(hasLocalPhoto(t.paint("loose", "Loose")), true, tag + ": unstamped");
  });
});

test("signed in (or a live token): an unstamped record that is not the viewer's keeps initials (localRecordVisible rule)", function () {
  var t = boot({ mode: "live", session: B_SESSION });
  assert.strictEqual(hasLocalPhoto(t.paint("loose", "Loose")), false, "signed in");
  var back = boot({ mode: "live", session: null, liveToken: { access_token: "x", user: { id: "u-other" } } });
  assert.strictEqual(hasLocalPhoto(back.paint("loose", "Loose")), false, "live token");
});
