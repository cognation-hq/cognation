/**
 * SeedOps saw teen seed-0015's post 0568902a read G in Feed/News, while the
 * store said PG-13 later, and the run wrote nothing. Load order:
 *   1. seedops-tower-hydrate wrote an unrated copy over the rated one;
 *   2. tower.js postRating had no rating, so AutoRate guessed G;
 *   3. newsList stamped that G on the NEWS copy;
 *   4. the rated copy landed (setRemotePosts), but the Times plate key was ids
 *      only, so the Times did not redraw.
 * Now: hydrate keeps the server rating, an unrated server copy reads PG-13
 * (never a guess), newsList never stamps a guess over a server rating, and the
 * Times redraws when the rating of a post on its plate changes.
 * Real tower.js, auto-rate.js, accounts.js, seedops-schema.js and
 * seedops-tower-hydrate.js in one vm; real commune.js Times pieces.
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var commune = src("js/commune.js");
var TOWER_KEY = "cognation.tower.posts.v3";
var POST_ID = "0568902a-0000-4000-8000-000000000015";
var BODY = "Band practice after school today."; /* AutoRate rates this G */

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}

function El(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null; this.hidden = false; this.className = ""; this._html = ""; this.listeners = {}; var self = this;
  this.classList = { add: function (c) { self.className = (self.className + " " + c).trim(); }, contains: function (c) { return (" " + self.className + " ").indexOf(" " + c + " ") >= 0; }, toggle: function () {}, remove: function () {} }; }
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.insertBefore = function (c, ref) { c.parentNode = this; this.children.splice(this.children.indexOf(ref), 0, c); return c; };
El.prototype.addEventListener = function (n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); };
El.prototype.closest = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.querySelector = function () { return null; };
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); this.children = []; },
});

function fnSource(name) {
  var start = commune.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = commune.indexOf("{", start);
  for (; i < commune.length; i++) {
    if (commune[i] === "{") depth++;
    else if (commune[i] === "}" && --depth === 0) break;
  }
  return commune.slice(start, i + 1);
}

function boot() {
  var listeners = {};
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function (t) { return new El(t); },
  };
  var storage = memoryStorage();
  var server = { migrated: true, rating: "PG-13" };
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return { source: "supabase", supabaseUserId: "user-viewer", activeProfileId: "p-viewer" }; } },
    CognationSupabaseSocial: { active: function () { return true; } },
    CognationSupabase: { configured: function () { return true; }, rpc: function () { return Promise.resolve([]); }, rest: function (table, o) {
      var q = String((o && o.query) || "");
      if (table === "profiles") return Promise.resolve([{ id: "p-seed-15", user_id: "u-seed-15", handle: "teen15", display_name: "Rowan", bio: "", account_kind: "seed", seed_fleet_id: "seed-0015", kind: "personal" }]);
      if (table === "tower_posts") {
        var wants = /[,=]rating(,|&|$)/.test(q);
        if (wants && !server.migrated) return Promise.reject({ code: "42703", message: "column tower_posts.rating does not exist" });
        var row = { id: POST_ID, author_profile_id: "p-seed-15", body: BODY, created_at: "2026-10-29T14:00:00.000Z", visibility: "public", attachments: [],
          author: { id: "p-seed-15", user_id: "u-seed-15", kind: "personal", handle: "teen15", display_name: "Rowan", account_kind: "seed", seed_fleet_id: "seed-0015" } };
        if (wants) row.rating = server.rating;
        return Promise.resolve([row]);
      }
      return Promise.resolve([]);
    } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise, Date: Date, JSON: JSON, Math: Math,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js", "js/seedops-tower-hydrate.js"]
    .forEach(function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); });

  /* Real commune.js Times pieces (same extraction as times-demo-posts.test.js). */
  var lsStart = commune.indexOf('document.addEventListener("cognation:tower-updated"');
  var listenerSrc = commune.slice(lsStart, commune.indexOf("\n    });", lsStart) + "\n    });".length);
  var feedList = new El("div");
  var times = new Function("window", "document", "feedList", [
    'var editionId = "local", FeedStore = { listPosts: function () { return []; } };',
    "var feedSentinel = null, feedEmpty = null, briefLatest = null, endlessOn = false, feedObserver = null;",
    "var wirePage = 0, wireLoading = false, TIMES_SLOTS = 10, floorUnder13AtRender = null, towerPlateKeyAtRender = null;",
    "function natIntlFloor(p) { return p; } function newsViewerUnder13() { return false; } function wireAllowed() { return false; }",
    "function setEndlessUi() {} function bindEndlessObserver() {}",
    "function escapeHtml(s) { return String(s == null ? '' : s); } function formatTime() { return 'now'; }",
    fnSource("towerPlateKey"), fnSource("syncFeedEmpty"), fnSource("postsFromTower"), fnSource("timesHeadline"), fnSource("postScore"), fnSource("appendPostEl"), fnSource("renderFeed"),
    listenerSrc,
    "return { renderFeed: renderFeed };",
  ].join("\n"))(win, { createElement: function (t) { return new El(t); }, addEventListener: doc.addEventListener }, feedList);

  var Tower = win.CognationTowerStore;
  return {
    server: server,
    Tower: Tower,
    times: times,
    hydrate: function () { return win.CognationSeedOpsTowerHydrate.hydrate({ force: true, fillEmpty: false }); },
    stored: function () { var d = JSON.parse(storage.getItem(TOWER_KEY) || "{\"posts\":[]}"); return d.posts.filter(function (p) { return p.id === POST_ID; })[0] || null; },
    writeStore: function (posts) { storage.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: posts })); },
    news: function () { return Tower.newsList().filter(function (p) { return p.id === POST_ID; })[0] || null; },
    story: function () { return feedList.children.filter(function (c) { return c.getAttribute && c.getAttribute("data-tower-post-id") === POST_ID; })[0] || null; },
    autoRate: function () { return win.CognationAutoRate.rate(BODY, []).rating; },
  };
}

