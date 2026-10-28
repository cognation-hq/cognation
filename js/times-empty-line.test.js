/**
 * Cognation Times empty-paper line: "No stories yet — News will fill this edition."
 * shows whenever the Times has no visible story (wire filler is display:none in
 * SIGNAL and does not count), and hides as soon as one real story prints.
 * Runs the real commune.js renderFeed / refreshStatewidePlate / loadMoreWire /
 * makeWirePost / appendPostEl / syncFeedEmpty.
 * Run: node js/times-empty-line.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html");
var commune = src("js/commune.js");
var css = src("css/styles.css");
var LINE = "No stories yet — News will fill this edition.";

assert.ok(html.indexOf('<p class="commune-empty" data-commune-feed-empty hidden>' + LINE + "</p>") !== -1, "index.html carries the exact empty line");
(function walk(dir) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name === ".git" || name === "node_modules") return;
    var full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return walk(full);
    if (!/\.(html|js|mjs|css|json|md)$/.test(name) || /times-empty-line\.test\.js$/.test(name)) return;
    assert.ok(fs.readFileSync(full, "utf8").indexOf("No plate yet") === -1, "old wording gone: " + path.relative(root, full));
  });
})(root);
assert.ok(/#panel-signal \.commune-feed-item\.is-wire/.test(css), "wire filler is hidden in SIGNAL (why it does not count)");

/* Minimal DOM */
function El(tag) {
  this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null;
  this.hidden = false; this.id = ""; this.className = ""; this.textContent = ""; this._html = ""; this.listeners = {};
  var self = this;
  this.classList = {
    add: function (c) { if (!this.contains(c)) self.className = (self.className + " " + c).trim(); },
    contains: function (c) { return (" " + self.className + " ").indexOf(" " + c + " ") >= 0; },
    toggle: function () {}, remove: function () {},
  };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
El.prototype.appendChild = function (c) { if (c.parentNode) { var s = c.parentNode.children; s.splice(s.indexOf(c), 1); } c.parentNode = this; this.children.push(c); return c; };
Object.defineProperty(El.prototype, "isConnected", { get: function () { return !!this.parentNode; } });
El.prototype.querySelector = function (sel) {
  assert.strictEqual(sel, "[data-news-post]:not(.is-wire)", "only the visible-story selector is used here");
  return this.children.filter(function (c) { return c.hasAttribute("data-news-post") && !c.classList.contains("is-wire"); })[0] || null;
};
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; },
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

var feedList = new El("div");
var feedEmpty = new El("p"); feedEmpty.hidden = true; feedEmpty.textContent = LINE;
var state = { posts: [], endlessOn: true, editionId: "local" };
var times = new Function("feedList", "feedEmpty", "state", "document", "window", [
  "var editionId = state.editionId, FeedStore = { listPosts: function () { return []; } };",
  "var endlessOn = true, feedSentinel = null, feedLoading = null, briefLatest = null, feedObserver = null, feedStatus = null;",
  "var wirePage = 0, wireLoading = false, WIRE_BATCH = 8, TIMES_SLOTS = 10, floorUnder13AtRender = null, towerPlateKeyAtRender = null;",
  "var hotTopicCursor = {};",
  "var WIRE_LINES = { local: ['wire line'] }, WIRE_BYLINES = ['City Desk'];",
  "function natIntlFloor(p) { return p; } function newsViewerUnder13() { return false; } function wireAllowed() { return true; }",
  "function setEndlessUi() {} function setStatus() {}",
  "function bindEndlessObserver() { loadMoreWire(); }", /* browser: first fill if the list is short */
  "function postsFromTower() { return state.posts.slice(); }",
  "function escapeHtml(s) { return String(s == null ? '' : s); } function formatTime() { return 'now'; }",
  fnSource("towerPlateKey"), fnSource("syncFeedEmpty"), fnSource("makeWirePost"), fnSource("timesHeadline"), fnSource("postScore"), fnSource("appendPostEl"),
  fnSource("loadMoreWire"), fnSource("renderFeed"), fnSource("refreshStatewidePlate"),
  "return { render: function () { endlessOn = state.endlessOn; renderFeed(); }, refresh: function () { endlessOn = state.endlessOn; refreshStatewidePlate(); }, more: function () { loadMoreWire(); } };",
].join("\n"))(
  feedList, feedEmpty, state, { createElement: function (t) { return new El(t); } }, {});

function wires() { return feedList.children.filter(function (c) { return c.classList.contains("is-wire"); }).length; }
function stories(n) { var o = []; for (var i = 0; i < n; i++) o.push({ id: "s" + i, authorName: "A" + i, body: "b" + i, createdAt: "2026-10-20T12:00:00Z" }); return o; }

/* No real stories, wire on (the live default): wire loads but is hidden -> line shows. */
times.render();
assert.ok(wires() > 0, "wire filler loaded");
assert.strictEqual(feedEmpty.hidden, false, "no visible stories + wire on: empty line shows");
assert.strictEqual(feedEmpty.textContent, LINE);
times.more();
assert.strictEqual(feedEmpty.hidden, false, "more wire (still nothing visible): line stays");

/* No real stories, wire off. */
state.endlessOn = false; times.render();
assert.strictEqual(feedEmpty.hidden, false, "no stories + wire off: empty line shows");

/* Real stories print: line hides (wire on and off). */
state.posts = stories(3); state.endlessOn = true; times.render();
assert.strictEqual(feedEmpty.hidden, true, "3 stories + wire on: line hidden");
state.endlessOn = false; times.render();
assert.strictEqual(feedEmpty.hidden, true, "3 stories + wire off: line hidden");

/* Back to nothing (e.g. a redraw after the account's posts change). */
state.posts = []; state.endlessOn = true; times.render();
assert.strictEqual(feedEmpty.hidden, false, "redraw to 0 stories: line comes back");

/* Statewide Refresh. */
state.editionId = "statewide";
times.refresh();
assert.strictEqual(feedEmpty.hidden, false, "Statewide Refresh with 0 stories: line shows");
state.posts = stories(4); times.refresh();
assert.strictEqual(feedEmpty.hidden, true, "Statewide Refresh with stories: line hidden");
console.log("times-empty-line.test.js ok");
