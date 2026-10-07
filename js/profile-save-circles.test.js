/**
 * Profile Save + social circle buttons (both profile kinds).
 * Run: node js/profile-save-circles.test.js
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

var tower = src("js/tower.js");
var html = src("index.html");
var css = src("css/styles.css");

assert.ok(
  /data-tower-save-profile/.test(html) && /type="submit"/.test(html) && /Save profile/.test(html),
  "Edit Profile has a visible Save profile submit button"
);
assert.ok(
  /data-tower-social-links/.test(html) && /tower-sticker--social/.test(html),
  "scrapbook keeps the social circle sticker shell"
);
assert.ok(
  /\.tower-social-btn--youtube/.test(css) && /\.tower-social-btn--instagram/.test(css),
  "circle button styles still present"
);
assert.ok(
  tower.indexOf('SOCIAL_LINKS_LOCAL_KEY = "cognation.tower.social-links.v1"') !== -1,
  "per-profile social links local key present"
);
assert.ok(
  /function applyOwnerSocialLinks/.test(tower) &&
    /applyOwnerSocialLinks\(p, legacy, local\)/.test(tower),
  "owner social links restored on get() for personal and professional"
);
assert.ok(
  /function flushSocialFieldsFromForm/.test(tower) &&
    /flushSocialFieldsFromForm\(root\)/.test(tower),
  "closing Edit Profile flushes typed social URLs"
);
assert.ok(
  /writeSocialLinksLocal\(p\._profileId, p\.socialLinks\)/.test(tower),
  "Save profile and social drafts write the local social-links note"
);
assert.ok(
  /var nextEmoji = Array\.isArray\(p\.emojiStickers\)\s*\n\s*\? p\.emojiStickers/.test(tower) ||
    /var nextEmoji = Array\.isArray\(p\.emojiStickers\)\s*\? p\.emojiStickers/.test(tower),
  "empty emojiStickers persist (removal sticks)"
);
assert.ok(
  /data-tower-emoji[\s\S]*?pEmoji\.emojiStickers = keptEmoji/.test(tower) ||
    /var emojiId = selected\.getAttribute\("data-tower-emoji"\)[\s\S]*?pEmoji\.emojiStickers = keptEmoji/.test(tower),
  "Backspace on an emoji drops it from emojiStickers"
);
assert.ok(
  /function commitSocialDraft[\s\S]{0,160}if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "social edits stay owner-only"
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
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    CognationAuth: {
      getSession: function () { return session; },
      setActiveProfile: function (id) {
        session.activeProfileId = id;
      },
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
    URL: URL,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  });
  vm.runInContext(src("js/accounts.js"), context);
  vm.runInContext(tower, context);
  return windowStub;
}

var storage = memoryStorage();
var session = { username: "alexa", activeProfileId: "prof-alexa-professional" };
var win = boot(storage, session);
var accounts = win.CognationAccounts;
accounts.saveProfileRecord({
  id: "prof-alexa-professional",
  kind: "professional",
  accountUsername: "alexa",
  phone: "(312) 555-0100",
  displayName: "Alexa J Thomas",
  handle: "alexajt",
  socialLinks: {},
});
accounts.saveProfileRecord({
  id: "prof-alexa-personal",
  kind: "personal",
  accountUsername: "alexa",
  phone: "(312) 555-0100",
  displayName: "Alexa",
  handle: "alexa",
  socialLinks: {},
});

/* Simulate remote empty socialLinks (Supabase toTowerProfile) then owner restore. */
var store = win.CognationTowerProfileStore;
assert.ok(store, "TowerProfileStore exported");

/* Write social links the same way Save profile does (local note + accounts). */
storage.setItem(
  "cognation.tower.social-links.v1",
  JSON.stringify({
    "prof-alexa-professional": { youtube: "https://youtube.com/@alexa", x: "", meta: "", instagram: "", tiktok: "", linkedin: "", venmo: "" },
    "prof-alexa-personal": { youtube: "https://youtube.com/@alexa-personal", x: "", meta: "", instagram: "", tiktok: "", linkedin: "", venmo: "" },
  })
);

/* Inject a remote-shaped profile into load path via accounts only — restore should fill socialLinks. */
var pro = store.get();
assert.equal(pro._profileId, "prof-alexa-professional", "professional profile active");
assert.ok(
  pro.socialLinks && pro.socialLinks.youtube === "https://youtube.com/@alexa",
  "professional page restores YouTube circle link from local note"
);
assert.ok(
  /youtube\.com/.test(pro.socialLinks.youtube),
  "professional YouTube href is a usable URL"
);

session.activeProfileId = "prof-alexa-personal";
var personal = store.get();
assert.equal(personal._profileId, "prof-alexa-personal", "personal profile active");
assert.ok(
  personal.socialLinks && personal.socialLinks.youtube === "https://youtube.com/@alexa-personal",
  "personal page restores its own YouTube circle link"
);

/* Empty emoji stickers must survive scrapbook write (removal sticks). */
var emojiStore = memoryStorage();
emojiStore.setItem(
  "cognation.scrapbookLayout.v1",
  JSON.stringify({
    "prof-alexa-personal": {
      widgetLayout: {},
      emojiStickers: [{ id: "emoji-heart", glyph: "❤️", size: 64 }],
      quoteStickers: [],
      friendPinLayout: {},
    },
  })
);
session.activeProfileId = "prof-alexa-personal";
var win2 = boot(emojiStore, session);
win2.CognationAccounts.saveProfileRecord({
  id: "prof-alexa-personal",
  kind: "personal",
  accountUsername: "alexa",
  phone: "(312) 555-0100",
  displayName: "Alexa",
  handle: "alexa",
  emojiStickers: [],
  socialLinks: {},
});
var pEmpty = win2.CognationTowerProfileStore.get();
pEmpty.emojiStickers = [];
assert.ok(win2.CognationTowerProfileStore.save(pEmpty), "owner can save empty emoji list");
var rawLayout = JSON.parse(emojiStore.getItem("cognation.scrapbookLayout.v1"));
var savedEmoji = rawLayout["prof-alexa-personal"] && rawLayout["prof-alexa-personal"].emojiStickers;
assert.ok(Array.isArray(savedEmoji) && savedEmoji.length === 0, "scrapbook layout keeps empty emojiStickers");

console.log("profile-save-circles.test.js: ok");
