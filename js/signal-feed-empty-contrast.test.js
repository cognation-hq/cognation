/**
 * SIGNAL Feed empty state: readable #f7f9ff text on the dark panel, no pale
 * .tower-feed corners. Style only; copy unchanged.
 * Run: node js/signal-feed-empty-contrast.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
var tower = fs.readFileSync(path.join(root, "js", "tower.js"), "utf8");

var textSel = "#panel-signal .signal-feed-host .tower-feed[data-tower-feed] > .commune-empty {";
var hostSel = "#panel-signal .signal-feed-host .tower-feed[data-tower-feed]:has(> .commune-empty) {";
var ti = css.indexOf(textSel), hi = css.indexOf(hostSel);
assert.ok(ti >= 0 && hi >= 0, "empty-state rules present");
var tb = css.slice(ti, css.indexOf("}", ti)), hb = css.slice(hi, css.indexOf("}", hi));
assert.ok(/color:\s*#f7f9ff !important/.test(tb), "empty text is #f7f9ff");
assert.ok(/background-color:\s*transparent !important/.test(hb), "no grey wash around the empty panel");
// Must come after the rule that muted it.
var muted = css.indexOf("#panel-signal :is(p, li, td, th, small, time, figcaption)");
assert.ok(muted >= 0 && ti > muted, "after the #panel-signal muted-text rule");
assert.ok(!/#ED9300|#ffd400|#f5c400/i.test(tb + hb), "no yellow");
assert.ok(/No Feed posts yet — send the first signal\./.test(tower), "copy unchanged");
console.log("signal-feed-empty-contrast tests passed");
