/**
 * Times reports reach the server (cream follow-up 2, Oct 21).
 * - A Times story prints under a display id ("from-tower-personal-<uuid>", or a
 *   "statewide-refresh-…" copy). The story Report sends the real Tower post id
 *   to report_tower_post (-> public.content_reports), whose post_id is a uuid.
 * - "Reported: <option>. Hidden for you." shows only after the server accepts;
 *   a failure shows "Couldn't send report, try again" and keeps the options.
 * - A comment Report POSTs the comment's own uuid to news_comment_reports.
 * Runs the real news-report-stub.js, content-report.js, moderation.js,
 * news-comments.js and commune.js appendPostEl.
 * Run: node js/times-report-server.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
function src(f) { return fs.readFileSync(path.join(__dirname, f), "utf8"); }
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

var UUID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
var CID = "11111111-1111-4111-8111-111111111111";

/* --- tiny DOM ------------------------------------------------------------ */
function El(tag, attrs) {
  this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.children = []; this.parentNode = null;
  this.hidden = false; this.disabled = false; this.textContent = ""; this.style = {}; this.id = ""; this.listeners = {};
  this.className = "";
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

/* --- 1. commune.js appendPostEl puts the real Tower id on the story -------- */
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
var feedList = new El("div");
global.window = global;
global.document = { createElement: function (t) { return new El(t); }, querySelectorAll: function () { return []; }, addEventListener: function () {} };
window.CognationNewsComments = { mount: function () {} };
var appendPostEl = new Function("feedList", "escapeHtml", "formatTime", "env",
  "var editionId = env.editionId;\n" + fnSource("appendPostEl") + "\nreturn appendPostEl;")(
  feedList, function (s) { return String(s == null ? "" : s); }, function () { return "now"; }, { editionId: "statewide" });
appendPostEl({ id: "from-tower-personal-" + UUID, towerPostId: UUID, authorName: "Ada", body: "b", createdAt: "2026-10-21T12:00:00Z" });
appendPostEl({ id: "statewide-refresh-1-0", sourceId: "from-tower-pro-" + UUID, towerPostId: UUID, authorName: "Ada", body: "b", createdAt: "2026-10-21T12:00:00Z" });
var printed = feedList.children.filter(function (c) { return c.hasAttribute("data-news-post"); });
assert.strictEqual(printed[0].getAttribute("data-post-id"), "from-tower-personal-" + UUID, "display id unchanged (comments key off it)");
assert.strictEqual(printed[0].getAttribute("data-tower-post-id"), UUID, "story carries the real Tower post id");
assert.strictEqual(printed[1].getAttribute("data-tower-post-id"), UUID, "a Statewide Refresh copy too");
assert.ok(/towerPostId: p\.id/.test(fnSource("postsFromTower")), "postsFromTower keeps the Tower id");

/* --- 2. Story Report: real stub + real content-report + real moderation ---- */
function storyDom(attrs) {
  var panel = new El("section", { id: "panel-signal" });
  var article = panel.appendChild(new El("article", Object.assign({ "data-news-post": "" }, attrs)));
  var body = article.appendChild(new El("p", { class: "commune-feed-body" })); body.textContent = "Story body";
  var bar = article.appendChild(new El("footer", { "data-news-report": "" }));
  var toggle = bar.appendChild(new El("button", { "data-news-report-toggle": "" }));
  var menu = bar.appendChild(new El("div", { "data-news-report-menu": "" })); menu.hidden = true;
  var opts = {};
  ["harmful", "untruthful", "misrated"].forEach(function (r) { opts[r] = menu.appendChild(new El("button", { "data-news-report-reason": r })); });
  var status = bar.appendChild(new El("span", { "data-news-report-status": "" })); status.hidden = true;
  return { panel: panel, article: article, toggle: toggle, menu: menu, opts: opts, status: status };
}
function loadStory(dom, rpc) {
  var store = {};
  var events = [];
  var sb = {
    console: console, Promise: Promise, Date: Date, JSON: JSON, setTimeout: setTimeout,
    localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    fetch: function () { return Promise.resolve({ ok: true, json: function () { return {}; } }); },
    CognationSupabase: { configured: function () { return true; }, rpc: rpc },
    document: {
      readyState: "complete",
      getElementById: function (id) { return id === "panel-signal" ? dom.panel : null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      dispatchEvent: function (e) { events.push(e); },
    },
  };
  sb.window = sb;
  vm.runInNewContext(src("content-report.js") + "\n" + src("moderation.js") + "\n" + src("news-report-stub.js"), sb);
  return { sb: sb, store: store, events: events };
}
function click(dom, el) { dom.panel.listeners.click.forEach(function (f) { f({ target: el, preventDefault: function () {} }); }); }

function testStoryReportHitsServer() {
  var calls = [];
  var dom = storyDom({ "data-post-id": "from-tower-personal-" + UUID, "data-news-story-key": "from-tower-personal-" + UUID, "data-tower-post-id": UUID });
  var t = loadStory(dom, function (name, args) { calls.push({ name: name, args: args }); return Promise.resolve("report-id"); });
  click(dom, dom.toggle);
  assert.strictEqual(dom.menu.hidden, false, "Report opens the menu");
  click(dom, dom.opts.misrated);
  assert.notStrictEqual(dom.status.textContent.indexOf("Reported"), 0, "no 'Reported' before the server answers");
  assert.strictEqual(dom.status.textContent, "Sending report…");
  assert.strictEqual(calls.length, 1, "one server call");
  assert.strictEqual(calls[0].name, "report_tower_post", "story report -> report_tower_post (content_reports)");
  assert.strictEqual(calls[0].args.post_id, UUID, "with the real Tower post id, not the from-tower- display id");
  assert.strictEqual(calls[0].args.reason, "misrated");
  assert.strictEqual(calls[0].args.note, "User report: Not right for my age");
  return tick().then(function () {
    assert.strictEqual(dom.status.textContent, "Reported: Not right for my age. Hidden for you.", "Reported only after success");
    assert.strictEqual(dom.status.hidden, false);
    assert.strictEqual(dom.menu.hidden, true, "menu closes");
    assert.strictEqual(dom.article.getAttribute("data-news-reported-hidden"), "true", "story hidden for you (collapsed to its report line)");
    assert.strictEqual(calls.length, 1, "moderation queue does not file a second server report");
    var q = JSON.parse(t.store[Object.keys(t.store).filter(function (k) { return /moderation/i.test(k); })[0]] || "[]");
    assert.ok(Array.isArray(q) ? q.length >= 1 : true, "remembered on this device so it stays hidden");
  });
}

function testRefreshCopyAndPrefixFallback() {
  var calls = [];
  /* No data-tower-post-id: the uuid comes off the from-tower-<kind>- story key. */
  var dom = storyDom({ "data-post-id": "statewide-refresh-3-1", "data-news-story-key": "from-tower-pro-" + UUID });
  loadStory(dom, function (name, args) { calls.push(args); return Promise.resolve("r"); });
  click(dom, dom.opts.harmful);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].post_id, UUID, "prefix stripped for a Refresh copy");
  return tick().then(function () {
    assert.strictEqual(dom.status.textContent, "Reported: Harmful. Hidden for you.");
  });
}

