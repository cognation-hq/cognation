/**
 * News comments (d): ⋯ top-right of each comment opens a menu with Report.
 * Report inserts { comment_id, reporter_profile_id } into news_comment_reports
 * (batch 03: insert as your own profile, one per person per comment, reporters
 * read only their own). Already reported -> "Reported", no request.
 * Failure -> the .commune-status.is-error line. Signed out -> no ⋯.
 * Run: node js/news-comment-report.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var code = fs.readFileSync(path.join(root, "js", "age-floor-keywords.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(root, "js", "news-comments.js"), "utf8");

var C1 = "11111111-1111-4111-8111-111111111111";
var C2 = "22222222-2222-4222-8222-222222222222";
function mem() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

function setup(srv, session) {
  var host = { attrs: {}, listeners: {}, _html: "" };
  host.setAttribute = function (k, v) { host.attrs[k] = v; };
  host.getAttribute = function (k) { return host.attrs[k] == null ? null : host.attrs[k]; };
  host.addEventListener = function (n, fn) { (host.listeners[n] = host.listeners[n] || []).push(fn); };
  host.contains = function () { return true; };
  host.querySelector = function () { return null; };
  Object.defineProperty(host, "innerHTML", { get: function () { return host._html; }, set: function (v) { host._html = v; } });
  host.fire = function (name, target) { (host.listeners[name] || []).forEach(function (fn) { fn({ target: target, preventDefault: function () {} }); }); };
  var article = { attrs: { "data-post-id": "s1" }, getAttribute: function (k) { return this.attrs[k] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; }, querySelector: function () { return host; }, appendChild: function (c) { return c; } };
  var w = {
    CognationSupabase: { configured: function () { return true; }, rest: srv.rest },
    CognationAuth: { getSession: function () { return session; } },
  };
  var doc = {
    createElement: function (tag) { return { tagName: tag, className: "", textContent: "", attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } }; },
    querySelectorAll: function () { return []; }, addEventListener: function () {},
  };
  var ls = mem();
  ls.setItem("cognation.member.profile.v1", JSON.stringify({ age: 28 }));
  vm.runInNewContext(code, { window: w, document: doc, localStorage: ls, Date: Date, Math: Math, Promise: Promise, encodeURIComponent: encodeURIComponent });
  w.CognationNewsComments.mount(article, { id: "s1", rating: "G" });
  return { host: host, api: w.CognationNewsComments };
}

function server() {
  var srv = { reports: [{ comment_id: C2, reporter_profile_id: "p-ada" }], posts: [], mode: "ok", reportQueries: [] };
  srv.rest = function (table, opts) {
    opts = opts || {};
    if (table === "news_story_comments") {
      return Promise.resolve([C1, C2].map(function (id, i) {
        return { id: id, story_id: "s1", body: "Comment " + (i + 1), created_at: "2026-10-07T15:0" + i + ":00.000Z", author: { display_name: "Luna", account_kind: "real" }, reactions: [] };
      }));
    }
    if (table === "news_comment_reports" && opts.method === "POST") {
      srv.posts.push(JSON.parse(JSON.stringify(opts.body)));
      if (srv.mode === "fail") return Promise.reject(new Error("HTTP 500"));
      var dup = srv.reports.some(function (r) { return r.comment_id === opts.body.comment_id && r.reporter_profile_id === opts.body.reporter_profile_id; });
      if (dup || srv.mode === "409") { var e = new Error("409"); e.status = 409; return Promise.reject(e); }
      srv.reports.push(opts.body);
      return Promise.resolve([{}]);
    }
    if (table === "news_comment_reports") {
      srv.reportQueries.push(opts.query);
      /* RLS: only the viewer's own reports come back. */
      return Promise.resolve(srv.reports.filter(function (r) { return opts.query.indexOf("reporter_profile_id=eq." + r.reporter_profile_id) !== -1; })
        .map(function (r) { return { comment_id: r.comment_id }; }));
    }
    return Promise.resolve([]);
  };
  return srv;
}

var ADA = { activeProfileId: "p-ada", profileDisplayName: "Ada", accountKind: "real" };

function count(html, s) { return html.split(s).length - 1; }

