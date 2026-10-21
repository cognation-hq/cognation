/**
 * Cognation Times redraws (region switch, Refresh, back to Local) keep the front
 * page: up to TIMES_SLOTS = 10 stories, and every story gets its closed
 * "Comments" line. Runs the real appendPostEl (commune.js) with the real
 * news-comments.js mount(), so the order "insert, then mount" is what is tested.
 * Run: node js/times-redraw.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var commune = fs.readFileSync(path.join(__dirname, "commune.js"), "utf8");

/* Minimal DOM: enough for appendPostEl + mount() + the toggle. */
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
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.insertBefore = function (c, ref) { c.parentNode = this; this.children.splice(this.children.indexOf(ref), 0, c); return c; };
El.prototype.addEventListener = function (n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); };
El.prototype.click = function () { (this.listeners.click || []).forEach(function (f) { f({ preventDefault: function () {} }); }); };
El.prototype.closest = function (sel) { var e = this; while (e) { if (sel === "#panel-signal" && e.id === "panel-signal") return e; e = e.parentNode; } return null; };
El.prototype.querySelectorAll = function (sel) {
  var out = [];
  if (sel === ".news-comment-item") { var m = this._html.match(/class="news-comment-item"/g); return new Array(m ? m.length : 0); }
  (function walk(e) { e.children.forEach(function (c) {
    if (c.hasAttribute(sel.slice(1, -1))) out.push(c); walk(c); }); })(this);
  return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); this.children = []; },
});

var store = {};
global.window = global;
global.localStorage = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
global.document = { createElement: function (t) { return new El(t); }, querySelectorAll: function () { return []; }, addEventListener: function () {} };
window.CognationAgeFloor = { viewerAge: function () { return 30; } };
require("./news-comments.js");

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

var appendSrc = fnSource("appendPostEl");
assert.ok(appendSrc.indexOf("feedList.appendChild(article);") < appendSrc.indexOf("CognationNewsComments.mount(article"),
  "the story is inserted before its comments mount");

/* The feed sits inside SIGNAL, as in index.html. */
var panel = new El("section"); panel.id = "panel-signal";
var feedList = panel.appendChild(new El("div"));
var env = { editionId: "local" };
var appendPostEl = new Function("feedList", "escapeHtml", "formatTime", "env",
  "var editionId = env.editionId;\n" + appendSrc + "\nreturn appendPostEl;")(
  feedList, function (s) { return String(s == null ? "" : s); }, function () { return "now"; }, env);

/* renderFeed's printing block, driven by the real appendPostEl. */
var printBlock = /var printed = posts\.slice\(0, TIMES_SLOTS\);[\s\S]*?var spare = [^;]*;/.exec(fnSource("renderFeed"))[0];
function renderFeed(posts) {
  feedList.innerHTML = "";
  new Function("posts", "TIMES_SLOTS", "appendPostEl", printBlock)(posts, 10, appendPostEl);
}
var state = { byEdition: {} };
function applyRefreshedPosts(posts, note) {
  return new Function("FeedStore", "editionId", "renderFeed", "setStatus", "feedStatus",
    fnSource("applyRefreshedPosts") + "\nreturn applyRefreshedPosts;")(
    { getState: function () { return state; }, save: function () {} }, env.editionId,
    function () { renderFeed(state.byEdition[env.editionId].posts); }, function () {}, null)(posts, note);
}
var refreshStatewidePlate = new Function("hotTopicCursor", "postsFromTower", "feedList", "appendPostEl", "setEndlessUi", "bindEndlessObserver", "setStatus", "feedStatus", "endlessOn", "TIMES_SLOTS",
  "var wirePage = 0;\n" + fnSource("refreshStatewidePlate") + "\nreturn refreshStatewidePlate;")(
  {}, function () { return stories("s", 14); }, feedList, appendPostEl, function () {}, function () {}, function () {}, null, false, 10);

function stories(prefix, n) { var out = []; for (var i = 0; i < n; i++) out.push({ id: prefix + i, authorName: "A" + i, body: "b" + i, createdAt: "2026-10-20T12:00:00Z" }); return out; }
function check(label) {
  var arts = feedList.children.filter(function (c) { return c.hasAttribute && c.hasAttribute("data-news-post"); });
  assert.strictEqual(arts.length, 10, label + ": 10 stories");
  assert.ok(arts[0].classList.contains("is-lead"), label + ": first is the headliner");
  arts.forEach(function (a, i) {
    var t = a.querySelector("[data-times-comments-toggle]");
    var host = a.querySelector("[data-news-comments]");
    assert.ok(t && host, label + ": story " + i + " has its Comments line");
    assert.ok(!t.hidden, label + ": story " + i + " line visible");
    assert.strictEqual(t.getAttribute("aria-expanded"), "false", label + ": story " + i + " starts closed");
    assert.ok(!a.hasAttribute("data-times-comments-open"), label + ": story " + i + " thread closed");
    assert.strictEqual(t.getAttribute("aria-controls"), host.id, label + ": aria-controls");
  });
  var t0 = arts[0].querySelector("[data-times-comments-toggle]");
  t0.click();
  assert.strictEqual(t0.getAttribute("aria-expanded"), "true", label + ": opens");
  assert.ok(arts[0].hasAttribute("data-times-comments-open"), label + ": thread open");
  assert.strictEqual(t0.textContent, "Hide comments", label + ": open label");
  t0.click();
  assert.strictEqual(t0.getAttribute("aria-expanded"), "false", label + ": closes again");
  assert.strictEqual(t0.textContent, "Comments", label + ": closed label");
}

/* First paint, then every redraw path SeedOps hit. */
renderFeed(stories("l", 14)); check("first paint (Local)");
env.editionId = "statewide"; renderFeed(stories("w", 12)); check("switch to Statewide");
refreshStatewidePlate(); check("Refresh (Statewide)");
env.editionId = "nationwide"; renderFeed(stories("n", 10)); check("switch to Nationwide");
applyRefreshedPosts(stories("nr", 14), "x"); check("Refresh (Nationwide)");
env.editionId = "international"; renderFeed(stories("i", 11)); check("switch to International");
applyRefreshedPosts(stories("ir", 14), "x"); check("Refresh (International)");
env.editionId = "local"; renderFeed(stories("l", 14)); check("back to Local");

/* Fewer than 10 real stories: print what exists, still each with a closed line. */
renderFeed(stories("f", 5));
var five = feedList.children.filter(function (c) { return c.hasAttribute && c.hasAttribute("data-news-post"); });
assert.strictEqual(five.length, 5, "5 stories print 5 (no invented stories)");
assert.ok(five.every(function (a) { var t = a.querySelector("[data-times-comments-toggle]"); return t && t.getAttribute("aria-expanded") === "false"; }), "each of the 5 has a closed line");
console.log("times-redraw.test.js ok");
