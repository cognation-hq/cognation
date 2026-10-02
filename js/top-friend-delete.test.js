/**
 * Top friend delete sticks across reload.
 * Run: node js/top-friend-delete.test.js
 *
 * Remote store.get() still returns the original three. The removal lives in
 * the local store a fresh read actually hydrates (legacy key and/or accounts).
 */
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

var ORIGINAL = ["alex-rivera", "sam-okonkwo", "jordan-lee"];
var REMOVED = "alex-rivera";
var REMAINING = ["sam-okonkwo", "jordan-lee"];
var REPLACEMENT = "chris-patel";

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

function bootTower(storage, viewed) {
  var listeners = {};
  var documentStub = {
    readyState: "loading",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
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
        children: [],
        setAttribute: function () {},
        appendChild: function (c) { this.children.push(c); },
        querySelectorAll: function () { return []; },
      };
    },
  };
  var windowStub = {
    document: documentStub,
    localStorage: storage,
    sessionStorage: memoryStorage(),
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    CognationSupabaseSocial: {
      active: function () { return true; },
      getViewedProfileId: function () { return viewed.id; },
      getTowerProfile: function () {
        return {
          _remote: true,
          displayName: viewed.name,
          handle: viewed.handle,
          featuredFriendIds: ORIGINAL.slice(),
          removedFriendPinIds: [],
          friendsDisplayCount: 3,
        };
      },
      getProfile: function () { return null; },
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
    JSON: JSON,
  });
  vm.runInContext(src("js/accounts.js"), context);
  vm.runInContext(src("js/tower.js"), context);
  return windowStub;
}

function seedSession(storage) {
  storage.setItem("cognation.session.v2", JSON.stringify({
    source: "supabase",
    username: "seed-0001@seed.cognation.internal",
    activeProfileId: "prof-seed",
  }));
}

function seedAccount(win) {
  win.CognationAccounts.saveProfileRecord({
    id: "prof-seed",
    kind: "personal",
    accountUsername: "seed-0001@seed.cognation.internal",
    phone: "(312) 555-0199",
    handle: "seed-0001",
    displayName: "Seed",
    featuredFriendIds: [],
    removedFriendPinIds: [],
  });
}

function assertGone(ids, label) {
  assert.deepStrictEqual(ids, REMAINING, label + " set");
  assert.ok(ids.indexOf(REMOVED) < 0, label + " removed friend stays absent");
  assert.ok(ids.indexOf(REPLACEMENT) < 0, label + " does not respawn the next friend");
}

var ownerView = { id: "prof-seed", handle: "seed-0001", name: "Seed" };

/* Path A: accounts write cannot land. Legacy key is what reload reads. */
var storageA = memoryStorage();
seedSession(storageA);
var winA = bootTower(storageA, ownerView);
seedAccount(winA);
winA.CognationAccounts.updateProfileTower = function () {
  return { ok: false, error: "storage" };
};
var storeA = winA.CognationTowerProfileStore;
assert.deepStrictEqual(storeA.topFriendIds(), ORIGINAL, "remote get() starts as the original three");
assert.strictEqual(storeA.removeTopFriend(REMOVED), true, "owner remove persists");
var legacyA = JSON.parse(storageA.getItem("cognation.tower.profile.v1"));
assert.ok(legacyA.removedFriendPinIds.indexOf(REMOVED) >= 0, "removal written to cognation.tower.profile.v1");
assert.ok(legacyA.featuredFriendIds.indexOf(REMOVED) < 0, "legacy featured set dropped the friend");
assert.deepStrictEqual(
  winA.CognationAccounts.getProfileById("prof-seed").featuredFriendIds,
  [],
  "stale accounts row stays empty when the profile write cannot land"
);

var reloadedA = bootTower(storageA, ownerView);
assertGone(reloadedA.CognationTowerProfileStore.topFriendIds(), "legacy reload");
assert.ok(
  reloadedA.CognationTowerProfileStore.get().removedFriendPinIds.indexOf(REMOVED) >= 0,
  "fresh read still records the removal"
);

/* Path B: accounts row lands, legacy key is wiped, remote row is still the original three. */
var storageB = memoryStorage();
seedSession(storageB);
var winB = bootTower(storageB, ownerView);
seedAccount(winB);
var storeB = winB.CognationTowerProfileStore;
assert.strictEqual(storeB.removeTopFriend(REMOVED), true, "owner remove persists to accounts");
var savedB = winB.CognationAccounts.getProfileById("prof-seed");
assert.ok(savedB.removedFriendPinIds.indexOf(REMOVED) >= 0, "accounts profile stored the removal");
assert.ok(savedB.featuredFriendIds.indexOf(REMOVED) < 0, "accounts featured set dropped the friend");
storageB.removeItem("cognation.tower.profile.v1");
var reloadedB = bootTower(storageB, ownerView);
assertGone(reloadedB.CognationTowerProfileStore.topFriendIds(), "accounts reload");

/* A viewer cannot edit someone else's top friends, and does not inherit the removal. */
var viewer = bootTower(storageA, { id: "prof-hank", handle: "seed-hank-0030", name: "Hank" });
var viewerStore = viewer.CognationTowerProfileStore;
assert.strictEqual(viewerStore.removeTopFriend(REMOVED), false, "viewer remove is refused");
assert.deepStrictEqual(viewerStore.topFriendIds(), ORIGINAL, "viewer still sees the remote three");
assert.ok(
  (viewerStore.get().removedFriendPinIds || []).indexOf(REMOVED) < 0,
  "owner removal is not painted onto another tower"
);

console.log("top-friend-delete.test.js: ok");
