/**
 * Commune Personal | Professional pipe switch + Professional deck (Alexa GO 2026-10-07).
 * Run: node js/commune-professional-deck.test.js
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

function loadSwipe(localStorage, sessionStorage) {
  var windowStub = {};
  var documentStub = {
    readyState: "complete",
    querySelector: function () { return null; },
    addEventListener: function () {},
    dispatchEvent: function () {},
  };
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    console: console,
    CustomEvent: function CustomEvent(name, init) {
      this.type = name;
      this.detail = init && init.detail;
    },
    setTimeout: setTimeout,
    isFinite: isFinite,
    parseInt: parseInt,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
  });
  vm.runInContext(src("js/commune-swipe.js"), context);
  return windowStub.CognationCommuneSwipe;
}

var html = src("index.html");
var css = src("css/styles.css");
var swipeSrc = src("js/commune-swipe.js");

/* Pipe switch markup: same chrome as SIGNAL News | Feed (signal-subtabs + site-switch). */
var switchMatch = html.match(/<div class="commune-mode-switch[^"]*"[\s\S]*?<\/div>/);
assert.ok(switchMatch, "Commune Personal|Professional switch present");
var sw = switchMatch[0];
assert.ok(/signal-subtabs/.test(sw) && /site-switch/.test(sw), "switch reuses signal-subtabs + site-switch shell");
assert.ok(/data-commune-mode-btn="personal"[^>]*aria-selected="true"/.test(sw) || /aria-selected="true"[^>]*data-commune-mode-btn="personal"/.test(sw), "Personal active by default");
assert.ok(/class="[^"]*site-switch-side[^"]*is-active[^"]*"[^>]*>Personal</.test(sw), "active side carries site-switch-side is-active");
assert.ok(/data-commune-mode-btn="professional"/.test(sw) && />Professional</.test(sw), "Professional side present");
assert.ok(/site-switch-sep[^>]*>\|</.test(sw), "pipe separator");
assert.ok(html.indexOf("data-commune-mode-switch") < html.indexOf("data-commune-see-dating"), "switch sits in the Commune header");
assert.ok(/\.signal-subtab\.is-selected[\s\S]*?linear-gradient/.test(css), "lilac ombre active chrome exists for the shared class");
assert.ok(/\[data-commune-mode="professional"\] \.commune-dating-toggle-row/.test(css), "dating toggle hidden on Professional");
assert.ok(/\.commune-type-mark\[data-type-mark="popculture"\]/.test(css), "type marks styled on dark shell");

/* Personal stays default and unchanged. */
var api = loadSwipe(memoryStorage(), memoryStorage());
assert.strictEqual(api.getMode(), "personal");
assert.strictEqual(api.FEATURED_ORDER.join(","), "classroom,ad,chatroom,dating,content", "Personal 1:1 order unchanged");
assert.strictEqual(api.AD_MAX_MS, 3000, "ads max 3s");
assert.strictEqual(
  api.PRO_ORDER.join(","),
  "pro-webinar,pro-know,pro-research,pro-auction,pro-podcast,pro-field,pro-popculture",
  "Professional types"
);
var marks = api.PRO_ORDER.map(function (t) { return api.PRO_MARK[t]; });
assert.strictEqual(marks.join("|"), "Webinar|Professionals you might know|Research|Auction|Podcast|Field|Pop-culture", "visible type marks");

/* Adult viewer with friends, a dating pool, ads, and professional pages. */
function adultStores() {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, field: "Nursing", interests: ["public health", "insurance"] }));
  local.setItem("cognation.commune.seeDating.v1", "1");
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["friend"] },
      friend: { id: "friend", kind: "personal", displayName: "Friend", friendIds: ["ada", "sam"] },
      sam: { id: "sam", kind: "personal", displayName: "Sam", friendIds: ["friend"] },
      clinic: {
        id: "clinic",
        kind: "professional",
        handle: "clinic",
        displayName: "Clinic Studio",
        headline: "Public health education",
        marketingAd: { title: "Ad", body: "Book", videoUrl: "https://example.com/a.mp4" },
      },
    },
  }));
  return { local: local, session: memoryStorage() };
}

var stores = adultStores();
var adult = loadSwipe(stores.local, stores.session);
var personalDeck = adult.sampleDeck(24);
assert.ok(personalDeck.some(function (c) { return c.type === "know"; }), "Personal keeps people you may know");
assert.ok(personalDeck.every(function (c) { return !/^pro-/.test(c.type); }), "Personal has no Professional cards");

assert.strictEqual(adult.setMode("professional"), "professional");
assert.strictEqual(adult.getMode(), "professional");
assert.strictEqual(stores.session.getItem(adult.MODE_KEY), "professional", "mode stored for the session");

