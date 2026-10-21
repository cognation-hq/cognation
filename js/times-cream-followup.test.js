/**
 * Cream follow-up (PM + Designer, Oct 21):
 * 1. Times comment box: #fbf7ec field, 1px ink border, #6b6458 placeholder,
 *    dividers ink at 20%.
 * 2. Story Report has "Not right for my age" (reason misrated) and no
 *    "Demo / local only" line.
 * 3. 390: Log out pill spacing, two-line masthead line height.
 * 4. Same-edition redraws (Statewide Refresh, signed-in arrival) keep an open
 *    comment thread open; switching edition closes it. Runs the real
 *    appendPostEl / refreshStatewidePlate (commune.js) with the real
 *    news-comments.js mount(), as js/times-redraw.test.js does.
 * 5. Tower header: the empty visitor action row collapses on your own Tower.
 * Run: node js/times-cream-followup.test.js
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
function resetTimesOpen() { window.CognationNewsComments.resetTimesOpen(); }

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
  "var wirePage = 0;\nfunction syncFeedEmpty() {}\n" + fnSource("refreshStatewidePlate") + "\nreturn refreshStatewidePlate;")(
  {}, function () { return stories("s", 14); }, feedList, appendPostEl, function () {}, function () {}, function () {}, null, false, 10);


function stories(prefix, n) { var out = []; for (var i = 0; i < n; i++) out.push({ id: prefix + i, authorName: "A" + i, body: "b" + i, createdAt: "2026-10-20T12:00:00Z" }); return out; }
function arts() { return feedList.children.filter(function (c) { return c.hasAttribute && c.hasAttribute("data-news-post"); }); }
function openKeys() { return arts().filter(function (a) { return a.hasAttribute("data-times-comments-open"); }).map(function (a) { return a.getAttribute("data-news-story-key"); }); }
function toggle(a) { return a.querySelector("[data-times-comments-toggle]"); }

/* 4a. Signed-in posts land on Local (same edition): renderFeed again keeps story 1 open. */
renderFeed(stories("l", 14));
assert.deepStrictEqual(openKeys(), [], "first paint: all closed");
toggle(arts()[1]).click();
assert.deepStrictEqual(openKeys(), ["l1"], "reader opens story 1");
renderFeed(stories("l", 14));
assert.deepStrictEqual(openKeys(), ["l1"], "arrival redraw keeps the open thread open");
var reopened = arts()[1];
assert.strictEqual(toggle(reopened).getAttribute("aria-expanded"), "true", "line reads open after redraw");
assert.strictEqual(toggle(reopened).textContent, "Hide comments", "Hide comments after redraw");
assert.ok(arts().filter(function (a, i) { return i !== 1; }).every(function (a) { return toggle(a).getAttribute("aria-expanded") === "false"; }), "the others stay closed");
toggle(reopened).click();
renderFeed(stories("l", 14));
assert.deepStrictEqual(openKeys(), [], "closed before the redraw stays closed");

/* 4b. Statewide Refresh reshuffles and renames copies; the open story keeps its thread. */
resetTimesOpen();
env.editionId = "statewide";
renderFeed(stories("s", 14));
toggle(arts()[2]).click();
assert.deepStrictEqual(openKeys(), ["s2"], "Statewide: reader opens s2");
refreshStatewidePlate();
var after = arts();
assert.strictEqual(after.length, 10, "Statewide Refresh prints 10");
assert.ok(after[0].classList.contains("is-lead"), "headliner first");
assert.ok(/^statewide-refresh-/.test(after[0].getAttribute("data-post-id")), "copies keep their refresh ids");
assert.deepStrictEqual(openKeys(), ["s2"], "Statewide Refresh keeps s2's thread open");
var s2 = after.filter(function (a) { return a.getAttribute("data-news-story-key") === "s2"; })[0];
assert.strictEqual(s2.querySelector("[data-news-comments]").getAttribute("data-story-id"), "s2", "the copy shows s2's own thread");
assert.strictEqual(toggle(s2).getAttribute("aria-expanded"), "true", "line reads open");

/* 4c. Switching edition starts the new edition closed. */
resetTimesOpen();
env.editionId = "nationwide";
renderFeed(stories("s", 14));
assert.deepStrictEqual(openKeys(), [], "edition switch: nothing carried over");
var setEditionSrc = fnSource("setEdition");
assert.ok(setEditionSrc.indexOf("resetTimesOpen()") > 0 && setEditionSrc.indexOf("resetTimesOpen()") < setEditionSrc.indexOf("renderFeed()"),
  "setEdition clears open threads before it redraws");
