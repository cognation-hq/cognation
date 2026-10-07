/**
 * Cap 250 — Commune featured cards Personal 1:1 (Alexa lock 2026-10-02).
 * Run: node js/cap250-commune-featured-personal.test.js
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

var swipeSrc = src("js/commune-swipe.js");
var docs = src("docs/seedops.md");

/* Featured order is Classroom / ad / chat / dating / content — Personal only */
assert.ok(/FEATURED_ORDER\s*=\s*\[[\s\S]*CLASSROOM[\s\S]*AD[\s\S]*CHAT[\s\S]*DATING[\s\S]*CONTENT/.test(swipeSrc), "FEATURED_ORDER five families");
assert.ok(/CONTENT_SUBTYPES/.test(swipeSrc), "content subtypes pooled");
assert.ok(swipeSrc.indexOf("Professional toggle") === -1 || /no Professional toggle/.test(swipeSrc), "no Professional toggle product");
assert.ok(!/data-commune-mode.*professional|Personal\s*\|\s*Professional/.test(swipeSrc), "no Personal|Professional toggle UI");

/* Ads max 3 seconds */
assert.strictEqual(loadSwipe(memoryStorage(), memoryStorage()).AD_MAX_MS, 3000, "AD_MAX_MS is 3000");
assert.ok(/function armAdMax/.test(swipeSrc) && /data-ad-max-ms/.test(swipeSrc), "ad max arming present");

/* Tower live seller → content lane; not Instagram-y know-as-Ad badge */
assert.ok(/function towerLiveContentCards/.test(swipeSrc), "tower live content cards");
assert.ok(swipeSrc.indexOf('TYPE.KNOW) html += \'<span class="commune-card-badge commune-card-badge--ad">Ad</span>\'') === -1, "people-you-may-know is not labeled Ad");

/* Docs still state 1:1 Personal featured mix */
assert.ok(/1:1/.test(docs) && /Classroom/.test(docs) && /dating/.test(docs) && /content/.test(docs), "seedops docs keep 1:1 featured mix");

var api = loadSwipe(memoryStorage(), memoryStorage());
assert.strictEqual(api.FEATURED_ORDER.join(","), "classroom,ad,chatroom,dating,content");
assert.strictEqual(api.featuredFamily("fact"), "content");
assert.strictEqual(api.featuredFamily("know"), "content");
assert.strictEqual(api.featuredFamily("dating"), "dating");

var lanes = {
  classroom: [{ id: "cl1", title: "Insurance basics" }],
  ad: [{ id: "a1", title: "A placed ad" }],
  chatroom: [{ id: "c1", title: "Room" }],
  fact: [{ id: "f1", title: "Fact" }],
  wellness: [{ id: "w1", title: "Note" }],
  friend: [],
  event: [],
  know: [{ id: "k1", title: "Someone" }],
  content: [{ id: "live1", type: "content", title: "Seller live" }],
};
var dating = [{ id: "d1" }, { id: "d2" }, { id: "d3" }, { id: "d4" }, { id: "d5" }];
var deck = api.paceDeck(lanes, dating, 20);
assert.ok(deck.length >= 15);

var counts = { classroom: 0, ad: 0, chatroom: 0, dating: 0, content: 0 };
deck.forEach(function (card) {
  counts[api.featuredFamily(card.type)] += 1;
});
["classroom", "ad", "chatroom", "dating", "content"].forEach(function (f) {
  assert.ok(counts[f] >= 3, "family " + f + " under-represented in 1:1 mix: " + JSON.stringify(counts));
});
var vals = ["classroom", "ad", "chatroom", "dating", "content"].map(function (f) { return counts[f]; });
assert.ok(Math.max.apply(null, vals) - Math.min.apply(null, vals) <= 1, "strict 1:1 counts: " + JSON.stringify(counts));

for (var i = 1; i < deck.length; i++) {
  assert.notStrictEqual(api.featuredFamily(deck[i].type), api.featuredFamily(deck[i - 1].type), "no back-to-back featured family");
}

/* Under-13: ads / dating / classroom filtered out of Personal mix */
var under = memoryStorage();
under.setItem("cognation.member.profile.v1", JSON.stringify({ age: 12, interests: ["garage sale"] }));
under.setItem("cognation.profiles.v1", JSON.stringify({
  profiles: {
    kid: { id: "kid", kind: "personal", displayName: "Kid", friendIds: [] },
    pro: {
      id: "pro",
      kind: "professional",
      handle: "studio",
      displayName: "Studio",
      marketingAd: { title: "Ad", body: "Buy", videoUrl: "https://example.com/a.mp4" },
      goingLive: { what: "Yard sale live", when: "2099-01-01T12:00", where: "Demo City" },
    },
  },
}));
under.setItem("cognation.commune.seeDating.v1", "1");
var kidApi = loadSwipe(under, memoryStorage());
var kidDeck = kidApi.sampleDeck(18);
assert.ok(kidDeck.every(function (c) {
  return c.type !== "ad" && c.type !== "dating" && c.type !== "classroom";
}), "under-13 deck is G/PG featured only");
assert.ok(kidDeck.some(function (c) { return c.type === "fact" || c.type === "wellness" || c.type === "content"; }), "under-13 still sees content");

/* People you may know stays in Personal content mix */
var knowLocal = memoryStorage();
knowLocal.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
knowLocal.setItem("cognation.profiles.v1", JSON.stringify({
  profiles: {
    ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["friend"] },
    friend: { id: "friend", kind: "personal", displayName: "Friend", friendIds: ["ada", "sam"] },
    sam: { id: "sam", kind: "personal", displayName: "Sam", friendIds: ["friend"] },
  },
}));
var knowApi = loadSwipe(knowLocal, memoryStorage());
assert.ok(knowApi.sampleDeck(24).some(function (c) { return c.type === "know" && c.id === "know-sam"; }), "friends-you-might-know in Personal mix");

console.log("cap250-commune-featured-personal.test.js: OK");