var proDeck = adult.sampleDeck(21);
assert.strictEqual(proDeck.length, 21);
var banned = ["dating", "know", "friend", "ad", "classroom", "chatroom", "fact", "wellness", "event", "content"];
proDeck.forEach(function (c) {
  assert.ok(/^pro-/.test(c.type), "Professional deck only: " + c.type);
  assert.ok(banned.indexOf(c.type) < 0, "no Personal / dating / friends cards on Professional");
  assert.ok(api.PRO_MARK[c.type], "each card has a type mark");
  assert.ok(c.why, "transparent: each card says why it shows");
});
var counts = {};
proDeck.forEach(function (c) { counts[c.type] = (counts[c.type] || 0) + 1; });
api.PRO_ORDER.forEach(function (t) {
  assert.strictEqual(counts[t], 3, "1:1 across Professional types: " + JSON.stringify(counts));
});
for (var i = 1; i < proDeck.length; i++) {
  assert.notStrictEqual(proDeck[i].type, proDeck[i - 1].type, "no back-to-back Professional type");
}

/* Professionals you might know = professional pages, ranked by shared interest; never personal friends. */
var know = proDeck.filter(function (c) { return c.type === "pro-know"; });
assert.ok(know.every(function (c) { return c.profileId === "clinic"; }), "pros-you-might-know uses professional pages only");
assert.ok(/public health/.test(know[0].why), "why line names the shared interest");

/* Research by interest + field / pop-culture tied to field. */
var research = proDeck.filter(function (c) { return c.type === "pro-research"; });
assert.ok(research.some(function (c) { return /public health/.test(c.title); }), "research matched to interests");
assert.ok(proDeck.some(function (c) { return c.type === "pro-field" && /nursing/.test(c.title); }), "field update tied to field");
assert.ok(proDeck.some(function (c) { return c.type === "pro-popculture" && /nursing/.test(c.title); }), "pop-culture tied to field");
var auction = proDeck.filter(function (c) { return c.type === "pro-auction"; })[0];
assert.ok(/webinar/i.test(auction.title) && /bot auction/i.test(auction.body) && /starter projects for sale/.test(auction.body), "weekly webinar + bot auction");
var podcasts = adult.buildProfessionalLanes()["pro-podcast"].map(function (c) { return c.title + " " + c.body; }).join(" ");
assert.ok(/not only Cognation experts/.test(podcasts) && /Ethical/i.test(podcasts) && /async/i.test(podcasts) && /Continuing education/i.test(podcasts), "podcast topics");

/* Placeholder cards are labeled demo; no invented live numbers/prices. */
proDeck.forEach(function (c) {
  if (c.type !== "pro-know") assert.strictEqual(c.demo, true, "placeholder flagged demo: " + c.id);
  assert.ok(!/\$\d|\d+ (members|listeners|attendees|bids)/i.test(c.title + " " + c.body), "no invented live data: " + c.id);
});
assert.ok(/Demo · placeholder/.test(swipeSrc) && /seedops-demo-badge/.test(swipeSrc), "visible Demo label on placeholder cards");
assert.ok(/data-type-mark=/.test(swipeSrc) && /Why you see this:/.test(swipeSrc), "type mark + why line rendered");

/* Swipe right on a professional page follows it; never sends a friend request. */
adult.settleSwipe(know[0], "right");
var follows = JSON.parse(stores.local.getItem(adult.FOLLOWS_KEY) || "[]");
assert.ok(follows.indexOf("clinic") >= 0, "pros-you-might-know swipe-right follows the page");
assert.strictEqual(stores.local.getItem("cognation.friend.requests.v1"), null, "no friend request from Professional");

/* Switching back restores the unchanged Personal mix. */
adult.setMode("personal");
assert.ok(adult.sampleDeck(20).every(function (c) { return !/^pro-/.test(c.type); }), "Personal restored");

/* No professional pages yet → one clearly labeled placeholder, not invented people. */
var empty = loadSwipe(memoryStorage(), memoryStorage());
empty.setMode("professional");
var emptyKnow = empty.buildProfessionalLanes()["pro-know"];
assert.strictEqual(emptyKnow.length, 1);
assert.strictEqual(emptyKnow[0].demo, true, "placeholder when no professional pages");
assert.ok(!empty.buildProfessionalLanes()["pro-auction"].length, "auction hidden when age unknown (18+)");

/* Under-13: G/PG only — no auction, no pro contact cards under 13. */
var kidLocal = memoryStorage();
kidLocal.setItem("cognation.member.profile.v1", JSON.stringify({ age: 12, interests: ["science"] }));
kidLocal.setItem("cognation.profiles.v1", stores.local.getItem("cognation.profiles.v1"));
var kidSession = memoryStorage();
kidSession.setItem("cognation.commune.mode", "professional");
var kid = loadSwipe(kidLocal, kidSession);
assert.strictEqual(kid.getMode(), "professional");
var kidDeck = kid.sampleDeck(15);
assert.ok(kidDeck.length > 0, "under-13 still gets a Professional deck");
assert.ok(kidDeck.every(function (c) {
  return c.type !== "pro-auction" && c.type !== "pro-know" && ["G", "PG"].indexOf(c.rating) >= 0;
}), "under-13 Professional is G/PG only");

console.log("commune-professional-deck.test.js: OK");
