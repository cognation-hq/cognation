/**
 * Live check a3295a0: on a Pro page with a saved side-column (free) layout at 1280,
 * the YouTube card collapsed to 21.5x16.8 (seed-skye-0252-pro, Alexa's Pro). The
 * #234/#235 rule gives .tower-pro-youtube and its screen width:100% + 16:9, but in a
 * free layout the card is absolutely placed and shrink-to-fit, so 100% resolved to 0.
 * Regression: a free (non-grid) stage gives the YouTube card a real width: its column
 * width from the layout pass (--yt-col-w) with an 18.5rem floor, capped at the stage.
 * Grid and phone stay on the #234/#235 rule.
 * Run: node --test js/youtube-sidecol-width.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var js = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
var FREE = ".tower-layout--scrapbook.is-sticker-stage:not(.is-default-grid) > .tower-sticker--youtube";

function ruleBody(sel) {
  var i = flat.indexOf(sel + " {");
  if (i === -1) return null;
  var a = i + sel.length + 2;
  return flat.slice(a, flat.indexOf("}", a)).trim();
}

test("free side-column layout: YouTube card has a definite width (column width, 18.5rem floor)", function () {
  var w = ruleBody(FREE + ":not([data-sticker-w])");
  assert.ok(w, "free-layout YouTube width rule exists");
  assert.ok(/width: max\(18\.5rem, var\(--yt-col-w, 18\.5rem\)\);/.test(w), "width = column width, 18.5rem floor");
  assert.ok(/max-width: 100%;/.test(w), "capped at the stage");
  var m = ruleBody(FREE);
  assert.ok(m && /min-width: min\(18\.5rem, 100%\);/.test(m), "sane minimum even with a saved width");
});

test("rule sits after the #234/#235 100% + 16:9 rule it repairs", function () {
  var yt = flat.indexOf("#panel-tower .tower-sticker--youtube .tower-pro-youtube-screen { width: 100%; aspect-ratio: 16 / 9;");
  assert.ok(yt !== -1, "#234/#235 rule unchanged");
  assert.ok(flat.indexOf(FREE + " {") > yt, "after it");
});

test("layout pass sets --yt-col-w in the free layout and clears it on the grid", function () {
  var free = js.indexOf("/* Mixed: owner placed some widgets");
  var grid = js.indexOf("if (useGrid) {");
  assert.ok(free > 0 && grid > 0 && grid < free);
  var mixed = js.slice(free, js.indexOf("var placed = packSpawn(", free));
  assert.ok(/if \(id === "youtube"\) el\.style\.setProperty\("--yt-col-w", Math\.floor\(colW\) \+ "px"\);/.test(mixed), "free layout sets column width");
  assert.ok(/if \(id === "youtube"\) el\.style\.removeProperty\("--yt-col-w"\);/.test(js.slice(grid, free)), "grid clears it");
});

test("no #1c1630 / yellow in the new block", function () {
  var a = css.indexOf("/* Saved side-column (free) layout at 1280");
  var block = css.slice(a, css.indexOf("/* Designer nits 2 (follow-up to #234)", a));
  assert.ok(a !== -1);
  assert.ok(!/1c1630|yellow|#ff0|#ffff00/i.test(block));
});
