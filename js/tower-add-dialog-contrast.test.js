/**
 * Add widget dialog contrast (Designer spec, Oct 22). Style only: the dialog
 * card was #fff5f9 under the site's light text. Checks the spec values, no
 * yellow, and that the dialog copy and controls are unchanged.
 * Run: node js/tower-add-dialog-contrast.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

var start = css.indexOf("/* Add widget dialog contrast (Designer spec, Oct 22).");
assert.ok(start > 0, "block present");
var end = css.indexOf("/* TOWER Feed contrast (Designer follow-up).", start);
assert.ok(end > start, "block sits before the Feed contrast block (that block stays last)");
var blk = css.slice(start, end);
function rule(sel) {
  var i = blk.indexOf(sel);
  assert.ok(i >= 0, "selector: " + sel);
  var o = blk.indexOf("{", i);
  return blk.slice(o, blk.indexOf("}", o));
}

var card = rule(".tower-add-widget-dialog .tower-add-widget-dialog-card {");
assert.ok(/background:\s*rgba\(18, 16, 38, 0\.92\)/.test(card), "glass");
assert.ok(/backdrop-filter:\s*blur\(12px\)/.test(card), "12px blur");
assert.ok(/border:\s*1px solid rgba\(217, 210, 240, 0\.4\)/.test(card), "#d9d2f0 at 40%");
assert.ok(/color:\s*#f7f9ff !important/.test(rule(".tower-add-widget-dialog .tower-add-widget-label {")), "title + label #f7f9ff");
assert.ok(/color:\s*#d9d2f0 !important/.test(rule(".tower-add-widget-dialog .tower-add-widget-dialog-card .form-hint {")), "hint #d9d2f0");

var outline = rule(".tower-add-widget-dialog .form-actions [data-tower-add-widget-cancel] {");
assert.ok(/background:\s*transparent !important/.test(outline));
assert.ok(/border:\s*1px solid rgba\(217, 210, 240, 0\.4\) !important/.test(outline));
assert.ok(/color:\s*#f7f9ff !important/.test(outline), "unselected tab + Cancel");

assert.ok(/\.tower-add-widget-dialog \.tower-add-widget-choices \[data-tower-add-choice="quote"\],/.test(blk), "Quote pill");
var pill = rule(".tower-add-widget-dialog .form-actions [data-tower-add-quote-confirm] {");
assert.ok(/linear-gradient\(100deg, rgba\(139, 237, 255, 0\.42\), rgba\(204, 161, 255, 0\.38\)\)/.test(pill), "same gradient pill");
assert.ok(/color:\s*#1c1630 !important/.test(pill), "ink text");

var ta = rule(".tower-add-widget-dialog [data-tower-add-quote-text] {");
assert.ok(/background:\s*rgba\(255, 255, 255, 0\.06\)/.test(ta) && /color:\s*#f7f9ff/.test(ta), "textarea");
assert.ok(/color:\s*#d9d2f0/.test(rule("[data-tower-add-quote-text]::placeholder {")), "placeholder");

var err = rule(".tower-add-widget-dialog-card .tower-add-quote-status {");
assert.ok(/background:\s*#fbe3e6/.test(err) && /border:\s*1px solid #e88a99/.test(err) && /color:\s*#1c1630/.test(err), "blocked-quote line");

assert.ok(!/#ED9300|--color-accent/i.test(blk), "no yellow");
/* Copy and controls unchanged. */
["Add to scrapbook", "Quote", "Quote text", "Type a quote or note…", "Add sticker", "Cancel"].forEach(function (t) {
  assert.ok(html.indexOf(t) > 0, "copy kept: " + t);
});
console.log("tower-add-dialog-contrast tests passed");
