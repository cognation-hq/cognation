/**
 * Curated News edition autopull (International / Nationwide).
 * Must NOT fetch raw /api/news/* Google News RSS.
 * Run: node js/news-edition-autopull.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var FEED_KEY = "cognation.commune.feed.v1";

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

function loadCommune(localStorage) {
  var fetchCalls = [];
  var windowStub = {};
  var documentStub = {
    readyState: "complete",
    querySelector: function () {
      return null;
    },
    addEventListener: function () {},
  };
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: localStorage,
    console: console,
    fetch: function (url) {
      fetchCalls.push(String(url));
      return Promise.reject(new Error("fetch disabled in test"));
    },
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    parseInt: parseInt,
    isFinite: isFinite,
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/commune.js"), "utf8"),
    context
  );
  return {
    FeedStore: windowStub.CognationFeedStore,
    fetchCalls: fetchCalls,
  };
}

function testCuratedFlags() {
  var api = loadCommune(memoryStorage());
  assert.strictEqual(api.FeedStore.isCuratedAutopullEdition("international"), true);
  assert.strictEqual(api.FeedStore.isCuratedAutopullEdition("nationwide"), true);
  assert.strictEqual(api.FeedStore.isCuratedAutopullEdition("local"), false);
  assert.strictEqual(api.FeedStore.isCuratedAutopullEdition("statewide"), false);
}

function testInternationalAutopullReplacesStale() {
  var store = memoryStorage();
  store.setItem(
    FEED_KEY,
    JSON.stringify({
      version: 202610071,
      byEdition: {
        international: { posts: [] },
        nationwide: { posts: [{ id: "stale-us", body: "stale", seeded: true }] },
        local: { posts: [{ id: "keep-local", body: "local", seeded: true }] },
        statewide: { posts: [{ id: "keep-state", body: "state", seeded: true }] },
      },
    })
  );
  var api = loadCommune(store);
  var empty = api.FeedStore.listPosts("international");
  assert.strictEqual(empty.length, 0, "precondition: empty international");

  var pulled = api.FeedStore.pullCuratedSeedPack("international");
  assert.strictEqual(pulled.ok, true);
  assert.ok(pulled.count >= 8, "expected curated intl pack size, got " + pulled.count);

  var posts = api.FeedStore.listPosts("international");
  assert.strictEqual(posts.length, pulled.count);
  assert.ok(posts.some(function (p) {
    return p.id === "intl-2026-10-07-korea-nuri";
  }));
  assert.ok(
    posts.every(function (p) {
      return p.seeded === true;
    })
  );
  assert.ok(
    posts.filter(function (p) {
      return p.rating === "G-PG";
    }).length >= 8,
    "G-PG ratings expected on curated intl items"
  );
  assert.ok(
    posts.every(function (p) {
      return String(p.sourceDetail || "").indexOf("curated pack") !== -1;
    })
  );
  assert.strictEqual(api.fetchCalls.length, 0, "must not hit /api/news/*");

  /* Other editions untouched by intl pull */
  assert.strictEqual(api.FeedStore.listPosts("local")[0].id, "keep-local");
  assert.strictEqual(api.FeedStore.listPosts("nationwide")[0].id, "stale-us");
}

function testNationwideAutopull() {
  var store = memoryStorage();
  store.setItem(
    FEED_KEY,
    JSON.stringify({
      version: 202610071,
      byEdition: {
        nationwide: { posts: [] },
        international: { posts: [{ id: "keep-intl", body: "x", seeded: true }] },
        local: { posts: [] },
        statewide: { posts: [] },
      },
    })
  );
  var api = loadCommune(store);
  var pulled = api.FeedStore.pullCuratedSeedPack("nationwide");
  assert.strictEqual(pulled.ok, true);
  assert.ok(pulled.count >= 6, "nationwide curated pack expected");
  var posts = api.FeedStore.listPosts("nationwide");
  assert.strictEqual(posts.length, pulled.count);
  assert.ok(posts.some(function (p) {
    return String(p.id).indexOf("nat-2026-10-07-") === 0;
  }));
  assert.ok(
    posts.filter(function (p) {
      return p.rating === "G-PG";
    }).length >= 6,
    "G-PG ratings expected on curated nationwide items"
  );
  assert.strictEqual(api.FeedStore.listPosts("international")[0].id, "keep-intl");
  assert.strictEqual(api.fetchCalls.length, 0);
}

function testRejectsNonCuratedAndMissingRssWiring() {
  var api = loadCommune(memoryStorage());
  var local = api.FeedStore.pullCuratedSeedPack("local");
  assert.strictEqual(local.ok, false);
  var src = fs.readFileSync(path.join(root, "js/commune.js"), "utf8");
  assert.ok(src.indexOf("pullCuratedSeedPack") !== -1);
  assert.ok(src.indexOf("isCuratedAutopullEdition") !== -1);
  /* setEdition / boot must call curated pull; must not introduce RSS into autopull */
  var setIdx = src.indexOf("function setEdition");
  var setChunk = src.slice(setIdx, setIdx + 900);
  assert.ok(setChunk.indexOf("pullCuratedSeedPack") !== -1, "setEdition must autopull curated");
  assert.ok(setChunk.indexOf("/api/news/") === -1, "setEdition must not call raw RSS");
  var bootIdx = src.indexOf("fillDate();");
  var bootChunk = src.slice(bootIdx, bootIdx + 700);
  assert.ok(bootChunk.indexOf("pullCuratedSeedPack") !== -1, "boot must autopull curated edition");
  assert.ok(bootChunk.indexOf("/api/news/") === -1, "boot must not call raw RSS");
}

function main() {
  testCuratedFlags();
  testInternationalAutopullReplacesStale();
  testNationwideAutopull();
  testRejectsNonCuratedAndMissingRssWiring();
  console.log("news-edition-autopull.test.js: ok");
}

main();
