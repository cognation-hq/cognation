/** Remove a top friend, reload, assert they stay gone. node js/top-friend-delete.test.js */
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var vm = require("vm");
var root = path.join(__dirname, "..");
var ORIGINAL = ["alex-rivera", "sam-okonkwo", "jordan-lee"];
var REMOVED = "alex-rivera";
var REMAINING = ["sam-okonkwo", "jordan-lee"];
var NEXT = "chris-patel";

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

function boot(storage, viewed) {
  var documentStub = {
    readyState: "loading",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () {
      return { style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } };
    },
  };
  var windowStub = {
    document: documentStub,
    localStorage: storage,
    sessionStorage: memoryStorage(),
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationSupabaseSocial: {
      active: function () { return true; },
      getViewedProfileId: function () { return viewed.id; },
      getTowerProfile: function () {
        return {
          _remote: true, displayName: viewed.name, handle: viewed.handle,
          featuredFriendIds: ORIGINAL.slice(), removedFriendPinIds: [], friendsDisplayCount: 3,
        };
      },
      getProfile: function () { return null; },
    },
  };
  windowStub.window = windowStub;
  var context = vm.createContext({
    window: windowStub, document: documentStub, localStorage: storage,
    sessionStorage: windowStub.sessionStorage, location: windowStub.location, console: console,
    CustomEvent: windowStub.CustomEvent, setTimeout: setTimeout, clearTimeout: clearTimeout, JSON: JSON,
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js/accounts.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "js/tower.js"), "utf8"), context);
  return windowStub;
}

function seed(storage) {
  storage.setItem("cognation.session.v2", JSON.stringify({
    source: "supabase", username: "seed-0001@seed.cognation.internal", activeProfileId: "prof-seed",
  }));
}

function account(win) {
  win.CognationAccounts.saveProfileRecord({
    id: "prof-seed", kind: "personal", accountUsername: "seed-0001@seed.cognation.internal",
    phone: "(312) 555-0199", handle: "seed-0001", displayName: "Seed",
    featuredFriendIds: [], removedFriendPinIds: [],
  });
}

function gone(ids, label) {
  assert.deepStrictEqual(ids, REMAINING, label);
  assert.ok(ids.indexOf(REMOVED) < 0 && ids.indexOf(NEXT) < 0, label + " no respawn");
}

var owner = { id: "prof-seed", handle: "seed-0001", name: "Seed" };

var storageA = memoryStorage();
seed(storageA);
var winA = boot(storageA, owner);
account(winA);
winA.CognationAccounts.updateProfileTower = function () { return { ok: false, error: "storage" }; };
var storeA = winA.CognationTowerProfileStore;
assert.deepStrictEqual(storeA.topFriendIds(), ORIGINAL, "remote starts as the original three");
assert.strictEqual(storeA.removeTopFriend(REMOVED), true, "owner remove");
var legacyA = JSON.parse(storageA.getItem("cognation.tower.profile.v1"));
assert.ok(legacyA.removedFriendPinIds.indexOf(REMOVED) >= 0, "legacy key stored the removal");
assert.strictEqual(JSON.stringify(winA.CognationAccounts.getProfileById("prof-seed").featuredFriendIds), "[]", "accounts row stayed stale");
gone(boot(storageA, owner).CognationTowerProfileStore.topFriendIds(), "legacy reload");

var storageB = memoryStorage();
seed(storageB);
var winB = boot(storageB, owner);
account(winB);
assert.strictEqual(winB.CognationTowerProfileStore.removeTopFriend(REMOVED), true, "accounts remove");
assert.ok(winB.CognationAccounts.getProfileById("prof-seed").removedFriendPinIds.indexOf(REMOVED) >= 0, "accounts stored it");
storageB.removeItem("cognation.tower.profile.v1");
gone(boot(storageB, owner).CognationTowerProfileStore.topFriendIds(), "accounts reload");

var viewer = boot(storageA, { id: "prof-hank", handle: "seed-hank-0030", name: "Hank" }).CognationTowerProfileStore;
assert.strictEqual(viewer.removeTopFriend(REMOVED), false, "viewer cannot remove");
assert.deepStrictEqual(viewer.topFriendIds(), ORIGINAL, "viewer does not inherit the removal");
console.log("top-friend-delete.test.js: ok");
