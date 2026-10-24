/**
 * cgn-report-fail-size: in the Cognation Times the comment-level
 * "Couldn't send report, try again" line is the same size as the story-level one.
 * Story line: .news-report-status. Comment line: the Times rule for
 * [data-news-comment-report-error] (it was 0.88rem from .commune-status).
 * Run: node js/times-report-fail-size.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function rules(test) {
  var out = [], re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(css))) if (test(m[1].trim())) out.push({ sel: m[1].trim(), body: m[2], at: m.index });
  return out;
}
function size(body) { var m = /font-size:\s*([^;!]+)/.exec(body); return m ? m[1].trim() : null; }

/* Story line: the last font-size set on a rule that targets the story status. */
var story = rules(function (s) { return /\.news-report-status\b|\[data-news-report-status\]/.test(s); })
  .filter(function (r) { return size(r.body); });
assert.ok(story.length, "story status has a font-size");
var storySize = size(story[story.length - 1].body);

var comment = rules(function (s) { return /\[data-news-comment-report-error\]/.test(s); })
  .filter(function (r) { return size(r.body); });
assert.strictEqual(comment.length, 1, "one font-size rule for the comment fail line");
assert.ok(/^#panel-signal /.test(comment[0].sel), "Times only: " + comment[0].sel);
assert.strictEqual(size(comment[0].body), storySize, "comment fail line size = story fail line size");
assert.ok(/!important/.test(/font-size:[^;]*/.exec(comment[0].body)[0]), "beats .commune-status 0.88rem");
assert.strictEqual(storySize, "0.75rem", "story size unchanged (12px)");
console.log("times-report-fail-size.test.js ok");
