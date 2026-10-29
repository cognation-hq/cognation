/**
 * SIGNAL Feed rating label comes from the same postRating() every gate reads.
 * SeedOps saw a Feed card for an unrated server post read as "G" while the
 * Tower store had it as PG-13. The Feed card carried no rating in its markup,
 * so the only "label" was a client AutoRate guess of the card's text. Now each
 * Feed card carries data-tower-rating = postRating(post) (a server post with no
 * rating reads PG-13), and the Times copy of a Tower story carries the store
 * value too. No gate reads the markup: Tower/Feed (towerPostVisibleToViewer),
 * News (newsList), the signed-out/pending hold (holdRemotePost) all read
 * postRating(). Real age-floor-keywords.js, auto-rate.js and tower.js in a vm;
 * renderFeed is the real function body from tower.js.
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
function src(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
var TOWER_KEY = "cognation.tower.posts.v3";
var TOWER_SRC = src("js/tower.js");

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}

function fakeEl(tag) {
  var attrs = {};
  return {
    tagName: String(tag || "div").toUpperCase(), attrs: attrs, children: [], innerHTML: "", className: "", style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    appendChild: function (c) { this.children.push(c); return c; },
    addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  };
}

function boot() {
  var calls = [];
  var state = { session: null, pending: false, birth: 0, mine: [] };
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {}, toggle: function () {} } },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: fakeEl,
  };
  var storage = memoryStorage();
  function record(kind) { return function () { calls.push({ kind: kind, args: Array.prototype.slice.call(arguments) }); return Promise.resolve([]); }; }
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", search: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return state.session; } },
    CognationSupabase: { configured: function () { return true; }, rpc: record("rpc"), rest: record("rest") },
    CognationSupabaseSocial: { active: function () { return !!state.session; }, getMyProfiles: function () { return state.mine; } },
    CognationCommuneSwipe: {
      viewerAgePending: function () { return state.pending; },
      getDatingBirthAge: function () { return state.birth; },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise, Date: Date, JSON: JSON, Math: Math,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: record("fetch"),
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/tower.js"].forEach(function (rel) {
    vm.runInContext(rel === "js/tower.js" ? TOWER_SRC : src(rel), ctx, { filename: rel });
  });
  var Tower = win.CognationTowerStore;

  /* The real renderFeed body from tower.js, wired to the real store, gate and
     rating; only the card's inner HTML helpers are stubbed. */
  var start = TOWER_SRC.indexOf("  function renderFeed(root) {");
  var end = TOWER_SRC.indexOf("\n  var INVITE_MONTHS", start);
  assert.ok(start > 0 && end > start, "renderFeed found in tower.js");
  var list = fakeEl("div");
  var renderFeed = new Function(
    "TowerStore", "towerPostVisibleToViewer", "postRating", "towerFeedQuery", "bindTowerAuthorLinks", "viewerUnder13",
    "towerPostAuthorHtml", "escapeHtml", "formatTime", "feedInviteHtml", "renderAttachments", "buildTowerPostReactBar",
    "bindFeedInvites", "document", "window",
    TOWER_SRC.slice(start, end) + "\nreturn renderFeed;"
  )(
    Tower, win.CognationTowerPostVisibleToViewer,
    function (p) { if (typeof win.CognationTowerPostRating !== "function") throw new Error("CognationTowerPostRating not exported"); return win.CognationTowerPostRating(p); },
    function () { return list; }, function () {}, function () { return false; },
    function () { return ""; }, function (s) { return String(s == null ? "" : s); }, function () { return ""; },
    function () { return ""; }, function () { return ""; }, function () { return fakeEl("div"); },
    function () {}, doc, win
  );

  return {
    win: win, calls: calls,
    signIn: function (userId, profileId, birth, pending) {
      state.session = { source: "supabase", supabaseUserId: userId, activeProfileId: profileId };
      state.mine = [{ id: profileId, kind: "personal", handle: profileId }];
      state.birth = birth || 0; state.pending = !!pending;
    },
    signOut: function () { state.session = null; state.mine = []; state.birth = 0; state.pending = false; Tower.clearMemberCache(); },
    cache: function (posts) { storage.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: posts })); },
    feed: function () {
      renderFeed({ querySelector: function () { return null; } });
      var out = {};
      list.children.forEach(function (a) { out[a.getAttribute("data-tower-post")] = a.getAttribute("data-tower-rating"); });
      list.children = [];
      return out;
    },
    news: function () { return Tower.newsList().filter(function (p) { return p._remote; }).map(function (p) { return p.id + ":" + p.rating; }).sort(); },
    held: function (posts) { return Tower.setRemotePosts(posts).map(function (p) { return p.id; }).sort(); },
  };
}

