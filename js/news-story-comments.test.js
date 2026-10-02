/**
 * News story comments baby step.
 * Run: node js/news-story-comments.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function load(ls) {
  var w = {};
  vm.runInNewContext(src("js/news-comments.js"), { window: w, localStorage: ls, Date: Date, Math: Math });
  return w.CognationNewsComments;
}

var css = src("css/styles.css");
var html = src("index.html");
var commune = src("js/commune.js");
assert.ok(css.indexOf(".news-comment-react-chip") !== -1, "react size class exists");
assert.ok(html.indexOf("js/news-comments.js") !== -1, "script wired");
assert.ok(commune.indexOf("CognationNewsComments.mount") !== -1, "commune mounts under story");

var api = load(mem());
assert.strictEqual(api.REACT_CHIP_CLASS, "news-comment-react-chip");

var denied = api.addComment({ storyId: "s1", body: "nope", parentId: "x" });
assert.strictEqual(denied.ok, false);
assert.strictEqual(denied.error, "one_level_only");
var ok = api.addComment({ storyId: "s1", body: "hello", authorName: "seed-a", accountKind: "seed", createdAt: "2026-10-01T10:00:00.000Z" });
assert.ok(ok.ok);
assert.ok(!("parentId" in ok.comment), "comment has no parentId field");

for (var i = 0; i < 22; i++) {
  api.addComment({
    storyId: "s2", body: "c" + i, authorName: "u",
    createdAt: "2026-10-01T" + String(10 + Math.floor(i / 60)).padStart(2, "0") + ":" + String(i % 60).padStart(2, "0") + ":00.000Z",
  });
}
var list = api.listForStory("s2");
assert.strictEqual(list.length, 20, "cap 20");
assert.ok(list[0].body === "c2", "drops oldest beyond 20; window starts at c2");
assert.ok(list[19].body === "c21", "ends at latest");
for (var j = 1; j < list.length; j++) {
  assert.ok(list[j - 1].createdAt <= list[j].createdAt, "oldest-first");
}

assert.strictEqual(api.isThreadVisible("G-PG", 12), true);
assert.strictEqual(api.isThreadVisible("PG", 10), true);
assert.strictEqual(api.isThreadVisible("PG-13", 12), false);
assert.strictEqual(api.isThreadVisible("R", 11), false);
assert.strictEqual(api.isThreadVisible("PG-13", 13), true);
assert.strictEqual(api.isThreadVisible("", 12), false);

console.log("news-story-comments.test.js: ok");
