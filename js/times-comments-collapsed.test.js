/**
 * Cognation Times: each story's comments start closed behind one ink text line,
 * "Comments (n)" / "Hide comments" (follows #190). Report is untouched.
 * Run: node js/times-comments-collapsed.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var src = fs.readFileSync(path.join(__dirname, "news-comments.js"), "utf8");
var commune = fs.readFileSync(path.join(__dirname, "commune.js"), "utf8");

/* Minimal DOM, enough for mount() + the toggle. */
function El(tag) {
  this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null;
  this.hidden = false; this.id = ""; this.className = ""; this.textContent = ""; this._html = ""; this.listeners = {};
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
    var hit = (sel === "[data-news-comments]" && c.hasAttribute("data-news-comments")) || (sel === "[data-times-comments-toggle]" && c.hasAttribute("data-times-comments-toggle"));
    if (hit) out.push(c); walk(c); }); })(this);
  return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
Object.defineProperty(El.prototype, "innerHTML", { get: function () { return this._html; }, set: function (v) { this._html = String(v); } });

var store = {};
global.window = global;
global.localStorage = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
global.document = { createElement: function (t) { return new El(t); }, querySelectorAll: function () { return []; }, addEventListener: function () {} };
window.CognationAgeFloor = { viewerAge: function () { return 30; } };
require("./news-comments.js");
var api = window.CognationNewsComments;

var panel = new El("div"); panel.id = "panel-signal";
var article = panel.appendChild(new El("article"));
api.mount(article, { id: "story-1" });
var toggle = article.querySelector("[data-times-comments-toggle]");
var host = article.querySelector("[data-news-comments]");
assert.ok(toggle && toggle.tagName === "BUTTON" && toggle.type === "button", "one button per story");
assert.strictEqual(article.children.indexOf(toggle) + 1, article.children.indexOf(host), "line sits right above the thread");
assert.strictEqual(toggle.getAttribute("aria-controls"), host.id, "aria-controls names the thread");
assert.strictEqual(toggle.getAttribute("aria-expanded"), "false", "starts closed");
assert.ok(!article.hasAttribute("data-times-comments-open"), "story starts closed");
assert.strictEqual(toggle.textContent, "Comments", "no comments: plain label");
toggle.click();
assert.strictEqual(toggle.textContent, "Hide comments");
assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
assert.ok(article.hasAttribute("data-times-comments-open"));
toggle.click();
assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");

api.addComment({ storyId: "story-2", body: "One" });
api.addComment({ storyId: "story-2", body: "Two" });
var a2 = panel.appendChild(new El("article"));
api.mount(a2, { id: "story-2" });
assert.strictEqual(a2.querySelector("[data-times-comments-toggle]").textContent, "Comments (2)", "real count");
api.mount(a2, { id: "story-2" });
assert.strictEqual(a2.querySelectorAll("[data-times-comments-toggle]").length, 1, "remount adds no second line");

var elsewhere = new El("article");
api.mount(elsewhere, { id: "story-3" });
assert.ok(!elsewhere.querySelector("[data-times-comments-toggle]"), "only inside SIGNAL (Times)");

window.CognationAgeFloor.viewerAge = function () { return 0; };
var a4 = panel.appendChild(new El("article"));
api.mount(a4, { id: "story-4" });
assert.ok(a4.querySelector("[data-times-comments-toggle]").hidden, "no line for viewers who get no thread");