function testRenderAndReport() {
  var srv = server();
  var t = setup(srv, ADA);
  return tick().then(function () {
    var html = t.host.innerHTML;
    assert.strictEqual(count(html, "data-news-comment-more"), 2, "a ⋯ on each comment");
    assert.ok(/class="news-comment-more"[^>]*>⋯<\/button><div class="news-report-menu" data-news-comment-menu hidden>/.test(html), "⋯ opens the existing News report menu (hidden until opened)");
    assert.strictEqual(count(html, 'data-news-comment-report data-comment-id="' + C1 + '">Report</button>'), 1, "Report on a comment you haven't reported");
    assert.strictEqual(count(html, "disabled data-news-comment-reported>Reported</button>"), 1, "already reported -> Reported");
    assert.ok(srv.reportQueries[0].indexOf("reporter_profile_id=eq.p-ada") !== -1, "reads only your own reports");
    return t.api.reportComment("s1", C1);
  }).then(function (res) {
    assert.ok(res.ok && !res.already);
    assert.deepStrictEqual(srv.posts, [{ comment_id: C1, reporter_profile_id: "p-ada" }], "inserts comment_id + reporter_profile_id (own profile) only");
    return t.api.reportComment("s1", C1);
  }).then(function (res) {
    assert.ok(res.ok && res.already, "second report is 'Reported'");
    assert.strictEqual(srv.posts.length, 1, "and sends nothing");
    return t.api.reportComment("s1", C2);
  }).then(function (res) {
    assert.ok(res.ok && res.already);
    assert.strictEqual(srv.posts.length, 1, "a comment reported earlier sends nothing");
  });
}

function testConflictCountsAsReported() {
  var srv = server(); srv.reports = []; srv.mode = "409";
  var t = setup(srv, ADA);
  return tick().then(function () { return t.api.reportComment("s1", C1); }).then(function (res) {
    assert.ok(res.ok && res.already, "409 (unique per person per comment) = already reported");
  });
}

function testFailureShowsErrorLine() {
  var srv = server(); srv.reports = []; srv.mode = "fail";
  var t = setup(srv, ADA);
  return tick().then(function () {
    var lines = [];
    var item = { querySelector: function (sel) { return sel === "[data-news-comment-report-error]" ? lines[0] || null : null; },
      appendChild: function (el) { el.remove = function () { lines.splice(lines.indexOf(el), 1); }; lines.push(el); return el; } };
    var btn = { disabled: false, getAttribute: function (k) { return k === "data-comment-id" ? C1 : null; },
      closest: function (sel) { if (sel === "[data-news-comment-report]") return btn; if (sel === ".news-comment-item") return item; return null; } };
    t.host.fire("click", btn);
    assert.strictEqual(btn.disabled, true, "one request at a time");
    return tick().then(function () {
      assert.strictEqual(lines.length, 1, "one error line");
      assert.strictEqual(lines[0].className, "commune-status is-error", "existing News error line style");
      assert.strictEqual(lines[0].textContent, "Couldn't report. Try again.");
      assert.strictEqual(btn.disabled, false, "Report can be tried again");
    });
  });
}

function testMenuToggle() {
  var srv = server();
  var t = setup(srv, ADA);
  return tick().then(function () {
    var menu = { hidden: true };
    var attrs = {};
    var more = { parentNode: { querySelector: function (sel) { return sel === "[data-news-comment-menu]" ? menu : null; } },
      setAttribute: function (k, v) { attrs[k] = v; },
      closest: function (sel) { return sel === "[data-news-comment-more]" ? more : null; } };
    t.host.fire("click", more);
    assert.strictEqual(menu.hidden, false, "⋯ opens the menu");
    assert.strictEqual(attrs["aria-expanded"], "true");
    t.host.fire("click", more);
    assert.strictEqual(menu.hidden, true, "and closes it");
  });
}

function testSignedOutNoButton() {
  var srv = server();
  var t = setup(srv, null);
  return tick().then(function () {
    assert.strictEqual(count(t.host.innerHTML, "data-news-comment-more"), 0, "signed out: no ⋯");
    return t.api.reportComment("s1", C1);
  }).then(function (res) {
    assert.ok(!res.ok);
    assert.strictEqual(srv.posts.length, 0, "signed out never inserts");
  });
}

function testCss() {
  var css = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
  assert.ok(/\.news-comment-more \{[^}]*position: absolute; top: 0; right: 0; width: 22px; height: 22px;[^}]*color: var\(--cgn-text-muted\);/.test(css), "22px ⋯, top-right, muted token");
  assert.ok(/\.news-report-menu \{/.test(css) && /\.commune-status\.is-error \{/.test(css), "existing menu and error styles reused");
}

testCss();
testRenderAndReport()
  .then(testConflictCountsAsReported)
  .then(testFailureShowsErrorLine)
  .then(testMenuToggle)
  .then(testSignedOutNoButton)
  .then(function () { console.log("news-comment-report.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
