/**
 * TOWER Feed: every seed / ops post carries the shared SeedOps Demo badge
 * (js/seedops-badge.js markup, same as the Times byline); real members never do.
 * Runs the real tower.js renderFeed (+ towerPostSeedBadge), real seedops-schema.js,
 * seedops-badge.js and seedops-tower-posts.js buildPost (the posts SeedOps found
 * signed out: "Jess", "Jay", "Jamie"…).
 * Run: node js/tower-seed-demo-badge.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var tower = src("js/tower.js");

function el(tag) {
  return {
    tagName: tag.toUpperCase(), children: [], attrs: {}, innerHTML: "", className: "",
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    appendChild: function (c) { this.children.push(c); return c; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, remove: function () {}, removeAttribute: function () {},
  };
}
var doc = {
  readyState: "complete", addEventListener: function () {}, dispatchEvent: function () { return true; },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  createElement: el,
};
var win = { document: doc, localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }, CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; } };
win.window = win;
var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, CustomEvent: win.CustomEvent, console: console, Date: Date, JSON: JSON, Math: Math });
vm.runInContext(src("js/seedops-schema.js"), ctx);
vm.runInContext(src("js/seedops-badge.js"), ctx);
vm.runInContext(src("js/seedops-tower-posts.js"), ctx);
var Badge = win.CognationSeedOpsBadge;
var Posts = win.CognationSeedOpsTowerPosts;
assert.ok(Badge && Posts && win.CognationSeedOps, "SeedOps modules load");

function fnSource(name) {
  var start = tower.indexOf("function " + name + "(");
  if (start < 0) return "";
  var depth = 0, i = tower.indexOf("{", start);
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
var renderSrc = fnSource("renderFeed");
assert.ok(renderSrc, "tower.js renderFeed exists");
var badgeSrc = fnSource("towerPostSeedBadge") || "function towerPostSeedBadge() { return ''; }";

var list = el("div");
var state = { posts: [] };
var renderFeed = new Function("window", "document", "list", "state", [
  "function towerFeedQuery() { return list; }",
  "function viewerUnder13() { return false; }",
  "function towerPostVisibleToViewer() { return true; }",
  "var TowerStore = { list: function () { return state.posts.slice(); } };",
  "function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }",
  "function formatTime() { return 'Oct 1, 9:39 AM'; }",
  "function renderAttachments() { return ''; }",
  "function buildTowerPostReactBar() { return document.createElement('div'); }",
  badgeSrc, renderSrc, "return renderFeed;",
].join("\n"))(win, doc, list, state);

/* The posts SeedOps saw signed out: built client-side by seedops-tower-posts.js. */
var seeds = [];
for (var n = 1; n <= 40; n++) {
  var id = "seed-" + ("000" + n).slice(-4);
  var post = Posts.buildPost(id, {});
  assert.ok(post && post.isSeed && post.accountKind === "seed", id + ": SeedOps builds a seed post");
  seeds.push(post);
}
var real = [
  { id: "t-real-1", authorName: "Dana", authorProfileId: "prof-dana", handle: "dana", body: "Real member post.", createdAt: "2026-10-20T12:00:00Z" },
  { id: "post-r2", _remote: true, authorName: "Lee", authorProfileId: "4f1c-uuid", handle: "lee", body: "Server post.", createdAt: "2026-10-20T11:00:00Z" },
  { id: "t-real-3", authorName: "Sky", seeded: true, body: "A post with the generic seeded flag but a real author.", createdAt: "2026-10-20T10:00:00Z" },
];
var ops = { id: "ops-1", authorName: "Ops bot", accountKind: "ops", isOpsBot: true, body: "Ops check.", createdAt: "2026-10-20T09:00:00Z" };
state.posts = seeds.concat(real, [ops]);
renderFeed({});

var articles = list.children;
assert.strictEqual(articles.length, 44, "every post renders (no seed post removed or hidden)");
var badgeHtmlSeed = Badge.badgeHtml({ accountKind: "seed", isSeed: true });
assert.ok(/class="seedops-demo-badge"/.test(badgeHtmlSeed) && /Demo · seed/.test(badgeHtmlSeed), "shared badge markup");
function author(a) { var m = /<span class="tower-author">([\s\S]*?)<\/span><time/.exec(a.innerHTML); return m ? m[1] : ""; }
articles.slice(0, 40).forEach(function (a, i) {
  var who = author(a);
  assert.ok(who.indexOf(seeds[i].authorName) === 0, "seed post " + (i + 1) + ": name first");
  assert.ok(who.indexOf(badgeHtmlSeed) > 0, "seed post " + (i + 1) + " (" + seeds[i].authorName + ") carries the Demo · seed badge");
  assert.strictEqual((a.innerHTML.match(/seedops-demo-badge/g) || []).length, 1, "seed post " + (i + 1) + ": exactly one badge");
});
articles.slice(40, 43).forEach(function (a, i) {
  assert.ok(a.innerHTML.indexOf("seedops-demo-badge") === -1, "real post " + real[i].id + ": no badge");
});
assert.ok(author(articles[43]).indexOf("Ops · demo") > 0 && /data-account-kind="ops"/.test(articles[43].innerHTML), "ops post carries the Ops · demo badge");

/* Badge module missing: the feed still renders, just without badges. */
var saved = win.CognationSeedOpsBadge; delete win.CognationSeedOpsBadge;
list.children = []; renderFeed({});
assert.strictEqual(list.children.length, 44, "no badge module: feed still renders");
win.CognationSeedOpsBadge = saved;

/* No new CSS: the existing global rule styles it. */
assert.ok(/\.seedops-demo-badge \{/.test(src("css/styles.css")), "existing badge style");
console.log("tower-seed-demo-badge.test.js ok");