assert.ok(/#panel-signal \.commune-feed-item:not\(\[data-times-comments-open\]\) \.news-story-comments \{ display: none !important; \}/.test(css), "closed stories hide the thread");
var rule = /#panel-signal \.times-comments-toggle \{([^}]*)\}/.exec(css)[1];
assert.ok(/border-radius:\s*0/.test(rule) && /background:\s*none/.test(rule) && /color:\s*#16120c/.test(rule) && /Old Standard TT/.test(rule), "ink text line in the Times serif, no pill");
assert.ok(!/yellow|#ff[cd]|#fe[0-9a-f]{4}/i.test(rule), "no yellow");
assert.ok(/data-news-report-toggle>Report</.test(commune), "Report unchanged");
/* Exactly 10 story slots: 1 headliner across the full width + 9 in rows of three. */
assert.ok(/var TIMES_SLOTS = 10;/.test(commune), "hard cap constant is 10");
assert.ok(/var printed = posts\.slice\(0, TIMES_SLOTS\);\s*printed\.forEach\(function \(post, idx\) \{\s*appendPostEl\(post, \{ lead: idx === 0 \}\);/.test(commune), "front page renders at most TIMES_SLOTS stories, first is the headliner");
assert.ok(/var spare = \(3 - \(printed\.length % 3\)\) % 3;/.test(commune), "filler loop counts the capped list");
assert.ok(/#panel-signal \.commune-feed-item\.is-lead \{ grid-column: 1 \/ -1; \}/.test(css), "headliner spans the full width");
assert.ok(/#panel-signal \.commune-feed-item\.is-lead \.commune-feed-body \{\s*font-size: 1\.35rem !important;/.test(css), "headliner is bigger");
assert.ok(/#panel-signal \.times-column-pad \{ display: none !important; \}/.test(css), "no blank filler boxes");

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
function fourteen(prefix) { var out = []; for (var i = 0; i < 14; i++) out.push({ id: prefix + i, body: "b" + i }); return out; }

/* renderFeed printing block: 14 candidates print 10, filler counted on the 10. */
var feedSrc = fnSource("renderFeed");
var block = /var printed = posts\.slice\(0, TIMES_SLOTS\);[\s\S]*?var spare = [^;]*;/.exec(feedSrc)[0];
function printFeed(posts) {
  var rendered = [];
  var spare = new Function("posts", "TIMES_SLOTS", "appendPostEl", block + "\nreturn spare;")(posts, 10, function (p, o) { rendered.push([p.id, o.lead]); });
  return { rendered: rendered, spare: spare };
}
var front = printFeed(fourteen("p"));
assert.strictEqual(front.rendered.length, 10, "14 candidates print 10");
assert.deepStrictEqual(front.rendered[0], ["p0", true], "the top story is the headliner");
assert.ok(front.rendered.slice(1).every(function (r) { return r[1] === false; }), "nine regular stories");
assert.strictEqual(front.spare, 2, "filler is computed from the 10 printed, not the 14 candidates");

/* Refresh, Nationwide / International: applyRefreshedPosts stores 14 and re-renders -> 10 out. */
var state = { byEdition: {} };
var refreshed = null;
var applyRefreshed = new Function("FeedStore", "editionId", "renderFeed", "setStatus", "feedStatus",
  fnSource("applyRefreshedPosts") + "\nreturn applyRefreshedPosts;")(
  { getState: function () { return state; }, save: function () {} }, "national",
  function () { refreshed = printFeed(state.byEdition.national.posts); }, function () {}, null);
applyRefreshed(fourteen("n"), "Live hot topics loaded.");
assert.strictEqual(state.byEdition.national.posts.length, 14, "the stored plate itself is unchanged");
assert.strictEqual(refreshed.rendered.length, 10, "refresh (Nationwide / International): 14 in, 10 out");

/* Refresh, Statewide: refreshStatewidePlate prints directly -> 10 out. */
var statewideOut = [];
var refreshStatewide = new Function("hotTopicCursor", "postsFromTower", "feedList", "appendPostEl", "setEndlessUi", "bindEndlessObserver", "setStatus", "feedStatus", "endlessOn", "TIMES_SLOTS",
  "var wirePage = 0;\nfunction syncFeedEmpty() {}\n" + fnSource("refreshStatewidePlate") + "\nreturn refreshStatewidePlate;")(
  {}, function () { return fourteen("s"); }, { innerHTML: "" }, function (p, o) { statewideOut.push([p.id, o.lead]); },
  function () {}, function () {}, function () {}, null, false, 10);
refreshStatewide();
assert.strictEqual(statewideOut.length, 10, "refresh (Statewide): 14 in, 10 out");
assert.strictEqual(statewideOut[0][1], true, "statewide refresh keeps a headliner");
assert.ok(/posts\.slice\(0, TIMES_SLOTS\)\.forEach\(function \(post, idx\) \{\s*appendPostEl/.test(fnSource("refreshStatewidePlate")), "statewide refresh uses TIMES_SLOTS");
console.log("times-comments-collapsed.test.js ok");
