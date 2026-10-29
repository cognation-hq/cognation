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

/* Signed in (#309: a signed-out or demo viewer's gates see age 0): a live
   session, and the age comes from user_birth (setDatingBirthAge), not the
   local profile. */
var VIEWER_ID = ["u", "viewer"].join("-");
function loadSwipe(local, age) {
  var windowStub = { CognationSupabase: { getSession: function () { return { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } }; } } };
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
    Promise: Promise,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8"), context);
  if (age != null) windowStub.CognationCommuneSwipe.setDatingBirthAge(age);
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
var api = loadSwipe(local, 16);
var cards = api.marketplaceCards();
assert.strictEqual(cards.length, 1, "only a nearby #market post");
assert.strictEqual(cards[0].id, "market-sale-1");
assert.strictEqual(cards[0].type, "marketplace");
assert.strictEqual(cards[0].pictures[0], pic);
assert.strictEqual(cards[0].ask, 5);
assert.strictEqual(api.marketBidLabel(cards[0]), "Bid $5");
assert.strictEqual(api.raiseBid(cards[0].id, 8, cards[0].ask), true);
assert.strictEqual(api.liveHigh(cards[0].id).amount, 8);
assert.strictEqual(api.marketBidLabel(cards[0]), "Bid $5");
assert.strictEqual(api.marketplaceCards().length, 1, "unpaid high bid stays");
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
var kid = loadSwipe(young, 15);
assert.strictEqual(kid.marketCanBid(), false);
assert.strictEqual(kid.optInToBid(kid.marketplaceCards()[0].id), false);
assert.strictEqual(young.getItem("cognation.commune.market.bids.v1"), null);
assert.strictEqual(kid.raiseBid(kid.marketplaceCards()[0].id, 8, 5), false);

var away = memoryStorage();
away.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, lat: 34.05, lng: -118.24 }));
away.setItem("cognation.tower.posts.v3", local.getItem("cognation.tower.posts.v3"));
assert.strictEqual(loadSwipe(away, 30).marketplaceCards().length, 0, "too far");
var blank = memoryStorage();
blank.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30 }));
blank.setItem("cognation.tower.posts.v3", local.getItem("cognation.tower.posts.v3"));
assert.strictEqual(loadSwipe(blank, 30).marketplaceCards().length, 0, "viewer location missing");

var high = JSON.parse(local.getItem("cognation.commune.market.high.v1"));
high["market-sale-1"].at = Date.now() - 86400001;
local.setItem("cognation.commune.market.high.v1", JSON.stringify(high));
assert.strictEqual(api.liveHigh("market-sale-1"), null);
assert.ok(api.marketplaceCards().length === 1 && api.raiseBid("market-sale-1", 8, 5) && api.settleMarketPayment("market-sale-1", { paid: false }) === false);
assert.strictEqual(api.marketplaceCards().length, 1);

var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
assert.ok(src.indexOf("data-market-bid") !== -1);
assert.ok(/Apple Pay isn't set up/.test(src));
api.payHighBid(cards[0]).then(function (res) {
  assert.strictEqual(res.paid, false);
  assert.ok(/isn't set up/.test(res.message));
  assert.strictEqual(api.marketplaceCards().length, 1);
  assert.strictEqual(api.settleMarketPayment("market-sale-1", { paid: true }), true);
  assert.strictEqual(api.marketplaceCards().length, 0, "card leaves only after payment");
  console.log("echo-marketplace.test.js ok");
}).catch(function (err) { console.error(err); process.exit(1); });
