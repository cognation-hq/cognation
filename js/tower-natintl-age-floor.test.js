/**
 * Tower + News Nationwide/International age floor.
 * Under-13 or unknown-age viewers (unknown = under-13, same rule as #68):
 *   - Tower: posts that trip the shared floor are hidden entirely (no placeholder).
 *   - Nationwide/International: only items that pass the Local/Statewide floor
 *     AND are rated G/PG show; PG-13, R and unrated items are hidden.
 * Adults see no change. Missing helpers fail closed.
 * Run: node js/tower-natintl-age-floor.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function mem(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }

/* viewer: { age: number } | "unknown"; opts.helper: "full" | "none" | "no-keyword" */
function load(viewer, opts) {
  opts = opts || {};
  var seed = {};
  if (viewer !== "unknown") seed["cognation.member.profile.v1"] = JSON.stringify({ age: viewer.age });
  var ls = mem(seed);
  var doc = {
    readyState: "complete",
    addEventListener: function () {},
    dispatchEvent: function () { return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () { return { setAttribute: function () {}, appendChild: function () {}, style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} } }; },
    body: { classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } },
  };
  var win = { document: doc, localStorage: ls, location: { hash: "", search: "" }, CustomEvent: CustomEvent, addEventListener: function () {} };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, location: win.location, CustomEvent: CustomEvent,
    console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
    fetch: function () { return Promise.reject(new Error("offline")); },
  });
  var helper = opts.helper || "full";
  if (helper !== "none") vm.runInContext(read("js/age-floor-keywords.js"), ctx);
  if (helper === "no-keyword") delete win.CognationAgeFloor.isAdultKeyword;
  vm.runInContext(read("js/tower.js"), ctx, { filename: "js/tower.js" });
  vm.runInContext(read("js/commune.js"), ctx, { filename: "js/commune.js" });
  return {
    towerVisible: function (posts) { return posts.filter(win.CognationTowerPostVisibleToViewer).map(function (p) { return p.id; }); },
    natIntl: function (posts, edition) { return win.CognationNewsNatIntlFloor(posts, edition).map(function (p) { return p.id; }); },
  };
}

var TOWER = [
  { id: "clean", authorName: "Sam", body: "Science fair photos from the library." },
  { id: "kw-21", authorName: "Lee", body: "Tonight's show is 21+ only." },
  { id: "kw-pg13", authorName: "Kai", title: "Movie night", body: "Rated PG-13 double feature." },
  { id: "kw-nsfw", authorName: "Rio", body: "nsfw meme dump" },
  { id: "min18", authorName: "Bo", body: "Wine tasting recap", minAge: 18 },
  { id: "clean-2", authorName: "Ana", body: "Garden club meets Saturday." },
];
var ALL_TOWER = TOWER.map(function (p) { return p.id; }).join();
var CLEAN_TOWER = "clean,clean-2";

var NEWS = [
  { id: "g", body: "Rover update", rating: "G", seeded: true },
  { id: "pg", body: "Robotics league", rating: "PG", seeded: true },
  { id: "gpg", body: "Space desk", rating: "G-PG", seeded: true },
  { id: "gpg-dash", body: "STEM desk", rating: "G\u2013PG", seeded: true },
  { id: "pg13", body: "Thriller premiere", rating: "PG-13", seeded: true },
  { id: "r", body: "Crime wire", rating: "R", seeded: true },
  { id: "unrated-hot", body: "LATE SCORES \u2014 Primetime finishes.", seeded: true },
  { id: "unrated-wire", body: "Wire desk: markets open mixed.", seeded: true, wire: true },
  { id: "gpg-kw", body: "Festival guide: 18+ after dark", rating: "G-PG", seeded: true },
  { id: "own", body: "My note on the space desk", seeded: false },
];
var ALL_NEWS = NEWS.map(function (p) { return p.id; }).join();
var U13_NEWS = "g,pg,gpg,gpg-dash,own";

