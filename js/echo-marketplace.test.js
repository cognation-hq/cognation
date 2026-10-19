/**
 * Echo 1:1 Marketplace cards from #market feed posts. Bid is opt-in at 16+.
 * Run: node js/echo-marketplace.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
  };
}

function loadSwipe(local) {
  var windowStub = {};
  var context = vm.createContext({
    window: windowStub,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {} },
    localStorage: local,
    sessionStorage: memoryStorage(),
    console: console,
    CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8"), context);
  return windowStub.CognationCommuneSwipe;
}

var pic = "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=";
var local = memoryStorage();
local.setItem("cognation.tower.posts.v3", JSON.stringify({
  version: 1,
  posts: [
    { id: "sale-1", authorName: "Sam", handle: "sam", body: "fairly new shoes $5 #market", lat: 41.88, lng: -87.63, attachments: [{ kind: "photo", dataUrl: pic }] },
    { id: "far-1", authorName: "Sam", body: "far shoes $9 #market", lat: 40.71, lng: -74.01, attachments: [{ kind: "photo", dataUrl: pic }] },
    { id: "noloc-1", authorName: "Sam", body: "mystery shoes $3 #market", attachments: [{ kind: "photo", dataUrl: pic }] },
    { id: "group-1", authorName: "Sam", body: "Study night #group", attachments: [{ kind: "photo", dataUrl: pic }] },
    { id: "plain-1", authorName: "Sam", body: "Market square this morning." },
  ],
}));
local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 16, lat: 41.88, lng: -87.63 }));
var api = loadSwipe(local);
var cards = api.marketplaceCards();
assert.strictEqual(cards.length, 1, "only a nearby #market post");
assert.strictEqual(cards[0].id, "market-sale-1");
assert.strictEqual(cards[0].type, "marketplace");
assert.strictEqual(cards[0].pictures[0], pic);
assert.strictEqual(cards[0].ask, 5);
assert.strictEqual(api.marketBidLabel(cards[0]), "Bid $5");
assert.strictEqual(api.featuredFamily("marketplace"), "content");
assert.ok(api.sampleDeck(12).some(function (c) { return c.type === "marketplace" && c.pictures[0] === pic; }));
assert.strictEqual(api.marketCanBid(), true);
assert.strictEqual(api.optInToBid(cards[0].id, cards[0].ask), true);
var saved = JSON.parse(local.getItem("cognation.commune.market.bids.v1"));
assert.strictEqual(saved.you["market-sale-1"].amount, 5);
assert.strictEqual(api.optInToBid("nope-under"), true);

var young = memoryStorage();
young.setItem("cognation.member.profile.v1", JSON.stringify({ age: 15, lat: 41.88, lng: -87.63 }));
young.setItem("cognation.tower.posts.v3", local.getItem("cognation.tower.posts.v3"));
var kid = loadSwipe(young);
assert.strictEqual(kid.marketCanBid(), false);
assert.strictEqual(kid.optInToBid(kid.marketplaceCards()[0].id), false);
assert.strictEqual(young.getItem("cognation.commune.market.bids.v1"), null);

var away = memoryStorage();
away.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, lat: 34.05, lng: -118.24 }));
away.setItem("cognation.tower.posts.v3", local.getItem("cognation.tower.posts.v3"));
assert.strictEqual(loadSwipe(away).marketplaceCards().length, 0, "too far");
var blank = memoryStorage();
blank.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30 }));
blank.setItem("cognation.tower.posts.v3", local.getItem("cognation.tower.posts.v3"));
assert.strictEqual(loadSwipe(blank).marketplaceCards().length, 0, "viewer location missing");

var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
assert.ok(src.indexOf("data-market-bid") !== -1);
assert.ok(!/Apple Pay|apple-pay|ApplePay/.test(src));
console.log("echo-marketplace.test.js ok");
