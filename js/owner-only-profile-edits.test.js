/**
 * Non-owners cannot persist another person's Tower profile edits.
 * Run: node js/owner-only-profile-edits.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    removeItem: function (key) {
      delete data[key];
    },
  };
}

function boot(storage, session, hash) {
  var listeners = {};
  var documentStub = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; } } },
    addEventListener: function (type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    removeEventListener: function () {},
    dispatchEvent: function (ev) {
      (listeners[ev.type] || []).forEach(function (fn) { fn(ev); });
      return true;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () {
      return {
        innerHTML: "",
        style: {},
        setAttribute: function () {},
        appendChild: function () {},
        querySelectorAll: function () { return []; },
      };
    },
  };
  var windowStub = {
    document: documentStub,
    localStorage: storage,
    sessionStorage: memoryStorage(),
    location: { hash: hash || "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    CognationAuth: {
      getSession: function () { return session; },
    },
  };
  windowStub.window = windowStub;
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: storage,
    sessionStorage: windowStub.sessionStorage,
    location: windowStub.location,
    console: console,
    CustomEvent: windowStub.CustomEvent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  });
  vm.runInContext(src("js/accounts.js"), context);
  vm.runInContext(src("js/tower.js"), context);
  return windowStub;
}

var tower = src("js/tower.js");
var css = src("css/styles.css");

assert.ok(
  /if \(!isTowerOwner\(data\)\) return false;/.test(tower),
  "save() refuses every non-owner write, including geometry"
);
assert.ok(
  tower.indexOf("if (data._remote && !isTowerOwner(data) && !opts.geometry) return false;") === -1,
  "geometry no longer bypasses the owner check"
);
assert.ok(
  /profileForm\.addEventListener\("submit"[\s\S]{0,180}if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "profile save submit is owner-only"
);
assert.ok(
  /function storeProfileImage[\s\S]{0,220}Only the profile owner can edit this profile/.test(tower),
  "avatar/polaroid image save is owner-only"
);
assert.ok(
  /function commitInlineName[\s\S]{0,120}if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "inline name edit is owner-only"
);
assert.ok(
  /function commitInlineSlogan[\s\S]{0,120}if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "inline bio/slogan edit is owner-only"
);
assert.ok(
  /function commitSocialDraft[\s\S]{0,120}if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "social edit is owner-only"
);
["data-tower-save-friends", "data-tower-save-badges", "data-tower-save-frame", "data-tower-music-look", "data-tower-choose-avatar"].forEach(function (sel) {
  assert.ok(
    css.indexOf('[data-tower-app]:not([data-tower-is-owner="true"]) [' + sel + "]") !== -1,
    "CSS hides " + sel + " for non-owners"
  );
});

var session = { username: "owner", activeProfileId: "prof-owner" };
var storage = memoryStorage();
var win = boot(storage, session, "#tower-profile-other");
var accounts = win.CognationAccounts;
accounts.saveProfileRecord({
  id: "prof-owner",
  kind: "personal",
  accountUsername: "owner",
  phone: "(312) 555-0101",
  handle: "owner",
  displayName: "Owner",
  slogan: "mine",
});
accounts.saveProfileRecord({
  id: "prof-other",
  kind: "professional",
  accountUsername: "someone",
  phone: "(312) 555-0199",
  handle: "other",
  displayName: "Other",
  slogan: "their bio",
  avatarDataUrl: "",
  musicUrl: "",
  polaroidDataUrl: "",
  featuredFriendIds: ["friend-a"],
  widgetLayout: { identity: { x: 1, y: 2, z: 3, tilt: 0 } },
});
accounts.saveProfileRecord({
  id: "prof-owner",
  kind: "personal",
  accountUsername: "owner",
  phone: "(312) 555-0101",
  handle: "owner",
  displayName: "Owner",
  slogan: "mine",
});

var store = win.CognationTowerProfileStore;
var viewed = store.get();
assert.strictEqual(viewed._profileId, "prof-other", "viewer is on the other profile");
assert.strictEqual(viewed.displayName, "Other");

viewed.displayName = "Hacked";
viewed.slogan = "not their bio";
viewed.avatarDataUrl = "data:image/jpeg;base64,aaaa";
viewed.musicUrl = "https://youtu.be/hacked";
viewed.polaroidDataUrl = "data:image/jpeg;base64,bbbb";
viewed.featuredFriendIds = ["friend-z"];
viewed.widgetLayout = { identity: { x: 80, y: 80, z: 9, tilt: 12 } };

assert.strictEqual(store.save(viewed), false, "non-owner save returns false");
assert.strictEqual(store.save(viewed, { geometry: true }), false, "non-owner geometry save returns false");

var storedOther = accounts.getProfileById("prof-other");
assert.strictEqual(storedOther.displayName, "Other", "name did not persist");
assert.strictEqual(storedOther.slogan, "their bio", "bio did not persist");
assert.ok(!storedOther.avatarDataUrl, "avatar did not persist");
assert.ok(!storedOther.musicUrl, "music did not persist");
assert.ok(!storedOther.polaroidDataUrl, "polaroid did not persist");
assert.strictEqual(JSON.stringify(storedOther.featuredFriendIds), JSON.stringify(["friend-a"]), "top friends did not persist");
assert.strictEqual(storedOther.widgetLayout.identity.x, 1, "sticker layout did not persist");
assert.strictEqual(storage.getItem("cognation.scrapbookLayout.v1"), null, "scrapbook overlay was not written");

var ownerWin = boot(storage, session, "");
var ownerStore = ownerWin.CognationTowerProfileStore;
var own = ownerStore.get();
assert.strictEqual(own._profileId, "prof-owner");
own.displayName = "Owner Renamed";
own.slogan = "still mine";
assert.strictEqual(ownerStore.save(own), true, "owner save still persists");
var storedOwner = ownerWin.CognationAccounts.getProfileById("prof-owner");
assert.strictEqual(storedOwner.displayName, "Owner Renamed", "owner name saved");
assert.strictEqual(storedOwner.slogan, "still mine", "owner bio saved");
assert.strictEqual(
  ownerWin.CognationAccounts.getProfileById("prof-other").displayName,
  "Other",
  "owner save did not touch the other profile"
);

console.log("owner-only-profile-edits.test.js: ok");
