/**
 * Top friends stay on the viewed profile, Go live is owner-only, reaction faces are 22/14.
 * Run: node js/profile-fixes.test.js
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

var css = src("css/styles.css");
assert.ok(
  /\.tower-react-face\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;[^}]*font-size:\s*14px;/.test(css),
  "tower reaction face is 22px and the mark is 14px"
);
assert.ok(
  /\.news-comment-react-chip\s*\{[^}]*height:\s*22px;[^}]*min-width:\s*22px;[^}]*font-size:\s*14px;/.test(css),
  "news comment reaction face is 22px and the mark is 14px"
);
assert.ok(
  /\.news-comment-react-count\s*\{\s*font-size:\s*0\.62rem;/.test(css),
  "news reaction count text is unchanged"
);
assert.ok(
  /\.tower-react-pill-count\s*\{[^}]*font-size:\s*0\.72rem;/.test(css),
  "tower reaction count text is unchanged"
);
assert.ok(
  /\[data-tower-app\]\[data-tower-is-owner="false"\] \[data-go-live\]\s*\{[^}]*display:\s*none !important;/.test(css),
  "go live is hidden when the viewer is not the account"
);

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

function boot(storage, session) {
  var listeners = {};
  var documentStub = {
    readyState: "complete",
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
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
  };
  windowStub.window = windowStub;
  storage.setItem("cognation.session.v2", JSON.stringify(session));
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

var session = {
  username: "alexa",
  activeProfileId: "prof-alexa-professional",
  profileKind: "professional",
};
var win = boot(memoryStorage(), session);
var accounts = win.CognationAccounts;
assert.strictEqual(accounts.DEMO_ALEXA.professionalId, "prof-alexa-professional");
assert.strictEqual(
  accounts.getProfileById("prof-alexa-professional").kind,
  "professional",
  "signed-in page is the professional profile"
);

accounts.saveProfileRecord({
  id: "prof-seed-0002",
  kind: "personal",
  accountKind: "seed",
  isSeed: true,
  seedFleetId: "seed-0002",
  accountUsername: "seed-0002",
  phone: "",
  handle: "seed-lia-0002",
  displayName: "Lia",
  featuredFriendIds: ["prof-seed-0042"],
});
accounts.saveProfileRecord({
  id: "prof-seed-0042",
  kind: "personal",
  accountKind: "seed",
  isSeed: true,
  seedFleetId: "seed-0042",
  accountUsername: "seed-0042",
  phone: "",
  handle: "seed-maya-0042",
  displayName: "Maya",
  featuredFriendIds: ["prof-seed-0002", "alex-rivera", "prof-alexa-professional"],
  friendIds: ["prof-seed-0002", "alex-rivera", "prof-alexa-professional"],
});
accounts.saveProfileRecord({
  id: "prof-sam",
  kind: "personal",
  accountKind: "real",
  accountUsername: "sam",
  phone: "(312) 555-0191",
  handle: "sam",
  displayName: "Sam",
  featuredFriendIds: ["prof-seed-0002", "alex-rivera"],
});
accounts.saveProfileRecord({
  id: "prof-lee",
  kind: "personal",
  accountKind: "real",
  accountUsername: "lee",
  phone: "(312) 555-0192",
  handle: "lee",
  displayName: "Lee",
  featuredFriendIds: [],
  friendIds: [],
});

var store = win.CognationTowerProfileStore;
win.location.hash = "#tower-profile-seed-maya-0042";
var maya = store.get();
assert.strictEqual(maya._profileId, "prof-seed-0042", "Maya's page stays Maya");
assert.notStrictEqual(maya._profileId, "prof-alexa-professional");
assert.strictEqual(
  JSON.stringify(store.topFriendIds()),
  JSON.stringify(["prof-seed-0002"]),
  "a seed's top friends are other seeds only"
);

var goLive = {
  hidden: false,
  attrs: {},
  setAttribute: function (k, v) { this.attrs[k] = v; },
  removeAttribute: function (k) { delete this.attrs[k]; },
};
var liveStage = { hidden: false };
var towerRoot = {
  attrs: {},
  setAttribute: function (k, v) { this.attrs[k] = v; },
  getAttribute: function (k) { return this.attrs[k] || null; },
  classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
  querySelector: function () { return null; },
  querySelectorAll: function (sel) {
    sel = String(sel);
    if (sel.indexOf("data-go-live") >= 0) return [goLive];
    if (sel.indexOf("data-live-stage") >= 0) return [liveStage];
    return [];
  },
};
win.document.querySelectorAll = function (sel) {
  if (sel === "[data-tower-app]") return [towerRoot];
  return [];
};
win.CognationTowerApplySide("public");
assert.strictEqual(towerRoot.getAttribute("data-tower-is-owner"), "false");
assert.strictEqual(goLive.hidden, true, "go live is hidden on Maya");
assert.strictEqual(goLive.attrs.hidden, "");
assert.strictEqual(liveStage.hidden, true, "live stage is hidden on someone else's page");

win.document.querySelectorAll = function () { return []; };
win.CognationTowerOpenProfile("seed-lia-0002");
var lia = store.get();
assert.strictEqual(lia._profileId, "prof-seed-0002", "opening a top friend opens that seed");
assert.notStrictEqual(lia._profileId, "prof-alexa-professional");

win.location.hash = "#tower-profile-seed-maya-0042";
win.CognationTowerOpenProfile("alex-rivera");
var missed = store.get();
assert.notStrictEqual(missed._profileId, "prof-alexa-professional", "unresolved top friend does not open the professional profile");
assert.strictEqual(missed._profileKind, "personal");
assert.ok(String(missed._profileId).indexOf("viewed:") === 0);

win.location.hash = "#tower-profile-sam";
var sam = store.get();
assert.strictEqual(sam._profileId, "prof-sam");
assert.strictEqual(JSON.stringify(store.topFriendIds()), JSON.stringify(["alex-rivera"]), "a real person's top friends never include a seed");

win.location.hash = "#tower-profile-lee";
assert.strictEqual(store.get()._profileId, "prof-lee");
assert.strictEqual(JSON.stringify(store.topFriendIds()), "[]", "someone else's empty top friends are not replaced by the demo roster");

win.CognationTowerOpenProfile("alexa-pro");
assert.strictEqual(store.get()._profileId, "prof-alexa-professional", "the professional page still opens by its own handle");

var ownLive = {
  hidden: true,
  attrs: { hidden: "" },
  setAttribute: function (k, v) { this.attrs[k] = v; },
  removeAttribute: function (k) { delete this.attrs[k]; },
};
var ownRoot = {
  attrs: {},
  setAttribute: function (k, v) { this.attrs[k] = v; },
  getAttribute: function (k) { return this.attrs[k] || null; },
  classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
  querySelector: function () { return null; },
  querySelectorAll: function (sel) {
    if (String(sel).indexOf("data-go-live") >= 0) return [ownLive];
    return [];
  },
};
win.document.querySelectorAll = function (sel) {
  if (sel === "[data-tower-app]") return [ownRoot];
  return [];
};
win.CognationTowerApplySide("public");
assert.strictEqual(ownRoot.getAttribute("data-tower-is-owner"), "true");
assert.strictEqual(ownLive.hidden, false, "the account itself still has Go live");

console.log("profile-fixes.test.js: ok");
