/**
 * ECHO Marketplace age visibility: marketSourcePosts() goes through
 * CognationTowerPostVisibleToViewer (as echo-group.js posts() does) plus the
 * post's own 18+ / 21+ line. Under-13 and unknown-age viewers never get 18+/21+
 * #market posts; an 18-20 viewer never gets a 21+ one; adults still do.
 * Real tower.js + commune-swipe.js (age-floor-keywords, auto-rate, accounts,
 * seedops-schema) in one vm window. Viewer age comes only from user_birth
 * (setDatingBirthAge) when signed in; signed out is age 0 whatever the local
 * profile says (#318). Viewer and sellers share a location so the 20-mile
 * Marketplace rule (#183) does not hide every card.
 * Run: node js/echo-market-age-visibility.test.js
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
function boot(store, signedIn, age) {
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var storage = memoryStorage();
  storage.setItem(TOWER_KEY, JSON.stringify(store));
  storage.setItem("cognation.member.location.v1", JSON.stringify(HERE));
  /* Signed out: a local profile age must not count (#318). */
  if (!signedIn && age != null) storage.setItem("cognation.member.profile.v1", JSON.stringify({ age: age }));
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
  /* Signed in: the user_birth read answers (null = no row, fail closed). */
  if (signedIn) win.CognationCommuneSwipe.setDatingBirthAge(age);
  return win;
}
function ids(cards) { return Array.prototype.map.call(cards, function (c) { return String(c.id).replace(/^market-/, ""); }).sort().join(","); }

var posts = [
  { id: "g", authorName: "Sam", handle: "sam", body: "Blue mug for sale #market", createdAt: "2026-10-20T19:00:00.000Z", rating: "G", lat: HERE.lat, lng: HERE.lng },
  { id: "r18", authorName: "Dana", handle: "dana", body: "Wine glasses, set of six, 18+ only #market", createdAt: "2026-10-20T18:00:00.000Z", rating: "R", lat: HERE.lat, lng: HERE.lng },
  { id: "a21", authorName: "Lee", handle: "lee", body: "Homebrew beer kit, 21+ #market", createdAt: "2026-10-20T17:00:00.000Z", rating: "PG-13", lat: HERE.lat, lng: HERE.lng },
  { id: "srv-ma", _remote: true, isSeed: true, accountKind: "seed", seedFleetId: "seed-0042", authorName: "Rae", handle: "rae", authorProfileId: "srv-rae", body: "Vintage decanter set #market", createdAt: "2026-10-20T16:00:00.000Z", rating: "MA", lat: HERE.lat, lng: HERE.lng, visibility: "public" }, /* public seed post (PM #209 ruling) */
  { id: "seedops-tower-seed-0001-1", seedopsTower: true, isSeed: true, accountKind: "seed", authorName: "Jess", body: "Old bike, good tyres #market", createdAt: "2026-10-20T15:00:00.000Z", rating: "G", lat: HERE.lat, lng: HERE.lng },
];
function cardsFor(age) { return boot({ version: 2, posts: posts }, false, age).CognationCommuneSwipe.marketplaceCards(); }
function signedInCardsFor(age) { return boot({ version: 2, remote: true, posts: posts }, true, age).CognationCommuneSwipe.marketplaceCards(); }

/* Signed out: age 0 whatever the local profile says (#318), so G/PG only. */
[11, null, 15, 19, 25].forEach(function (age) {
  assert.strictEqual(ids(cardsFor(age)), "g,seedops-tower-seed-0001-1", "signed out (local age " + age + "): no 18+/21+ #market posts");
});
/* Signed in: age from user_birth only. Local SeedOps templates stay off (#199);
   MA has no client opt-in, so srv-ma never shows client-side (#311). */
assert.strictEqual(ids(signedInCardsFor(11)), "g", "under-13 viewer: no 18+/21+ #market posts");
assert.strictEqual(ids(signedInCardsFor(null)), "g", "unknown-age viewer: no 18+/21+ #market posts");
assert.strictEqual(ids(signedInCardsFor(15)), "g", "15-year-old: no 18+/21+ #market posts");
assert.strictEqual(ids(signedInCardsFor(19)), "g,r18", "18-20 viewer: 18+ yes, 21+ no");
assert.strictEqual(ids(signedInCardsFor(25)), "a21,g,r18", "adult viewer still sees 18+ and 21+ posts");

/* Seed / demo behaviour unchanged: the seed sale card is the same shape, no badge field added
   (ask = the post's dollar amount, #183). */
var seedCard = Array.prototype.filter.call(cardsFor(null), function (c) { return c.id === "market-seedops-tower-seed-0001-1"; })[0];
assert.ok(seedCard, "seed sale still listed");
assert.strictEqual(Object.keys(seedCard).sort().join(","), "ask,body,fromName,handle,id,pictures,profileId,title,type", "card fields unchanged");

/* Source: through list() and the Tower visibility helper, as echo-group.js does. */
var swipe = src("js/commune-swipe.js");
var fn = swipe.slice(swipe.indexOf("function marketPostMinAge"), swipe.indexOf("function marketplaceCards"));
assert.ok(/store\.list\(\)/.test(fn) && /window\.CognationTowerPostVisibleToViewer/.test(fn), "list() + CognationTowerPostVisibleToViewer");
assert.ok(/marketVisibleToViewer\(post\)/.test(fn.slice(fn.indexOf("function marketSourcePosts"))), "marketSourcePosts filters every post");
console.log("echo-market-age-visibility.test.js ok");