function testStoryFailureIsHonest() {
  var calls = 0;
  var dom = storyDom({ "data-post-id": "from-tower-personal-" + UUID, "data-tower-post-id": UUID });
  var mode = "fail";
  loadStory(dom, function () { calls++; return mode === "fail" ? Promise.reject(new Error("HTTP 500")) : Promise.resolve("r"); });
  click(dom, dom.toggle);
  click(dom, dom.opts.untruthful);
  return tick().then(function () {
    assert.strictEqual(dom.status.textContent, "Couldn't send report, try again", "failure: Couldn't-send text");
    assert.strictEqual(dom.status.textContent.indexOf("Reported"), -1, "never says Reported");
    assert.strictEqual(dom.article.hasAttribute("data-news-reported-hidden"), false, "story stays so you can retry");
    assert.strictEqual(dom.menu.hidden, false, "options stay open");
    assert.strictEqual(dom.opts.untruthful.disabled, false, "option can be tried again");
    assert.ok(dom.status.hasAttribute("data-news-report-failed"), "failure line carries the styling hook");
    mode = "ok";
    click(dom, dom.opts.untruthful);
    return tick();
  }).then(function () {
    assert.strictEqual(calls, 2, "retry sends again");
    assert.strictEqual(dom.status.textContent, "Reported: Untruthful. Hidden for you.", "retry success -> Reported");
    assert.ok(!dom.status.hasAttribute("data-news-report-failed"), "hook cleared once it is sent");
  });
}

function testNoServerIdOrSignedOut() {
  var calls = 0;
  var dom = storyDom({ "data-post-id": "news-1700000000000-abcde" });
  loadStory(dom, function () { calls++; return Promise.resolve("r"); });
  click(dom, dom.opts.harmful);
  return tick().then(function () {
    assert.strictEqual(calls, 0, "no uuid -> nothing sent with a fake id");
    assert.strictEqual(dom.status.textContent, "Couldn't send report, try again");
    var dom2 = storyDom({ "data-post-id": "from-tower-personal-" + UUID, "data-tower-post-id": UUID });
    var t2 = loadStory(dom2, function () { calls++; return Promise.resolve("r"); });
    t2.sb.CognationSupabase.configured = function () { return false; };
    click(dom2, dom2.opts.harmful);
    return tick().then(function () {
      assert.strictEqual(calls, 0);
      assert.strictEqual(dom2.status.textContent, "Couldn't send report, try again", "Supabase off -> Couldn't send");
    });
  });
}

