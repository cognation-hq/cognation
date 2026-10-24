/* Hidden feed-rating desk: bot-managed, unlinked, ranked by likes, no upload. */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

var page = src("feed-rating.html");
var js = src("js/feed-rating.js");
var html = src("index.html");
var tower = src("js/tower.js");
var commune = src("js/commune.js");
var header = html.slice(0, html.indexOf("</header>"));

assert.ok(/noindex/.test(page), "hidden from search");
assert.ok(!/<input|<textarea|type="file"|upload/i.test(page), "no public upload box");
assert.ok(!/feed-rating/.test(header), "not in the header");
assert.ok(html.indexOf("feed-rating.html") === -1, "no public link");
assert.ok(/COGNATION TIMES/.test(html) && />News</.test(html) && />Feed</.test(html), "newspaper tabs and title stay");
assert.ok(/feedPlate: function \(\) \{[\s\S]*?newsProfessionalPosts\(\)/.test(tower), "plate has both feeds");
assert.ok(/CognationFeedRating[\s\S]*forPaper\(\)/.test(commune), "newspaper reads the desk");
assert.ok(/cognation_is_staff/.test(js) && /This page is not public/.test(js), "live desk is staff-only");

var posts = [
  { id: "low", likes: 2, towerKind: "personal", authorName: "Ada", body: "quiet", createdAt: "2026-01-02" },
  { id: "hearts", likes: 1, towerKind: "professional", authorName: "Bea", body: "liked", createdAt: "2026-01-01", reactions: { "❤️": ["a", "b", "c", "d"] } },
  { id: "top", likes: 9, towerKind: "personal", authorName: "Cam", body: "lead", createdAt: "2026-01-03" },
];
var win = { document: { querySelector: function () { return null; } } };
win.window = win;
win.CognationTowerStore = {
  feedPlate: function () { return posts.slice(); },
  newsList: function () { return [posts[0], posts[2], posts[1]]; },
};
vm.runInContext(js, vm.createContext({ window: win, document: win.document, console: console }));
var ranked = win.CognationFeedRating.ranked();
assert.deepStrictEqual(ranked.map(function (p) { return p.id; }), ["top", "hearts", "low"]);
assert.deepStrictEqual(win.CognationFeedRating.forPaper().map(function (p) { return p.id; }), ["top", "hearts", "low"]);
console.log("feed-rating.test.js: ok");
