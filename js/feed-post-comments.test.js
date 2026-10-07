/**
 * Comments on SIGNAL Feed posts: the News comments module (same look) on
 * tower_post_comments / tower_post_comment_reports (batch 06).
 * - Server Feed posts (uuid ids) only; signed-in viewers only.
 * - One level, oldest first, latest 20, text only (no reactions table), same
 *   composer/Post and ⋯ Report; seeds keep the Demo badge.
 * - No looser client path: comments come only from RLS (posts the viewer can
 *   see); keyword-flagged text stays hidden for under-13 viewers.
 * Run: node js/feed-post-comments.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var code = fs.readFileSync(path.join(root, "js", "age-floor-keywords.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(root, "js", "news-comments.js"), "utf8");

var POST = "33333333-3333-4333-8333-333333333333";
var C1 = "11111111-1111-4111-8111-111111111111";
var C2 = "22222222-2222-4222-8222-222222222222";
function mem() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

function server() {
  var srv = { calls: [], posts: [], reports: [] };
  srv.rest = function (table, opts) {
    opts = opts || {};
    srv.calls.push({ table: table, method: opts.method || "GET", query: opts.query || "" });
    if (table === "tower_post_comments" && opts.method === "POST") { srv.posts.push(JSON.parse(JSON.stringify(opts.body))); return Promise.resolve([{}]); }
    if (table === "tower_post_comments") {
      return Promise.resolve([
        { id: C2, post_id: POST, body: "Second, see you at 18+ night", created_at: "2026-10-07T15:02:00.000Z", author: { display_name: "Ada", account_kind: "seed" } },
        { id: C1, post_id: POST, body: "First", created_at: "2026-10-07T15:01:00.000Z", author: { display_name: "Luna", account_kind: "real" } },
      ]);
    }
    if (table === "tower_post_comment_reports" && opts.method === "POST") { srv.reports.push(JSON.parse(JSON.stringify(opts.body))); return Promise.resolve([{}]); }
    return Promise.resolve([]);
  };
  return srv;
}

function setup(srv, session, age, postId) {
  var host = { attrs: {}, listeners: {}, _html: "", hidden: false };
  host.setAttribute = function (k, v) { host.attrs[k] = v; };
  host.getAttribute = function (k) { return host.attrs[k] == null ? null : host.attrs[k]; };
  host.addEventListener = function (n, fn) { (host.listeners[n] = host.listeners[n] || []).push(fn); };
  host.contains = function () { return true; };
  host.querySelector = function () { return null; };
  Object.defineProperty(host, "innerHTML", { get: function () { return host._html; }, set: function (v) { host._html = v; } });
  var appended = [];
  var article = { attrs: { "data-tower-post": postId }, getAttribute: function (k) { return this.attrs[k] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; }, querySelector: function () { return appended[0] || null; },
    appendChild: function (c) { appended.push(c); return c; } };
  var w = {
    CognationSupabase: { configured: function () { return true; }, rest: srv.rest },
    CognationAuth: { getSession: function () { return session; } },
  };
  var doc = {
    createElement: function () { return host; },
    querySelectorAll: function () { return []; }, addEventListener: function () {},
  };
  var ls = mem();
  if (age != null) ls.setItem("cognation.member.profile.v1", JSON.stringify({ age: age, ownerUserId: "u-alex" }));
  vm.runInNewContext(code, { window: w, document: doc, localStorage: ls, Date: Date, Math: Math, Promise: Promise, encodeURIComponent: encodeURIComponent });
  var mounted = w.CognationFeedComments.mount(article, { id: postId });
  return { host: host, api: w.CognationFeedComments, news: w.CognationNewsComments, mounted: mounted };
}
var ALEX = { source: "supabase", supabaseUserId: "u-alex", activeProfileId: "p-alex", profileDisplayName: "Alex", accountKind: "real" };

function testSignedInThread() {
  var srv = server();
  var t = setup(srv, ALEX, 30, POST);
  return tick().then(function () {
    var get = srv.calls.filter(function (c) { return c.table === "tower_post_comments"; })[0];
    assert.ok(get, "reads tower_post_comments");
    assert.ok(get.query.indexOf("post_id=eq." + POST) !== -1 && /limit=20/.test(get.query), "this post, latest 20");
    assert.ok(get.query.indexOf("reactions") === -1, "no reactions (no table in batch 06)");
    assert.ok(srv.calls.some(function (c) { return c.table === "tower_post_comment_reports" && c.query.indexOf("reporter_profile_id=eq.p-alex") !== -1; }), "your own Feed reports");
    assert.ok(!srv.calls.some(function (c) { return /^news_/.test(c.table); }), "never touches the News tables");
    var html = t.host.innerHTML;
    assert.strictEqual(t.host.hidden, false);
    assert.ok(html.indexOf("First") < html.indexOf("Second"), "oldest first");
    assert.ok(html.indexOf('Ada <span class="seedops-demo-badge" role="status" data-account-kind="seed">Demo · seed</span>') !== -1, "seed keeps the Demo badge");
    assert.ok(html.indexOf("news-comment-react-chip") === -1, "text only");
    assert.ok(html.indexOf('class="news-comment-more"') !== -1 && html.indexOf(">Report</button>") !== -1, "same ⋯ Report");
    assert.ok(html.indexOf('class="btn btn-secondary news-comment-submit">Post</button>') !== -1, "same composer and Post");
    return t.api.publishComment({ storyId: POST, body: "Nice", clientId: "44444444-4444-4444-8444-444444444444" });
  }).then(function (res) {
    assert.ok(res.ok);
    assert.deepStrictEqual(srv.posts, [{ author_profile_id: "p-alex", body: "Nice", post_id: POST, id: "44444444-4444-4444-8444-444444444444" }], "batch 06 columns");
    return t.api.reportComment(POST, C2);
  }).then(function (res) {
    assert.ok(res.ok);
    assert.deepStrictEqual(srv.reports, [{ comment_id: C2, reporter_profile_id: "p-alex" }], "Feed reports table");
  });
}

function testSignedOutHidden() {
  var srv = server();
  var t = setup(srv, null, 30, POST);
  return tick().then(function () {
    assert.strictEqual(t.host.hidden, true, "signed out: no thread");
    assert.strictEqual(t.host.innerHTML, "");
    assert.strictEqual(srv.calls.length, 0, "and no requests");
  });
}

function testLocalPostSkipped() {
  var srv = server();
  var t = setup(srv, ALEX, 30, "seed-post-12");
  return tick().then(function () {
    assert.strictEqual(t.mounted, null, "local / seed posts (no server id) get no thread");
    assert.strictEqual(srv.calls.length, 0);
  });
}

function testUnder13() {
  var srv = server();
  var t = setup(srv, ALEX, null, POST);   /* unknown age = under-13 */
  return tick().then(function () {
    var html = t.host.innerHTML;
    assert.strictEqual(t.host.hidden, false, "a post the Feed already showed this viewer keeps its RLS-filtered thread");
    assert.ok(html.indexOf("First") !== -1);
    assert.ok(html.indexOf("18+ night") === -1 && html.indexOf("Hidden for your age group") !== -1, "flagged text hidden for under-13");
  });
}

function testWiring() {
  var tower = fs.readFileSync(path.join(root, "js", "tower.js"), "utf8");
  assert.ok(/list\.appendChild\(article\);\s*\/\*[^*]*\*\/\s*try \{\s*if \(window\.CognationFeedComments && window\.CognationFeedComments\.mount\) \{\s*window\.CognationFeedComments\.mount\(article, \{ id: post\.id \|\| "" \}\);/.test(tower),
    "renderFeed mounts comments under each Feed post");
}

testWiring();
testSignedInThread()
  .then(testSignedOutHidden)
  .then(testLocalPostSkipped)
  .then(testUnder13)
  .then(function () { console.log("feed-post-comments.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
