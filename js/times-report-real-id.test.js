/**
 * P1 (Alexa, Oct 22, 11:32 AM CT): Report on a Times story that is a person's
 * post said "Couldn't send report, try again".
 * Covers the real Times id path end to end, with no live calls:
 *   Feed row (uuid) -> CognationTowerStore.newsList -> commune.js postsFromTower
 *   -> appendPostEl -> news-report-stub.js -> content-report.js
 *   -> report_tower_post({ post_id: <bare uuid> }).
 * And the reader-facing outcomes:
 *   - accepted: "Reported: <option>. Hidden for you."
 *   - the reader's own post (any of their profiles): no server call, plain words.
 *   - server refusal codes (cannot_report_own, post_not_found, ...) in plain words;
 *     anything else still "Couldn't send report, try again", options kept.
 *   - a person's post keeps the full menu: Harmful / Untruthful / Not right for my age / Block.
 * Run: node js/times-report-real-id.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
function src(f) { return fs.readFileSync(path.join(__dirname, f), "utf8"); }
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

var POST = "0b6d8f2e-3c4a-4e5f-9a1b-2c3d4e5f6a7b";
var AUTHOR = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
var ME = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";
var ME_PRO = "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a";

function El(tag, attrs) {
  this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.children = []; this.parentNode = null;
  this.hidden = false; this.disabled = false; this.textContent = ""; this.style = {}; this.id = ""; this.listeners = {};
  this.className = ""; this.classList = { add: function () {} };
  for (var k in attrs || {}) this.setAttribute(k, attrs[k]);
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); if (k === "class") this.className = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.addEventListener = function (n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); };
El.prototype.matches = function (sel) {
  var self = this;
  return sel.split(",").some(function (one) {
    one = one.trim();
    var m;
    if ((m = /^#([\w-]+)$/.exec(one))) return self.id === m[1];
    if ((m = /^\.([\w-]+)$/.exec(one))) return (" " + self.className + " ").indexOf(" " + m[1] + " ") >= 0;
    if ((m = /^\[([\w-]+)\]$/.exec(one))) return self.hasAttribute(m[1]);
    return false;
  });
};
El.prototype.closest = function (sel) { var e = this; while (e) { if (e.matches && e.matches(sel)) return e; e = e.parentNode; } return null; };
El.prototype.querySelectorAll = function (sel) {
  var out = [];
  (function walk(e) { e.children.forEach(function (c) { if (c.matches(sel)) out.push(c); walk(c); }); })(this);
  return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };

/* --- 1. Feed row -> postsFromTower -> appendPostEl (real commune.js code) -- */
var commune = src("commune.js");
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
global.window = global;
global.document = { createElement: function (t) { return new El(t); }, querySelectorAll: function () { return []; }, addEventListener: function () {} };
window.CognationNewsComments = { mount: function () {} };
/* A real person's Feed post as supabase-social mapPost hands it to the store. */
window.CognationTowerStore = {
  newsList: function () {
    return [{
      id: POST, _remote: true, authorProfileId: AUTHOR, authorName: "LEX", handle: "lex",
      accountKind: "real", isSeed: false, body: "this is kidna lame with no friends",
      createdAt: "2026-10-22T16:00:00Z", attachments: [], likes: 0, reactions: {},
      visibility: "public", towerKind: "personal", rating: "G",
    }];
  },
};
var feedList = new El("div");
var times = new Function("feedList", "escapeHtml", "formatTime", "env",
  "var editionId = env.editionId;\n" + fnSource("postsFromTower") + "\n" + fnSource("timesHeadline") + "\n" + fnSource("appendPostEl") +
  "\nreturn { postsFromTower: postsFromTower, appendPostEl: appendPostEl };")(
  feedList, function (s) { return String(s == null ? "" : s); }, function () { return "now"; }, { editionId: "local" });
var stories = times.postsFromTower();
assert.strictEqual(stories.length, 1);
assert.strictEqual(stories[0].id, "from-tower-personal-" + POST, "Times display id is prefixed");
assert.strictEqual(stories[0].towerPostId, POST, "bare Tower uuid kept");
assert.strictEqual(stories[0].authorProfileId, AUTHOR, "author profile id kept");
times.appendPostEl(stories[0], { lead: true });
var article = feedList.children.filter(function (c) { return c.hasAttribute("data-news-post"); })[0];
assert.ok(article, "story printed");
assert.strictEqual(article.getAttribute("data-post-id"), "from-tower-personal-" + POST);
assert.strictEqual(article.getAttribute("data-tower-post-id"), POST);
assert.strictEqual(article.getAttribute("data-author-profile-id"), AUTHOR);
["harmful\">Harmful<", "untruthful\">Untruthful<", "misrated\">Not right for my age<", "data-news-report-block>Block<"].forEach(function (bit) {
  assert.ok(article.innerHTML.indexOf(bit) >= 0, "person's post keeps the full menu: " + bit);
});

