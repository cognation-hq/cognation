/**
 * Cognation Times (aef7a60) must keep each story's Report bar and comments.
 * Run: node js/times-news-comments.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
var times = css.slice(css.indexOf("SIGNAL → Cognation Times"));
assert.ok(times.length < css.length, "Times block present");
var noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
assert.ok(!/#panel-signal\s+\.news-story-comments[^{]*\{[^}]*display:\s*none/.test(noComments), "Times does not hide news comments");
assert.ok(!/#panel-signal\s+\.news-report-bar[^{]*\{[^}]*display:\s*none/.test(noComments), "Times does not hide the Report bar");
var list = /#panel-signal \.commune-feed-list,[^{]*\{([^}]*)\}/.exec(times)[1];
assert.ok(/grid-auto-rows:\s*minmax\(9\.1rem, auto\)/.test(list), "rows grow to fit Report and comments");
var item = /\n#panel-signal \.commune-feed-item \{([^}]*)\}/.exec(times)[1];
assert.ok(/height:\s*auto !important/.test(item) && /min-height:\s*9\.1rem/.test(item), "story cells are not clipped to a fixed height");
var js = fs.readFileSync(path.join(__dirname, "commune.js"), "utf8");
assert.ok(/data-news-report-toggle>Report</.test(js) && /CognationNewsComments\.mount\(article/.test(js), "every story still renders Report and mounts comments");
console.log("times-news-comments.test.js ok");