assert.ok(/copy\.sourceId = p\.sourceId \|\| p\.id/.test(fnSource("refreshStatewidePlate")), "Refresh copies remember their story");

/* 2. Report: "Not right for my age" -> reason misrated, labelled status, no Demo line. */
assert.ok(appendSrc.indexOf('data-news-report-reason="misrated">Not right for my age</button>') > 0, "story Report menu offers Not right for my age");
assert.ok(appendSrc.indexOf('data-news-report-reason="untruthful"') < appendSrc.indexOf('data-news-report-reason="misrated"') &&
  appendSrc.indexOf('data-news-report-reason="misrated"') < appendSrc.indexOf("data-news-report-block"), "order: Harmful, Untruthful, Not right for my age, Block");
var stub = fs.readFileSync(path.join(__dirname, "news-report-stub.js"), "utf8");
assert.ok(/misrated: "Not right for my age"/.test(stub) && /if \(!REASON_LABELS\[reason\]\) return;/.test(stub), "stub files misrated");
assert.ok(stub.indexOf("Demo / local only") < 0 && stub.indexOf("browser only") < 0, "no Demo / local only status line");
var server = fs.readFileSync(path.join(__dirname, "content-report.js"), "utf8");
assert.ok(/"misrated"/.test(server), "server report already accepts misrated (no SQL needed)");

var vm = require("vm");
var calls = [];
var sandboxStore = {};
var sandbox = {
  localStorage: { getItem: function (k) { return sandboxStore[k] || null; }, setItem: function (k, v) { sandboxStore[k] = String(v); }, removeItem: function (k) { delete sandboxStore[k]; } },
  document: { dispatchEvent: function () {}, addEventListener: function () {} },
  CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
  fetch: function () { return Promise.resolve(); },
  CognationContentReport: { reportTowerPost: function (o) { calls.push(o); return Promise.resolve({}); } },
  console: console,
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "moderation.js"), "utf8"), sandbox);
var res = sandbox.CognationModeration.enqueue({ postId: "11111111-2222-4333-8444-555555555555", reason: "misrated", post: { reporterNote: "User report: Not right for my age" } });
assert.strictEqual(String(res.report.reason), "misrated", "queue keeps misrated (not folded into harmful)");
assert.strictEqual(calls.length, 1, "server report filed");
assert.strictEqual(String(calls[0].reason), "misrated", "server reason misrated");
assert.strictEqual(String(calls[0].note), "User report: Not right for my age", "readable note");

/* 1, 3, 5. CSS. */
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
var block = css.slice(css.indexOf("/* Cream follow-up (PM + Designer, Oct 21)"), css.indexOf("/* Tower header name (Designer follow-up)"));
assert.ok(block.length > 100, "cream follow-up block present");
assert.ok(/input\[data-news-comment-input\] \{[^}]*background: #fbf7ec !important;[^}]*border: 1px solid #16120c !important;/.test(block), "comment box: cream field, 1px ink border");
assert.ok(/input\[data-news-comment-input\]::placeholder \{[^}]*color: #6b6458 !important;/.test(block), "placeholder #6b6458");
assert.ok(/#panel-signal \.news-story-comments\[data-news-comments\],\s*#panel-signal \.news-report-bar\[data-news-report\] \{\s*border-top-color: rgba\(22, 18, 12, 0\.2\) !important;/.test(block), "dividers ink at 20%");
assert.ok(/max-width: 640px\) \{[\s\S]*?\.app-topbar \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto !important;[^}]*column-gap: 12px;[^}]*padding-right: 10px !important;/.test(block), "390: Log out 12px from PULSE, 10px from the edge");
assert.ok(/max-width: 720px\) \{[\s\S]*?#panel-signal \.paper-title \{ line-height: 1 !important; \}/.test(block), "390: masthead lines get room");
assert.ok(/\.tower-profile-actions:not\(:has\(> \.tower-follow-row:not\(\[hidden\]\)\)\) \{\s*display: none;/.test(block), "empty action row collapses");
assert.ok(/~ \.tower-under-photo \{\s*margin-top: 0\.15rem;/.test(block) && /~ \.tower-under-photo \[data-tower-add-friends\] \{\s*margin-bottom: 0\.82rem;/.test(block), "owner pill spacing matches the visitor row");
assert.ok(!/#ed9300|#f5a623|#ffb000|#ffc107|gold|amber|yellow/i.test(block), "no yellow");
console.log("times-cream-followup.test.js ok");