/* --- 2. Click a reason: real stub + content-report + moderation ---------- */
function storyFrom(printed) {
  var panel = new El("section", { id: "panel-signal" });
  var attrs = {};
  ["data-news-post", "data-post-id", "data-news-story-key", "data-tower-post-id", "data-author-profile-id"].forEach(function (k) {
    if (printed.hasAttribute(k)) attrs[k] = printed.getAttribute(k);
  });
  var a = panel.appendChild(new El("article", attrs));
  var body = a.appendChild(new El("p", { class: "commune-feed-body" })); body.textContent = "this is kidna lame with no friends";
  var bar = a.appendChild(new El("footer", { "data-news-report": "" }));
  var toggle = bar.appendChild(new El("button", { "data-news-report-toggle": "" }));
  var menu = bar.appendChild(new El("div", { "data-news-report-menu": "" })); menu.hidden = true;
  var opts = {};
  ["harmful", "untruthful", "misrated"].forEach(function (r) { opts[r] = menu.appendChild(new El("button", { "data-news-report-reason": r })); });
  var status = bar.appendChild(new El("span", { "data-news-report-status": "" })); status.hidden = true;
  return { panel: panel, article: a, toggle: toggle, menu: menu, opts: opts, status: status };
}
function load(dom, rpc, myProfiles) {
  var store = {};
  var warned = [];
  var sb = {
    Promise: Promise, Date: Date, JSON: JSON, setTimeout: setTimeout,
    console: { warn: function () { warned.push([].slice.call(arguments).join(" ")); }, log: function () {} },
    localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    fetch: function () { return Promise.resolve({ ok: true, json: function () { return {}; } }); },
    CognationSupabase: { configured: function () { return true; }, rpc: rpc },
    CognationSupabaseSocial: { getMyProfiles: function () { return myProfiles || [{ id: ME }]; } },
    document: {
      readyState: "complete",
      getElementById: function (id) { return id === "panel-signal" ? dom.panel : null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      dispatchEvent: function () {},
    },
  };
  sb.window = sb;
  vm.runInNewContext(src("content-report.js") + "\n" + src("moderation.js") + "\n" + src("news-report-stub.js"), sb);
  return { warned: warned };
}
function click(dom, el) { dom.panel.listeners.click.forEach(function (f) { f({ target: el, preventDefault: function () {} }); }); }
function rejectWith(message) {
  return function () { var e = new Error(message); e.status = 400; e.body = { code: "P0001", message: message }; return Promise.reject(e); };
}

async function acceptedSendsBareUuid() {
  var calls = [];
  var dom = storyFrom(article);
  load(dom, function (name, args) { calls.push({ name: name, args: args }); return Promise.resolve({ report_id: "r", hidden_post: true }); });
  click(dom, dom.toggle);
  click(dom, dom.opts.harmful);
  assert.strictEqual(calls.length, 1, "one server call");
  assert.strictEqual(calls[0].name, "report_tower_post");
  assert.strictEqual(calls[0].args.post_id, POST, "bare tower_posts uuid, not the from-tower- display id");
  assert.ok(/^[0-9a-f-]{36}$/.test(calls[0].args.post_id));
  assert.strictEqual(calls[0].args.reason, "harmful");
  await tick();
  assert.strictEqual(dom.status.textContent, "Reported: Harmful. Hidden for you.");
  assert.strictEqual(dom.article.getAttribute("data-news-reported-hidden"), "true");
}

async function ownPostNoServerCall() {
  var calls = 0;
  var dom = storyFrom(article);
  /* Reader is signed in on their Pro profile; the post is from their personal one. */
  load(dom, function () { calls++; return Promise.resolve({}); }, [{ id: ME_PRO }, { id: AUTHOR }]);
  click(dom, dom.toggle);
  click(dom, dom.opts.untruthful);
  await tick();
  assert.strictEqual(calls, 0, "own post: no report_tower_post call");
  assert.strictEqual(dom.status.textContent, "This is your own post, so it can't be reported.");
  assert.notStrictEqual(dom.article.getAttribute("data-news-reported-hidden"), "true", "own post stays");
  assert.strictEqual(dom.menu.hidden, false, "menu stays open");
}

async function serverRefusalsInPlainWords() {
  var cases = [
    ["cannot_report_own", "This is your own post, so it can't be reported."],
    ["post_not_found", "This post was taken down, so there's nothing to report."],
    ["report_suspended", "Reporting is paused on your account."],
    ["Sign in first", "Sign in to report."],
    ["Supabase request failed.", "Couldn't send report, try again"],
  ];
  for (var i = 0; i < cases.length; i++) {
    var dom = storyFrom(article);
    var t = load(dom, rejectWith(cases[i][0]));
    click(dom, dom.toggle);
    click(dom, dom.opts.misrated);
    await tick();
    assert.strictEqual(dom.status.textContent, cases[i][1], cases[i][0]);
    assert.ok(dom.status.hasAttribute("data-news-report-failed"), "failed styling hook kept");
    assert.strictEqual(dom.menu.hidden, false, "options kept for retry");
    assert.strictEqual(dom.opts.misrated.disabled, false, "options re-enabled");
    assert.notStrictEqual(dom.article.getAttribute("data-news-reported-hidden"), "true", "not hidden when not filed");
    assert.strictEqual(t.warned.length, 1, "one console line with the server code");
    assert.ok(t.warned[0].indexOf(cases[i][0].toLowerCase().slice(0, 20)) >= 0);
    assert.ok(t.warned[0].indexOf(POST) < 0 && t.warned[0].indexOf("@") < 0, "no ids or addresses in the log");
  }
}

(async function () {
  await acceptedSendsBareUuid();
  await ownPostNoServerCall();
  await serverRefusalsInPlainWords();
  console.log("times-report-real-id: ok");
})().catch(function (e) { console.error(e); process.exit(1); });
