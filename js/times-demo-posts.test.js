/**
 * Cognation Times: the 5 retired local demo Feed posts (Alex Rivera, Sam Okonkwo,
 * Jordan Lee, Mira Chen, Chris Patel) never print, and the Times redraws when the
 * signed-in posts arrive, keeping each story's closed Comments line.
 * Real js/tower.js (+ accounts.js) in a vm; real commune.js renderFeed /
 * postsFromTower / appendPostEl / tower-updated listener; real news-comments.js.
 * Run: node js/times-demo-posts.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var commune = src("js/commune.js");
var towerSrc = src("js/tower.js");

var DEMO_NAMES = ["Alex Rivera", "Sam Okonkwo", "Jordan Lee", "Mira Chen", "Chris Patel"];
var DEMO_IDS = ["alex-rivera", "sam-okonkwo", "jordan-lee", "mira-chen", "chris-patel"];
var DEMO_BODIES = ["East wing library late night", "Market square this morning", "Saturday block party invite",
  "Short clip from the river walk mural", "Creative study: cyan ink wash"];

/* Source: the demo list is gone, not just hidden. */
DEMO_BODIES.forEach(function (b) { assert.ok(towerSrc.indexOf(b) === -1, "tower.js no longer carries: " + b); });
assert.ok(!/JSON\.stringify\(SEED\)/.test(towerSrc), "no code path writes the demo list into storage");

/* ---- real tower.js in a vm ---- */
function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
var listeners = {};
var vmDoc = {
  readyState: "complete",
  body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
  addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
  removeEventListener: function () {},
  dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
  createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
};
var storage = memoryStorage();
var win = {
  document: vmDoc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
  addEventListener: function () {}, removeEventListener: function () {},
  CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
  CognationAuth: { getSession: function () { return null; } },
};
win.window = win;
var ctx = vm.createContext({
  window: win, document: vmDoc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
  console: console, CustomEvent: win.CustomEvent, URL: URL, setTimeout: setTimeout, clearTimeout: clearTimeout,
});
vm.runInContext(src("js/age-floor-keywords.js"), ctx);
vm.runInContext(src("js/accounts.js"), ctx);
vm.runInContext(towerSrc, ctx);
var Tower = win.CognationTowerStore;
var TOWER_KEY = "cognation.tower.posts.v3";

function isDemo(p) {
  return DEMO_IDS.indexOf(String(p.authorProfileId || "")) >= 0 || DEMO_NAMES.indexOf(String(p.authorName || "")) >= 0;
}

/* 1. Fresh browser, signed out: no demo Feed posts anywhere in the store. */
assert.strictEqual(Tower.list().length, 0, "fresh store: Feed list is empty (no demo posts)");
assert.strictEqual(storage.getItem(TOWER_KEY), null, "nothing written to storage on read");
assert.ok(!Tower.newsList().some(isDemo), "fresh store: Times list has no demo personal posts");

/* 2. A browser that saved the demo list on an earlier visit: the 5 go, own posts stay. */
var legacy = DEMO_IDS.map(function (pid, i) {
  return { id: "tower-" + (i + 1), authorName: DEMO_NAMES[i], authorProfileId: pid, body: DEMO_BODIES[i], createdAt: "2026-09-15T1" + i + ":00:00.000Z", likes: 50 };
});
legacy.push({ id: "t-own-1", authorName: "You", authorProfileId: "me", body: "My own note.", createdAt: "2026-10-20T12:00:00.000Z", rating: "G", likes: 0 });
legacy.push({ id: "tower-2", authorName: "Someone else", authorProfileId: "someone", body: "Same id, other author.", createdAt: "2026-10-19T12:00:00.000Z", rating: "G", likes: 0 });
storage.setItem(TOWER_KEY, JSON.stringify({ version: 1, posts: legacy }));
var kept = Tower.list().map(function (p) { return p.id + ":" + p.authorProfileId; }).sort().join(",").split(",");
assert.deepStrictEqual(kept, ["t-own-1:me", "tower-2:someone"], "saved demo posts dropped; own posts (and same-id posts by others) kept");
assert.ok(!JSON.parse(storage.getItem(TOWER_KEY)).posts.some(isDemo), "the cleaned list is saved back");
assert.ok(!Tower.newsList().some(isDemo), "legacy store: Times list has no demo personal posts");