/* --- 3. Comment Report: real news-comments.js ------------------------------ */
function testCommentReportHitsServer() {
  var posts = [];
  var mode = "ok";
  var rest = function (table, opts) {
    opts = opts || {};
    if (table === "news_story_comments") {
      return Promise.resolve([{ id: CID, story_id: "from-tower-personal-" + UUID, body: "Comment", created_at: "2026-10-21T15:00:00.000Z", author: { display_name: "Luna", account_kind: "real" }, reactions: [] }]);
    }
    if (table === "news_comment_reports" && opts.method === "POST") {
      posts.push({ table: table, body: JSON.parse(JSON.stringify(opts.body)) });
      return mode === "fail" ? Promise.reject(new Error("HTTP 500")) : Promise.resolve([{}]);
    }
    return Promise.resolve([]);
  };
  var host = { attrs: {}, listeners: {}, _html: "" };
  host.setAttribute = function (k, v) { host.attrs[k] = v; };
  host.getAttribute = function (k) { return host.attrs[k] == null ? null : host.attrs[k]; };
  host.addEventListener = function (n, fn) { (host.listeners[n] = host.listeners[n] || []).push(fn); };
  host.contains = function () { return true; };
  host.querySelector = function () { return null; };
  Object.defineProperty(host, "innerHTML", { get: function () { return host._html; }, set: function (v) { host._html = v; } });
  var article = { attrs: { "data-post-id": "from-tower-personal-" + UUID }, getAttribute: function (k) { return this.attrs[k] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; }, querySelector: function () { return host; }, appendChild: function (c) { return c; } };
  var w = {
    CognationSupabase: { configured: function () { return true; }, rest: rest },
    CognationAuth: { getSession: function () { return { activeProfileId: "p-ada", profileDisplayName: "Ada", accountKind: "real" }; } },
  };
  var doc = {
    createElement: function (tag) { return { tagName: tag, className: "", textContent: "", attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } }; },
    querySelectorAll: function () { return []; }, addEventListener: function () {},
  };
  var d = {};
  var ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
  ls.setItem("cognation.member.profile.v1", JSON.stringify({ age: 28 }));
  vm.runInNewContext(src("age-floor-keywords.js") + "\n" + src("news-comments.js"), { window: w, document: doc, localStorage: ls, Date: Date, Math: Math, Promise: Promise, encodeURIComponent: encodeURIComponent });
  w.CognationNewsComments.mount(article, { id: "from-tower-personal-" + UUID, rating: "G" });
  var lines = [];
  var item = { querySelector: function (sel) { return sel === "[data-news-comment-report-error]" ? lines[0] || null : null; },
    appendChild: function (el) { el.remove = function () { lines.splice(lines.indexOf(el), 1); }; lines.push(el); return el; } };
  var btn = { disabled: false, getAttribute: function (k) { return k === "data-comment-id" ? CID : null; },
    closest: function (sel) { if (sel === "[data-news-comment-report]") return btn; if (sel === ".news-comment-item") return item; return null; } };
  function fire() { host.listeners.click.forEach(function (fn) { fn({ target: btn, preventDefault: function () {} }); }); }
  return tick().then(function () {
    mode = "fail";
    fire();
    return tick();
  }).then(function () {
    assert.strictEqual(posts.length, 1);
    assert.strictEqual(posts[0].table, "news_comment_reports", "comment report -> news_comment_reports");
    assert.deepStrictEqual(posts[0].body, { comment_id: CID, reporter_profile_id: "p-ada" }, "with the comment's real uuid");
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].textContent, "Couldn't send report, try again", "comment failure: Couldn't-send text");
    assert.strictEqual(host.innerHTML.indexOf("data-news-comment-reported>Reported"), -1, "no Reported on failure");
    assert.strictEqual(btn.disabled, false, "Report can be tried again");
    mode = "ok";
    fire();
    return tick();
  }).then(function () {
    assert.strictEqual(posts.length, 2, "retry sends again");
    assert.strictEqual(lines.length, 0, "error line cleared");
    assert.ok(host.innerHTML.indexOf("disabled data-news-comment-reported>Reported</button>") > 0, "Reported only after the server accepted");
  });
}

/* --- 4. Status copy ----------------------------------------------------------- */
var stub = src("news-report-stub.js");
assert.ok(stub.indexOf("Demo / local only") < 0 && stub.indexOf("browser only") < 0, "no Demo / local only line");

/* --- 5. 390 dateline: no stray rule after "Cognation" when the date wraps ---- */
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
assert.ok(/@media \(max-width:600px\)\{[^@]*\.paper-dateline > \.paper-rule:has\(\+ \.paper-date\)\{display:none !important\}[^@]*\.paper-date\{flex-basis:100% !important;text-align:left !important\}/.test(css),
  "narrow dateline: date on its own line, trailing rule hidden");
assert.ok(/\[data-news-reported-hidden\] > :not\(\[data-news-report\]\)\{display:none !important\}/.test(css), "reported story collapses to its report line");

testStoryReportHitsServer()
  .then(testRefreshCopyAndPrefixFallback)
  .then(testStoryFailureIsHonest)
  .then(testNoServerIdOrSignedOut)
  .then(testCommentReportHitsServer)
  .then(function () { console.log("times-report-server.test.js ok"); })
  .catch(function (e) { console.error(e); process.exit(1); });
