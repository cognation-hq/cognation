/**
 * ECHO Marketplace reads Tower posts through CognationTowerStore.list(), so it gets
 * the #199 filter: local SeedOps template posts (seedopsTower set, not _remote) never
 * show to signed-in users. Signed out, Marketplace shows the same posts as before.
 * Real tower.js + commune-swipe.js (and their helpers) in one vm window.
 * Viewer and sellers share a location so the 20-mile Marketplace rule (#183)
 * does not hide every card; section 4 checks that rule still applies.
 * Run: node js/echo-market-list-filter.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var TOWER_KEY = "cognation.tower.posts.v3";
var HERE = { lat: 41.8781, lng: -87.6298 };

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function boot(store, signedIn, viewerPoint) {
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var storage = memoryStorage();
  storage.setItem(TOWER_KEY, JSON.stringify(store));
  storage.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30 }));
  if (viewerPoint !== null) storage.setItem("cognation.member.location.v1", JSON.stringify(viewerPoint || HERE));
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return win.__session || null; } },
  };
  win.window = win;
  if (signedIn) {
    win.__session = { source: "supabase", supabaseUserId: "user-real-1", activeProfileId: "srv-real-1", username: "dana" };
    win.CognationSupabaseSocial = { active: function () { return true; } };
  }
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js", "js/commune-swipe.js"]
    .forEach(function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); });
  return win;
}
function ids(cards) { return Array.prototype.map.call(cards, function (c) { return String(c.id); }).sort(); }

var template = { id: "seedops-tower-seed-0001-1", seedopsTower: true, isSeed: true, accountKind: "seed", authorName: "Jess",
  body: "Old bike, good tyres #market", createdAt: "2026-10-20T18:00:00.000Z", rating: "G", lat: HERE.lat, lng: HERE.lng };
var serverSale = { id: "srv-sale-1", _remote: true, authorName: "Dana", handle: "dana", authorProfileId: "srv-real-1",
  body: "Blue mug for sale #market", createdAt: "2026-10-20T19:00:00.000Z", rating: "G", lat: HERE.lat, lng: HERE.lng };
var serverSeedSale = { id: "srv-seed-sale-1", _remote: true, seedopsTower: true, isSeed: true, authorName: "Sasha",
  body: "Lamp, works #market", createdAt: "2026-10-20T17:00:00.000Z", rating: "G", lat: HERE.lat, lng: HERE.lng, visibility: "public" }; /* signed out: public seed post (PM #209 ruling) */
var plain = { id: "srv-plain-1", _remote: true, authorName: "Dana", body: "Market square this morning.", createdAt: "2026-10-20T16:00:00.000Z", rating: "G", lat: HERE.lat, lng: HERE.lng };

/* 1. Signed in, a remote store still holding a local template copy: Marketplace drops it. */
var inWin = boot({ version: 2, remote: true, posts: [template, serverSale, serverSeedSale, plain] }, true);
var inCards = inWin.CognationCommuneSwipe.marketplaceCards();
assert.deepStrictEqual(ids(inCards), ["market-srv-sale-1", "market-srv-seed-sale-1"],
  "signed in: no local SeedOps template post in Marketplace (got " + ids(inCards).join(", ") + ")");
var listIds = inWin.CognationTowerStore.list().map(function (p) { return p.id; });
inCards.forEach(function (c) { assert.ok(listIds.indexOf(c.id.replace(/^market-/, "")) !== -1, "every card comes from TowerStore.list()"); });

/* 1b. Signed in before the signed-in feed arrives (store not remote yet): TOWER list() is empty, so is Marketplace. */
var earlyWin = boot({ version: 2, posts: [template, serverSale] }, true);
assert.strictEqual(earlyWin.CognationCommuneSwipe.marketplaceCards().length, 0, "signed in, local-only store: nothing from it in Marketplace");

/* 2. Signed out: template and seed server sales still show. A real member's server
   sale left in the store from an earlier signed-in session does not (sign-out
   leak fix: the signed-out Feed is SeedOps content only). */
var outWin = boot({ version: 2, posts: [template, serverSale, serverSeedSale, plain] }, false);
assert.deepStrictEqual(ids(outWin.CognationCommuneSwipe.marketplaceCards()), ["market-seedops-tower-seed-0001-1", "market-srv-seed-sale-1"],
  "signed out: SeedOps sales only, no cached member sale");

/* 4. The 20-mile rule (#183) still applies on top of the list() filter:
   no viewer location, or a viewer far away, gets no cards. */
var store4 = { version: 2, remote: true, posts: [template, serverSale, serverSeedSale, plain] };
assert.strictEqual(boot(store4, true, null).CognationCommuneSwipe.marketplaceCards().length, 0, "signed in, no viewer location: no Marketplace cards");
assert.strictEqual(boot(store4, true, { lat: 34.0522, lng: -118.2437 }).CognationCommuneSwipe.marketplaceCards().length, 0, "signed in, viewer over 20 miles away: no Marketplace cards");

/* 3. Source: Marketplace goes through list(); the raw key is read only as a no-tower-module fallback. */
var swipe = src("js/commune-swipe.js");
var fn = swipe.slice(swipe.indexOf("function marketSourcePosts"), swipe.indexOf("function marketOptedIn"));
assert.ok(/store\.list\(\)/.test(fn), "marketplace reads TowerStore.list()");
assert.ok(fn.indexOf("store.list()") < fn.indexOf('"cognation.tower.posts.v3"'), "raw read only as the fallback");
assert.strictEqual(swipe.split('"cognation.tower.posts.v3"').length - 1, 1, "no other raw Tower store reads in commune-swipe.js");
console.log("echo-market-list-filter.test.js ok");
