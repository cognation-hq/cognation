/**
 * News comments: the thread mounts even when the feed renders before
 * js/news-comments.js loads, and re-renders when the session changes.
 * Run: node js/news-comments-mount-race.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
/* index.html loads the shared age-floor helper before news-comments.js. */
function ncSrc() { return src("js/age-floor-keywords.js") + "\n" + src("js/news-comments.js"); }

/* Tiny DOM: enough for mount()/renderThread(). */
function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.attrs = {};
  this.children = [];
  this.hidden = false;
  this.innerHTML = "";
  this.className = "";
  this.listeners = {};
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (n, fn) { (this.listeners[n] = this.listeners[n] || []).push(fn); };
El.prototype.querySelector = function (sel) {
  var m = sel.match(/^\[([a-z-]+)\]$/);
  for (var i = 0; i < this.children.length; i++) if (m && this.children[i].getAttribute(m[1]) !== null) return this.children[i];
  return null;
};
function makeDocument() {
  var stories = [], listeners = {};
  return {
    stories: stories,
    readyState: "interactive",
    createElement: function (t) { return new El(t); },
    querySelectorAll: function (sel) {
      /* The Feed instance of the same module scans Feed posts; none here. */
      if (sel === "[data-tower-post]") return [];
      assert.strictEqual(sel, "[data-news-post][data-post-id]");
      return stories.filter(function (a) { return a.getAttribute("data-news-post") !== null && a.getAttribute("data-post-id"); });
    },
    addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
    dispatch: function (n) { (listeners[n] || []).forEach(function (fn) { fn({ type: n }); }); },
    listenerCount: function (n) { return (listeners[n] || []).length; },
  };
}
function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
/* What commune.js appendPostEl does, including its "skip if not loaded yet" guard. */
function renderStory(win, doc, id, rating) {
  var a = new El("article");
  a.setAttribute("data-news-post", "");
  a.setAttribute("data-post-id", id);
  if (rating) a.setAttribute("data-news-rating", rating);
  if (win.CognationNewsComments && win.CognationNewsComments.mount) win.CognationNewsComments.mount(a, { id: id, rating: rating });
  doc.stories.push(a);
  return a;
}
function thread(a) { return a.querySelector("[data-news-comments]"); }

var commune = src("js/commune.js");
assert.ok(commune.indexOf("CognationNewsComments.mount(article") !== -1, "commune still calls mount when loaded");
var html = src("index.html");
assert.ok(html.indexOf('src="js/commune.js" defer') < html.indexOf('src="js/news-comments.js" defer'),
  "fixture: commune.js runs before news-comments.js, so the race is real");

/* 1. Signed out, Supabase on: feed first, then news-comments.js -> sign-in line in the slot. */
var win = {}, doc = makeDocument(), session = null, pulls = 0;
win.CognationSupabase = {
  configured: function () { return true; },
  rest: function (table) { if (table === "news_story_comments") pulls += 1; return Promise.resolve([]); },
};
win.CognationAuth = { getSession: function () { return session; } };
var nat = renderStory(win, doc, "nat-2026-10-07-mit-for-america", "G-PG");
var plain = renderStory(win, doc, "nat-plain", "");
assert.strictEqual(thread(nat), null, "before the fix point: nothing mounted yet");

vm.runInNewContext(ncSrc(), {
  window: win, document: doc, localStorage: mem(), Date: Date, Math: Math, Promise: Promise,
  encodeURIComponent: encodeURIComponent,
});
var host = thread(nat);
assert.ok(host, "thread mounts into a story rendered before the script loaded");
assert.strictEqual(host.hidden, false);
assert.ok(host.innerHTML.indexOf("Sign in to see and post comments.") !== -1, "signed-out sign-in line shows");
assert.strictEqual(host.getAttribute("data-story-id"), "nat-2026-10-07-mit-for-america");
assert.ok(thread(plain), "every rendered story gets a slot");
assert.strictEqual(typeof win.CognationNewsComments.mountAll, "function");
["cognation:session-started", "cognation:session-ended", "cognation:active-profile-changed"].forEach(function (n) {
  assert.strictEqual(doc.listenerCount(n), 2, "listens for " + n + " (News + Feed instances)");
});

/* Later renders still mount directly (commune path) and do not double-bind. */
var later = renderStory(win, doc, "nat-later", "G-PG");
assert.ok(thread(later) && thread(later).innerHTML.indexOf("Sign in") !== -1, "direct mount still works");

/* 2. Saved session restored after first paint -> threads re-render with the composer. */
session = { activeProfileId: "p-ada", profileDisplayName: "Ada", accountKind: "seed" };
doc.dispatch("cognation:session-started");
setTimeout(function () {
  assert.ok(pulls >= 3, "session start pulls shared comments for each story");
  var h = thread(nat);
  assert.strictEqual(h, host, "re-render reuses the same slot");
  assert.ok(h.innerHTML.indexOf("data-news-comment-form") !== -1, "composer appears after session restore");
  assert.ok(h.innerHTML.indexOf("Sign in to see") === -1);
  assert.strictEqual((h.listeners.submit || []).length, 1, "submit bound once");
  assert.strictEqual((h.listeners.click || []).length, 1, "click bound once");

  /* 3. Sign out -> back to the sign-in line. */
  session = null;
  doc.dispatch("cognation:session-ended");
  assert.ok(thread(nat).innerHTML.indexOf("Sign in to see and post comments.") !== -1, "sign-out re-renders");

  /* 4. No document (older vm tests) -> loads without throwing. */
  var w2 = {};
  vm.runInNewContext(ncSrc(), { window: w2, localStorage: mem(), Date: Date, Math: Math });
  assert.strictEqual(w2.CognationNewsComments.mountAll(), 0);
  console.log("news-comments-mount-race.test.js: ok");
}, 20);
