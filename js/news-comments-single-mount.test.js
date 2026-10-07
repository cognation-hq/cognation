/**
 * News comments: one thread slot per story, however many times mount() runs
 * (commune.js render, mountAll() on script load, session/profile events),
 * including while a signed-in shared-comments pull is still in flight.
 * Run: node js/news-comments-single-mount.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
/* index.html loads the shared age-floor helper before news-comments.js. */
var code = fs.readFileSync(path.join(__dirname, "..", "js", "age-floor-keywords.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(__dirname, "..", "js", "news-comments.js"), "utf8");

function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.attrs = {}; this.children = []; this.hidden = false; this.innerHTML = ""; this.className = ""; this.listeners = {};
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
function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function threads(a) {
  return a.children.filter(function (c) { return c.className === "news-story-comments"; });
}
function story(id, rating) {
  var a = new El("article");
  a.setAttribute("data-news-post", "");
  a.setAttribute("data-post-id", id);
  if (rating) a.setAttribute("data-news-rating", rating);
  return a;
}
function setup(session) {
  var stories = [], listeners = {}, win = {}, pending = [];
  var doc = {
    createElement: function (t) { return new El(t); },
    querySelectorAll: function () { return stories.slice(); },
    addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
    dispatch: function (n) { (listeners[n] || []).forEach(function (fn) { fn({ type: n }); }); },
  };
  var state = { session: session };
  win.CognationSupabase = {
    configured: function () { return true; },
    /* Pulls stay pending until resolved, like a slow network on reload. */
    rest: function () { return new Promise(function (resolve) { pending.push(resolve); }); },
  };
  win.CognationAuth = { getSession: function () { return state.session; } };
  return {
    win: win, doc: doc, stories: stories, state: state,
    load: function () {
      vm.runInNewContext(code, { window: win, document: doc, localStorage: mem(), Date: Date, Math: Math, Promise: Promise, encodeURIComponent: encodeURIComponent });
    },
    communeRender: function (a) {
      stories.push(a);
      if (win.CognationNewsComments) win.CognationNewsComments.mount(a, { id: a.getAttribute("data-post-id"), rating: a.getAttribute("data-news-rating") || "" });
    },
    pending: pending,
    resolve: function (i, rows) { pending[i](rows || []); return tick(); },
    flush: function () { pending.forEach(function (r) { r([]); }); return tick(); },
  };
}
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }
function row(id, body, reactions) {
  return { id: id, story_id: "s1", body: body, created_at: "2026-10-07T15:00:00.000Z",
    author: { display_name: "Ada", account_kind: "seed" }, reactions: reactions || [] };
}
function assertOne(stories, label) {
  stories.forEach(function (a) {
    assert.strictEqual(threads(a).length, 1, label + ": exactly one thread on " + a.getAttribute("data-post-id"));
  });
}

var ADA = { activeProfileId: "p-ada", profileDisplayName: "Ada", accountKind: "seed" };

/* A. Signed-in reload: feed renders first (race), script load mountAll, commune
      re-mount, then session-started -- all while pulls are still pending. */
var t = setup(ADA);
var nat = story("nat-2026-10-07-mit-for-america", "G-PG");
var other = story("nat-other", "G-PG");
t.communeRender(nat);
t.communeRender(other);
assert.strictEqual(threads(nat).length, 0, "nothing mounted before the script loads");
t.load();
assertOne(t.stories, "after script-load mountAll");
t.win.CognationNewsComments.mount(nat, { id: "nat-2026-10-07-mit-for-america", rating: "G-PG" });
assertOne(t.stories, "after a commune.js mount");
t.doc.dispatch("cognation:session-started");
assertOne(t.stories, "after session-started");
t.doc.dispatch("cognation:active-profile-changed");
assertOne(t.stories, "after active-profile-changed");

t.flush().then(function () {
  assertOne(t.stories, "after pulls resolve");
  var slot = threads(nat)[0];
  assert.ok(slot.innerHTML.indexOf("data-news-comment-form") !== -1, "signed-in slot has the composer");
  assert.strictEqual((slot.listeners.submit || []).length, 1, "submit bound once");
  assert.strictEqual((slot.listeners.click || []).length, 1, "click bound once");

  /* B. PM cases on one story, signed in as Ada. */
  var u = setup(ADA);
  var s1 = story("s1", "G-PG");
  u.load();
  u.communeRender(s1);                        /* pull #0 */
  u.win.CognationNewsComments.mount(s1);       /* pull #1, before #0 resolves */
  assertOne(u.stories, "(1) two mounts before load");
  var slot1 = threads(s1)[0];
  /* Newer pull lands first, the stale one last: the stale render must lose. */
  return u.resolve(1, [row("c-new", "fresh comment")]).then(function () {
    return u.resolve(0, [row("c-old", "stale comment")]);
  }).then(function () {
    assertOne(u.stories, "(1) after both pulls");
    assert.ok(slot1.innerHTML.indexOf("fresh comment") !== -1, "(1) latest render wins");
    assert.ok(slot1.innerHTML.indexOf("stale comment") === -1, "(1) stale render lost");

    /* (2) Sign-out redraws the same slot with the sign-in line. A pull still in
       flight from the signed-in session must not paint over it. */
    u.win.CognationNewsComments.mount(s1);     /* pull #2, left pending */
    u.state.session = null;
    u.doc.dispatch("cognation:session-ended");
    assertOne(u.stories, "(2) after sign-out");
    assert.strictEqual(threads(s1)[0], slot1, "(2) same slot");
    assert.ok(slot1.innerHTML.indexOf("Sign in to see and post comments.") !== -1, "(2) sign-in line");
    return u.resolve(2, [row("c-late", "late signed-in pull")]);
  }).then(function () {
    assert.ok(slot1.innerHTML.indexOf("Sign in to see and post comments.") !== -1, "(2) late pull did not repaint");
    assert.ok(slot1.innerHTML.indexOf("late signed-in pull") === -1);
    assertOne(u.stories, "(2) still one slot");

    /* (3) Profile switch redraws the same slot for the new profile. */
    u.state.session = ADA;
    u.doc.dispatch("cognation:session-started");   /* pull #3 */
    return u.resolve(3, [row("c1", "hello", [{ face: "👍", profile_id: "p-hank" }])]);
  }).then(function () {
    assert.ok(slot1.innerHTML.indexOf("is-mine") === -1, "(3) Ada does not own Hank's react");
    u.state.session = { activeProfileId: "p-hank", profileDisplayName: "Hank", accountKind: "real" };
    u.doc.dispatch("cognation:active-profile-changed");   /* pull #4 */
    assertOne(u.stories, "(3) during profile switch");
    return u.resolve(4, [row("c1", "hello", [{ face: "👍", profile_id: "p-hank" }])]);
  }).then(function () {
    assertOne(u.stories, "(3) after profile switch");
    assert.strictEqual(threads(s1)[0], slot1, "(3) same slot");
    assert.ok(slot1.innerHTML.indexOf("is-mine") !== -1, "(3) redrawn for Hank (his react marked mine)");
    assert.strictEqual((slot1.listeners.submit || []).length, 1, "submit bound once");

    /* C. commune.js redraw: new article elements each get one slot; old ones are gone with feedList.innerHTML = "". */
    u.stories.length = 0;
    var redrawn = story("s1", "G-PG");
    u.communeRender(redrawn);
    u.doc.dispatch("cognation:session-started");
    assertOne(u.stories, "after commune redraw");
    console.log("news-comments-single-mount.test.js: ok");
  });
}).catch(function (err) { console.error(err); process.exit(1); });
