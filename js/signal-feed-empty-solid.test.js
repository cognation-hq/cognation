/**
 * SIGNAL Feed empty state: the panel behind "No Feed posts yet" must be SOLID
 * (fully opaque, no glass over the pink card) and every text color in it must
 * meet WCAG AA 4.5:1 against that panel.
 * Run: node js/signal-feed-empty-solid.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");

function rule(sel) {
  var i = css.indexOf(sel + " {");
  assert.ok(i >= 0, "missing rule: " + sel);
  return css.slice(i, css.indexOf("}", i));
}
function prop(body, name) {
  var m = body.match(new RegExp("(?:^|[;{\\s])" + name + "\\s*:\\s*([^;]+);"));
  return m ? m[1].replace(/\/\*.*?\*\//g, "").trim() : null;
}
function hex(v) {
  var m = String(v).match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  var h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return [0, 2, 4].map(function (k) { return parseInt(h.substr(k, 2), 16); });
}
function lum(c) {
  var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
var rootText = (css.match(/--cgn-text:\s*(#[0-9a-f]{3,6})/i) || [])[1];

[".tower-feed[data-tower-feed] .commune-empty",
 "#panel-signal .signal-feed-host .tower-feed[data-tower-feed] .commune-empty"].forEach(function (sel) {
  var body = rule(sel);
  var bg = prop(body, "background");
  var bgRgb = hex(bg);
  assert.ok(bgRgb, sel + ": background must be an opaque solid hex color, got " + bg);
  assert.ok(!/rgba|hsla|transparent|gradient/i.test(bg), sel + ": no transparency allowed");
  var color = prop(body, "color");
  var candidates = [];
  var fb = color.match(/var\(--cgn-text,\s*(#[0-9a-f]{3,6})\)/i);
  if (fb) { candidates.push(fb[1]); if (rootText) candidates.push(rootText); } else candidates.push(color);
  candidates.forEach(function (c) {
    var r = ratio(hex(c), bgRgb);
    assert.ok(r >= 4.5, sel + ": " + c + " on " + bg + " is " + r.toFixed(2) + ":1 (<4.5)");
    console.log("ok " + c + " on " + bg + " = " + r.toFixed(2) + ":1");
  });
});
console.log("signal-feed-empty-solid: all assertions passed");

// Outer SIGNAL host frame in the empty state: solid dark, scoped, readable.
(function () {
  var sel = "#panel-signal .signal-feed-host:has(.tower-feed[data-tower-feed] .commune-empty)";
  var body = rule(sel);
  var bg = prop(body, "background"), fg = prop(body, "color");
  assert.ok(hex(bg), "host background must be opaque hex, got " + bg);
  assert.ok(lum(hex(bg)) < 0.05, "host must be dark, got " + bg);
  assert.strictEqual(prop(body, "--tower-private-bg"), bg);
  var r = ratio(hex(fg), hex(bg));
  assert.ok(r >= 4.5, "host text " + fg + " on " + bg + " = " + r.toFixed(2));
  console.log("ok host " + fg + " on " + bg + " = " + r.toFixed(2) + ":1");
  // Other cards untouched: base .signal-feed-host still pale.
  assert.strictEqual(prop(rule("\n.signal-feed-host"), "--tower-private-bg"), "#fff5f9");
})();