/* ---- real commune.js Times pieces + real news-comments.js ---- */
function El(tag) {
  this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null;
  this.hidden = false; this.id = ""; this.className = ""; this.textContent = ""; this._html = ""; this.listeners = {};
  var self = this;
  this.classList = {
    add: function (c) { if ((" " + self.className + " ").indexOf(" " + c + " ") < 0) self.className = (self.className + " " + c).trim(); },
    contains: function (c) { return (" " + self.className + " ").indexOf(" " + c + " ") >= 0; },
    toggle: function () {}, remove: function () {},
  };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { if (c.parentNode && c.parentNode !== this) { var s = c.parentNode.children; s.splice(s.indexOf(c), 1); } else if (c.parentNode === this) { this.children.splice(this.children.indexOf(c), 1); } c.parentNode = this; this.children.push(c); return c; };
El.prototype.insertBefore = function (c, ref) { c.parentNode = this; this.children.splice(this.children.indexOf(ref), 0, c); return c; };
El.prototype.addEventListener = function (n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); };
El.prototype.click = function () { (this.listeners.click || []).forEach(function (f) { f({ preventDefault: function () {} }); }); };
El.prototype.closest = function (sel) { var e = this; while (e) { if (sel === "#panel-signal" && e.id === "panel-signal") return e; e = e.parentNode; } return null; };
El.prototype.querySelectorAll = function (sel) {
  var out = [];
  if (sel === ".news-comment-item") { var m = this._html.match(/class="news-comment-item"/g); return new Array(m ? m.length : 0); }
  if (sel.charAt(0) !== "[") return out;
  (function walk(e) { e.children.forEach(function (c) { if (c.hasAttribute(sel.slice(1, -1))) out.push(c); walk(c); }); })(this);
  return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; },
});

var nodeStore = {};
global.window = global;
global.localStorage = { getItem: function (k) { return nodeStore[k] || null; }, setItem: function (k, v) { nodeStore[k] = String(v); }, removeItem: function (k) { delete nodeStore[k]; } };
global.document = { createElement: function (t) { return new El(t); }, querySelectorAll: function () { return []; }, addEventListener: function () {} };
window.CognationAgeFloor = { viewerAge: function () { return 30; } };
require("./news-comments.js");
win.CognationNewsComments = global.CognationNewsComments;

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
var lsStart = commune.indexOf('document.addEventListener("cognation:tower-updated"');
assert.ok(lsStart > 0, "commune.js listens for cognation:tower-updated");
var listenerSrc = commune.slice(lsStart, commune.indexOf("\n    });", lsStart) + "\n    });".length);
assert.ok(/towerPlateKeyAtRender = towerPlateKey\(towerPlate\);/.test(fnSource("renderFeed")), "renderFeed remembers the plate it printed");

var panel = new El("section"); panel.id = "panel-signal";
var feedList = panel.appendChild(new El("div"));
var pageDoc = { createElement: function (t) { return new El(t); }, addEventListener: vmDoc.addEventListener };
var times = new Function("window", "document", "feedList", [
  'var editionId = "local", FeedStore = { listPosts: function () { return []; } };',
  "var feedSentinel = null, feedEmpty = null, briefLatest = null, endlessOn = false, feedObserver = null;",
  "var wirePage = 0, wireLoading = false, TIMES_SLOTS = 10, floorUnder13AtRender = null, towerPlateKeyAtRender = null;",
  "function natIntlFloor(p) { return p; } function newsViewerUnder13() { return false; } function wireAllowed() { return false; }",
  "function setEndlessUi() {} function bindEndlessObserver() {}",
  "function escapeHtml(s) { return String(s == null ? '' : s); } function formatTime() { return 'now'; }",
  fnSource("towerPlateKey"), fnSource("postsFromTower"), fnSource("appendPostEl"), fnSource("renderFeed"),
  listenerSrc,
  "return { renderFeed: renderFeed };",
].join("\n"))(win, pageDoc, feedList);