/* ---- Tower ---- */
[{ age: 11 }, "unknown", { age: 0 }].forEach(function (viewer) {
  var t = load(viewer);
  assert.strictEqual(t.towerVisible(TOWER).join(), CLEAN_TOWER,
    "Tower hides tripping posts for " + JSON.stringify(viewer));
});
[{ age: 13 }, { age: 16 }, { age: 30 }].forEach(function (viewer) {
  assert.strictEqual(load(viewer).towerVisible(TOWER).join(), ALL_TOWER, "Tower unchanged for " + JSON.stringify(viewer));
});
/* Hidden entirely: the render path filters the list itself, no placeholder text. */
var towerSrc = read("js/tower.js");
assert.ok(/var posts = TowerStore\.list\(\)\.filter\(towerPostVisibleToViewer\);/.test(towerSrc), "Tower feed render filters posts");
assert.ok(towerSrc.indexOf("Hidden for your age group") === -1, "Tower has no placeholder line");

/* ---- Nationwide / International ---- */
["nationwide", "international"].forEach(function (edition) {
  [{ age: 11 }, "unknown"].forEach(function (viewer) {
    assert.strictEqual(load(viewer).natIntl(NEWS, edition).join(), U13_NEWS,
      edition + ": only G/PG (and own posts) for " + JSON.stringify(viewer));
  });
  [{ age: 13 }, { age: 30 }].forEach(function (viewer) {
    assert.strictEqual(load(viewer).natIntl(NEWS, edition).join(), ALL_NEWS, edition + ": unchanged for " + JSON.stringify(viewer));
  });
});
/* Local / Statewide keep their existing path (Tower newsList), not this filter. */
assert.strictEqual(load({ age: 11 }).natIntl(NEWS, "local").join(), ALL_NEWS);
assert.strictEqual(load({ age: 11 }).natIntl(NEWS, "statewide").join(), ALL_NEWS);
var communeSrc = read("js/commune.js");
assert.ok(/: natIntlFloor\(FeedStore\.listPosts\(editionId\)\)/.test(communeSrc), "Nat/Intl render path uses the floor");
assert.ok(/natIntlFloor\(\[makeWirePost\(/.test(communeSrc), "endless wire filler uses the floor");

/* Current repo seed packs: every curated item is rated G-PG and passes. */
var natSeeds = JSON.parse(read("js/nationwide-seeds.json"));
var intlSeeds = JSON.parse(read("js/intl-seeds.json"));
var kid = load({ age: 11 });
assert.strictEqual(kid.natIntl(natSeeds.map(function (p) { p.seeded = true; return p; }), "nationwide").length, natSeeds.length);
assert.strictEqual(kid.natIntl(intlSeeds.map(function (p) { p.seeded = true; return p; }), "international").length, intlSeeds.length);

/* ---- Fail closed ---- */
var noKw = load({ age: 11 }, { helper: "no-keyword" });
assert.strictEqual(noKw.towerVisible(TOWER).join(), "", "keyword helper missing: under-13 sees no Tower posts");
assert.strictEqual(noKw.natIntl(NEWS, "nationwide").join(), "", "keyword helper missing: under-13 sees no Nat/Intl items");
var noKwAdult = load({ age: 30 }, { helper: "no-keyword" });
assert.strictEqual(noKwAdult.towerVisible(TOWER).join(), ALL_TOWER, "keyword helper missing: adults unchanged");
assert.strictEqual(noKwAdult.natIntl(NEWS, "international").join(), ALL_NEWS);
var none = load({ age: 30 }, { helper: "none" });
assert.strictEqual(none.towerVisible(TOWER).join(), "", "whole helper missing: viewer treated as under-13, all trip");
assert.strictEqual(none.natIntl(NEWS, "nationwide").join(), "");

/* ---- Shared helpers ---- */
var floor = require("./age-floor-keywords.js");
["G", "PG", "G-PG", "G\u2013PG", "g/pg", "GPG", " pg "].forEach(function (r) { assert.strictEqual(floor.ratingIsGPG(r), true, r); });
["PG-13", "R", "NC-17", "", null, undefined, "unrated"].forEach(function (r) { assert.strictEqual(floor.ratingIsGPG(r), false, String(r)); });
assert.ok(read("js/news-comments.js").indexOf("floor.ratingIsGPG") !== -1, "News comments reuse the shared G/PG check");
assert.ok(read("js/news-comments.js").indexOf("floor.viewerAge") !== -1, "News comments reuse the shared viewer age");

console.log("tower-natintl-age-floor.test.js: ok");
