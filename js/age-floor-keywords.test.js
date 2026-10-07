/**
 * Shared age-floor keyword helper (js/age-floor-keywords.js) and its three users:
 * News comments, Tower newsPostAppropriate, SeedOps News log ageFloorPassed.
 * Run: node js/age-floor-keywords.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var helperSrc = src("js/age-floor-keywords.js");

var floor = require(path.join(root, "js/age-floor-keywords.js"));
assert.strictEqual(String(floor.ADULT_KEYWORD_RE), "/(^|\\W)(13|16|17|18|21)\\s?\\+(?!\\w)|\\bPG-?13\\b|\\b(nsfw|explicit)\\b/i");

["21+", "21+ only", "this is 21+.", "NSFW pic", "explicit",
 "18+ only", "13+", "17+", "16+.", "PG-13", "pg13", "rated pg13", "(21+)", "Members 18+, please",
 "21 +", "21＋", "Ages 21 ＋ only", "１８＋", "13 +", "16 +", "17 +", "18 +"].forEach(function (t) {
  assert.strictEqual(floor.isAdultKeyword(t), true, "matches: " + JSON.stringify(t));
});
["121+", "a21+b", "21 plus", "explicitly fine?", "113+", "2018+", "PG", "G-rated", "", null, "Great news for students.",
 "21  +", "113 +", "2018 +", "21 +b"].forEach(function (t) {
  assert.strictEqual(floor.isAdultKeyword(t), false, "does not match: " + JSON.stringify(t));
});
/* No g flag: repeated calls stay stable. */
assert.strictEqual(floor.isAdultKeyword("21+ only"), true);
assert.strictEqual(floor.isAdultKeyword("21+ only"), true);

/* Loaded once, before every user, as a plain (non-deferred) script. */
var html = src("index.html");
var at = html.indexOf('<script src="js/age-floor-keywords.js"></script>');
assert.ok(at !== -1, "index.html loads the helper without defer");
["js/tower.js", "js/seedops-news-log.js", "js/news-comments.js"].forEach(function (rel) {
  assert.ok(at < html.indexOf('src="' + rel + '"'), "helper loads before " + rel);
  var code = src(rel);
  assert.ok(/window\.CognationAgeFloor/.test(code), rel + " uses the shared helper");
  assert.ok(!/nsfw/i.test(code) && code.indexOf("21\\+") === -1, rel + " has no inline copy of the keyword regex");
});

/* SeedOps News log: ageFloorPassed. */
(function () {
  var w = { CognationSeedOpsLog: { write: function () {} } };
  var ctx = vm.createContext({
    window: w, console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} },
    document: { addEventListener: function () {}, dispatchEvent: function () {}, readyState: "complete" },
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; }, Date: Date, Math: Math, JSON: JSON,
  });
  vm.runInContext(helperSrc, ctx);
  vm.runInContext(src("js/seedops-news-log.js"), ctx);
  var api = w.CognationSeedOpsNewsLog;
  assert.strictEqual(api.ageFloorPassed({ title: "", body: "21+ only" }), false, "seedops ageFloorPassed rejects '21+ only'");
  assert.strictEqual(api.ageFloorPassed({ title: "Rated PG-13", body: "trailer" }), false, "seedops ageFloorPassed rejects PG-13");
  assert.strictEqual(api.ageFloorPassed({ title: "Library hours", body: "Open until 8." }), true, "seedops ageFloorPassed keeps clean posts");
})();

/* Tower: newsPostAppropriate. */
(function () {
  function memoryStorage() {
    var d = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
  }
  var listeners = {};
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
    removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var storage = memoryStorage();
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return null; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, setTimeout: setTimeout, clearTimeout: clearTimeout,
  });
  vm.runInContext(helperSrc, ctx);
  vm.runInContext(src("js/accounts.js"), ctx);
  vm.runInContext(src("js/tower.js"), ctx);
  var ok = win.CognationTowerNewsPostAppropriate;
  assert.strictEqual(typeof ok, "function", "tower exposes newsPostAppropriate");
  assert.strictEqual(ok({ title: "", body: "21+ only" }), false, "tower newsPostAppropriate rejects '21+ only'");
  assert.strictEqual(ok({ title: "18+ only", body: "" }), false, "tower rejects 18+");
  assert.strictEqual(ok({ title: "Library hours", body: "Open until 8." }), true, "tower keeps clean posts");
})();

console.log("age-floor-keywords.test.js: ok");