function stories() { return feedList.children.filter(function (c) { return c.hasAttribute && c.hasAttribute("data-news-post"); }); }
function author(a) { var m = /class="commune-feed-author">(?:<a[^>]*>)?([^<]*)/.exec(a._html); return m ? m[1] : ""; }
function checkLines(label) {
  stories().forEach(function (a, i) {
    var t = a.querySelector("[data-times-comments-toggle]");
    var host = a.querySelector("[data-news-comments]");
    assert.ok(t && host && !t.hidden, label + ": story " + i + " has its Comments line");
    assert.strictEqual(t.getAttribute("aria-expanded"), "false", label + ": story " + i + " starts closed");
    assert.ok(!a.hasAttribute("data-times-comments-open"), label + ": story " + i + " thread closed");
  });
  if (!stories().length) return;
  var t0 = stories()[0].querySelector("[data-times-comments-toggle]");
  t0.click();
  assert.strictEqual(t0.getAttribute("aria-expanded"), "true", label + ": opens");
  assert.strictEqual(t0.textContent, "Hide comments", label + ": open label");
  t0.click();
  assert.strictEqual(t0.getAttribute("aria-expanded"), "false", label + ": closes");
}
function noDemo(label) {
  stories().forEach(function (a) {
    assert.ok(DEMO_NAMES.indexOf(author(a)) === -1, label + ": no demo personal author (" + author(a) + ")");
    DEMO_BODIES.forEach(function (b) { assert.ok(a._html.indexOf(b) === -1, label + ": no demo body"); });
    assert.ok(!/from-tower-personal-tower-[1-5]"/.test(a.getAttribute("data-post-id") + '"'), label + ": no demo post id");
  });
}

/* 3. Signed in, before the account's posts arrive: first paint prints only what is real. */
storage.removeItem(TOWER_KEY);
win.CognationSupabaseSocial = { active: function () { return true; } };
times.renderFeed();
var firstPaint = stories().length;
assert.strictEqual(firstPaint, Math.min(10, Tower.newsList().length), "first paint prints the real list, no fill");
assert.ok(firstPaint < 10, "fewer than 10 real stories before sign-in posts arrive (" + firstPaint + ")");
noDemo("signed-in first paint");
checkLines("signed-in first paint");

/* 4. Unrelated tower-updated (a local post, no signed-in data) does not redraw. */
storage.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: remotePosts(3) }));
vmDoc.dispatchEvent(new win.CustomEvent("cognation:tower-updated", { detail: { post: { id: "x" } } }));
assert.strictEqual(stories().length, firstPaint, "non-remote tower-updated: no redraw");
storage.removeItem(TOWER_KEY);

/* 5. Signed-in posts arrive (TowerStore.setRemotePosts fires tower-updated {remote:true}). */
function remotePosts(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push({ id: "post-r" + i, authorName: "Member " + i, authorProfileId: "prof-" + i, body: "Real post " + i, createdAt: "2026-10-20T1" + (i % 10) + ":00:00.000Z", likes: 200 - i, rating: "G", _remote: true });
  return out;
}
Tower.setRemotePosts(remotePosts(12));
assert.strictEqual(stories().length, 10, "12 real signed-in posts arrive: the Times redraws to 10");
assert.ok(stories()[0].classList.contains("is-lead"), "headliner after redraw");
assert.strictEqual(author(stories()[0]), "Member 0", "the most reacted real post leads");
noDemo("after signed-in arrival");
checkLines("after signed-in arrival");

/* 6. Same plate again: no needless redraw (open comments are not reset). */
var lead = stories()[0];
lead.querySelector("[data-times-comments-toggle]").click();
Tower.setRemotePosts(remotePosts(12));
assert.strictEqual(stories()[0], lead, "unchanged plate: no redraw");
assert.ok(lead.hasAttribute("data-times-comments-open"), "an open thread stays open");
lead.querySelector("[data-times-comments-toggle]").click();

/* 7. Only 2 real posts: print what is real, no made-up fill. */
Tower.setRemotePosts(remotePosts(2));
var real = Math.min(10, Tower.newsList().length);
assert.strictEqual(stories().length, real, "2 real posts arrive: prints the real count (" + real + "), no fill");
noDemo("small signed-in plate");
checkLines("small signed-in plate");

console.log("times-demo-posts.test.js ok");
