/**
 * News comments: for an under-13 viewer (unknown age counts as under-13), a
 * comment whose text trips the age-floor keyword test shows "Hidden for your
 * age group" instead of its text and has no react buttons. 13+ sees it as today.
 * Run: node js/news-comments-hide-flagged-u13.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var code = src("js/news-comments.js");

function mem(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
var COMMENTS = [
  { id: "c1", storyId: "s1", authorName: "Rowan", accountKind: "seed", body: "Great news for students.", createdAt: "2026-10-07T15:00:00.000Z", reactions: { "👍": ["p2"] } },
  { id: "c2", storyId: "s1", authorName: "Member", accountKind: "real", body: "This trailer is NSFW honestly", createdAt: "2026-10-07T15:01:00.000Z", reactions: { "❤️": ["p3"] } },
  { id: "c3", storyId: "s1", authorName: "Ada", accountKind: "seed", body: "Saturday evenings work for me.", createdAt: "2026-10-07T15:02:00.000Z", reactions: {} },
];
function render(age) {
  var seed = { "cognation.news.comments.v1": JSON.stringify({ byStory: { s1: COMMENTS } }) };
  if (age != null) seed["cognation.member.profile.v1"] = JSON.stringify({ age: age });
  var w = {};
  vm.runInNewContext(code, { window: w, localStorage: mem(seed), Date: Date, Math: Math });
  var article = {
    attrs: { "data-post-id": "s1", "data-news-rating": "G-PG" }, kids: [],
    getAttribute: function (k) { return this.attrs[k] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    querySelector: function () { return this.kids[0] || null; },
    appendChild: function (c) { this.kids.push(c); return c; },
  };
  /* no Supabase -> local render path, synchronous */
  var ctxDoc = {
    createElement: function () {
      return { hidden: false, innerHTML: "", attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, addEventListener: function () {} };
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
  };
  var w2 = {};
  vm.runInNewContext(code, { window: w2, document: ctxDoc, localStorage: mem(seed), Date: Date, Math: Math });
  var host = w2.CognationNewsComments.mount(article, { id: "s1", rating: "G-PG" });
  assert.strictEqual(host.hidden, false, "G-PG thread visible");
  return { html: host.innerHTML, api: w2.CognationNewsComments };
}
function item(html, id) {
  var start = html.indexOf('data-comment-id="' + id + '"');
  assert.ok(start !== -1, "row " + id + " rendered");
  var li = html.lastIndexOf("<li", start);
  return html.slice(li, html.indexOf("</li>", start) + 5);
}
function reacts(row) { return (row.match(/data-news-comment-react=/g) || []).length; }

[["under-13 (age 11)", 11], ["unknown age", null]].forEach(function (pair) {
  var r = render(pair[1]);
  var hidden = item(r.html, "c2");
  assert.ok(hidden.indexOf("Hidden for your age group") !== -1, pair[0] + ": hidden line shown");
  assert.ok(hidden.indexOf("NSFW") === -1 && hidden.indexOf("trailer") === -1, pair[0] + ": original text not in the DOM");
  assert.ok(/class="news-comment-body news-comment-body--hidden"/.test(hidden), pair[0] + ": muted italic class");
  assert.strictEqual(reacts(hidden), 0, pair[0] + ": no react buttons on the hidden comment");
  assert.ok(hidden.indexOf('<span class="news-comment-author">Member</span>') !== -1, pair[0] + ": author line kept");
  /* clean comments unaffected */
  var c1 = item(r.html, "c1"), c3 = item(r.html, "c3");
  assert.ok(c1.indexOf("Great news for students.") !== -1 && reacts(c1) === 5, pair[0] + ": clean c1 unchanged");
  assert.ok(c1.indexOf("seedops-demo-badge") !== -1, pair[0] + ": badge kept on clean rows");
  assert.ok(c3.indexOf("Saturday evenings work for me.") !== -1 && reacts(c3) === 5, pair[0] + ": clean c3 unchanged");
  assert.ok(r.html.indexOf("data-news-comment-form") !== -1, pair[0] + ": composer still there");
});

[13, 28].forEach(function (a) {
  var r = render(a);
  var row = item(r.html, "c2");
  assert.ok(row.indexOf("This trailer is NSFW honestly") !== -1, a + ": 13+ sees the original text");
  assert.ok(row.indexOf("Hidden for your age group") === -1, a + ": no hidden line for 13+");
  assert.strictEqual(reacts(row), 5, a + ": 13+ keeps the react buttons");
});

/* Same keyword test as Tower/News age floor. */
var flagRe = /\b(21\+|nsfw|explicit)\b/i;
assert.ok(src("js/tower.js").indexOf(String(flagRe)) !== -1, "fixture: tower.js uses the same regex");
assert.ok(code.indexOf("var AGE_FLAG_RE = " + String(flagRe) + ";") !== -1, "news-comments shares the same regex");

/* CSS: italic + existing muted token, nothing new. */
var css = src("css/styles.css");
assert.ok(/\.news-comment-body--hidden \{ font-style: italic; color: var\(--cgn-text-muted\); \}/.test(css), "muted italic style uses --cgn-text-muted");
assert.ok(/--cgn-text-muted: rgba\(232, 240, 255, 0\.66\);/.test(css), "fixture: token exists");

console.log("news-comments-hide-flagged-u13.test.js: ok");