function socialCopy(rating) {
  /* What supabase-social mapPost writes (rating: row.rating || "PG-13"). */
  return { id: POST_ID, _remote: true, authorProfileId: "p-seed-15", authorName: "Rowan", handle: "teen15", accountKind: "seed", isSeed: true, seedFleetId: "seed-0015",
    body: BODY, createdAt: "2026-10-29T14:00:00.000Z", attachments: [], likes: 0, reactions: {}, visibility: "public", rating: rating };
}

test("tower rating sequence: hydrate, guess, News stamp and Times redraw", async function () {
  var w = boot();
  assert.equal(w.autoRate(), "G", "fixture: the client guess for this body is G");

  /* supabase-social's rated copy lands first; the Times prints it. */
  w.Tower.setRemotePosts([socialCopy("PG-13")]);
  w.times.renderFeed();
  assert.equal(w.news().rating, "PG-13");
  assert.ok(w.story(), "the post is on the Times plate");

  /* Hydrate lands the same post next: the rated copy is not overwritten. */
  await w.hydrate();
  assert.equal(w.stored().rating, "PG-13", "hydrate keeps the server rating in the store");
  assert.equal(w.news().rating, "PG-13", "newsList does not stamp the G guess");

  /* An unrated server copy (written before this fix, or before the migration): never the guess. */
  var unrated = socialCopy("PG-13"); delete unrated.rating;
  w.writeStore([unrated]);
  assert.equal(w.news().rating, "PG-13", "an unrated server copy reads the server default, not G");

  /* The rated copy lands with a different server rating: the Times must redraw. */
  w.Tower.setRemotePosts([socialCopy("PG-13")]);
  w.times.renderFeed();
  var printed = w.story();
  w.Tower.setRemotePosts([socialCopy("R")]);
  assert.equal(w.news().rating, "R", "News re-reads the rating from the store");
  assert.notEqual(w.story(), printed, "the Times redraws when a post's rating changes (same ids)");

  /* A later hydrate before the migration (no rating column) cannot undo it. */
  w.server.migrated = false;
  await w.hydrate();
  assert.equal(w.stored().rating, "R");
  assert.equal(w.news().rating, "R");
});

test("tower rating sequence: hydrate first, rated copy second", async function () {
  var w = boot();
  w.server.rating = "PG-13";
  await w.hydrate();
  assert.equal(w.stored().rating, "PG-13", "hydrate copy carries the server rating");
  assert.equal(w.news().rating, "PG-13", "News never reads the G guess");
  w.times.renderFeed();
  var printed = w.story();
  assert.ok(printed);
  /* Same rating arrives again from supabase-social: nothing to redraw. */
  w.Tower.setRemotePosts([socialCopy("PG-13")]);
  assert.equal(w.story(), printed, "unchanged rating and ids: no needless redraw");
});
