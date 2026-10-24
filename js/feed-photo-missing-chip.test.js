/**
 * Feed "photo wasn't uploaded" chip: transparent, 1px #d9d2f0 at 40%,
 * PHOTO label #f7f9ff, the rest #d9d2f0 (Designer nit on #218). Style only.
 * Run: node js/feed-photo-missing-chip.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

function block(sel) {
  var i = css.indexOf(sel + " {");
  assert.ok(i >= 0, "rule present: " + sel);
  return css.slice(i, css.indexOf("}", i));
}
var chip = block(".tower-attachments > .tower-attach.tower-attach--missing");
assert.ok(/background:\s*transparent !important/.test(chip), "chip is transparent");
assert.ok(/border:\s*1px solid rgba\(217, 210, 240, 0\.4\) !important/.test(chip), "1px #d9d2f0 at 40%");
assert.ok(!/border-radius|padding/.test(chip), "radius and padding unchanged");
assert.ok(/color:\s*#f7f9ff !important/.test(block(".tower-attach--missing .tower-attach-kind")), "PHOTO label #f7f9ff");
var rest = block(".tower-attach--missing .tower-attach-name,\n.tower-attach--missing .tower-attach-note");
assert.ok(/color:\s*#d9d2f0 !important/.test(rest), "name and note #d9d2f0");
assert.ok(!/#ED9300|#ffd400|#f5c400/i.test(chip + rest), "no yellow");
// The rules sit after the global `span { color: var(--cgn-ink) !important }`.
assert.ok(css.indexOf(".tower-attach--missing .tower-attach-kind") > css.indexOf("li, td, th, summary, figcaption {"), "after the global ink rule");
console.log("feed-photo-missing-chip tests passed");