function seedPost(id, rating, extra) {
  var p = Object.assign({ id: id, _remote: true, authorProfileId: "p-seed-91", authorName: "Avery", handle: "avery", accountKind: "seed", isSeed: true,
    seedFleetId: "seed-0091", body: "Sunny walk by the lake today.", createdAt: "2026-10-29T14:00:00.000Z", attachments: [], likes: 0, reactions: {},
    visibility: "public", rating: rating }, extra || {});
  if (rating === undefined) delete p.rating;
  return p;
}

test("a server post with no rating renders on the Feed labelled PG-13 (not a G guess of its text)", function () {
  var w = boot();
  w.signIn("u-adult", "p-adult", 30);
  var unrated = seedPost("unrated", undefined);
  /* Fixture: the text alone would rate G, which is what a client guess shows. */
  assert.equal(w.win.CognationAutoRate.rate(unrated.body, []).rating, "G");
  w.cache([unrated, seedPost("nullrated", null)]);
  assert.deepEqual(w.feed(), { unrated: "PG-13", nullrated: "PG-13" });
  assert.deepEqual(w.news(), ["nullrated:PG-13", "unrated:PG-13"], "News carries the same value");
});

test("a G post still labels G; PG-13 and R keep their server rating", function () {
  var w = boot();
  w.signIn("u-adult", "p-adult", 30);
  w.cache([seedPost("g", "G"), seedPost("pg", "PG"), seedPost("pg13", "PG-13"), seedPost("r", "R")]);
  assert.deepEqual(w.feed(), { g: "G", pg: "PG", pg13: "PG-13", r: "R" });
});

test("signed-out and pending viewers never get the unrated post: Feed, News and the hold", function () {
  var w = boot();
  var posts = [seedPost("unrated", undefined), seedPost("g", "G")];
  w.cache(posts);
  assert.deepEqual(w.feed(), { g: "G" }, "signed out: Feed shows only the G post");
  assert.deepEqual(w.news(), ["g:G"], "signed out: News shows only the G post");
  assert.deepEqual(w.held(posts), ["g"], "signed out: the store holds only the G post");
  w.signIn("u-pending", "p-pending", 0, true);
  w.cache(posts);
  assert.deepEqual(w.feed(), { g: "G" }, "pending: Feed shows only the G post");
  assert.deepEqual(w.news(), ["g:G"], "pending: News shows only the G post");
  assert.deepEqual(w.held(posts), ["g"], "pending: the store holds only the G post");
  w.signIn("u-13", "p-13", 13, false);
  w.cache(posts);
  assert.deepEqual(w.feed(), { unrated: "PG-13", g: "G" }, "13 with a birth row: shown, labelled PG-13");
});

test("the author's own unrated post shows to them, labelled PG-13", function () {
  var w = boot();
  w.signIn("u-seed-91", "p-seed-91", 0, true);
  w.cache([seedPost("own", undefined)]);
  assert.deepEqual(w.feed(), { own: "PG-13" });
});

test("no gate reads the markup: the Feed filter and News read postRating, the Times copy only labels", function () {
  var flat = TOWER_SRC.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/getAttribute\(\s*["']data-tower-rating/.test(flat), "tower.js never reads data-tower-rating back");
  assert.ok(/TowerStore\.list\(\)\.filter\(towerPostVisibleToViewer\)/.test(flat), "Feed renders only posts passing the gate");
  var commune = src("js/commune.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(/post\.fromTower && post\.towerRating\) article\.setAttribute\("data-tower-rating"/.test(commune), "Times Tower stories carry the store rating as a label");
  assert.ok(!/getAttribute\(\s*["']data-tower-rating/.test(commune), "commune.js never reads it back");
  ["js/news-comments.js", "js/feed-rating.js", "css/styles.css"].forEach(function (rel) {
    assert.ok(src(rel).indexOf("data-tower-rating") < 0, rel + " has no data-tower-rating reader or selector");
  });
});

test("no network writes", function () {
  var w = boot();
  w.signIn("u-adult", "p-adult", 30);
  w.cache([seedPost("unrated", undefined)]);
  w.feed(); w.news(); w.signOut(); w.feed();
  var writes = w.calls.filter(function (c) {
    if (c.kind === "fetch") return true;
    var o = c.args[1] || {};
    return c.kind === "rpc" || (o.method && String(o.method).toUpperCase() !== "GET");
  });
  assert.deepEqual(writes, []);
});
