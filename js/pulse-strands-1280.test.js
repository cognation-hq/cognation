/**
 * cgn-strands-1280: PULSE strand drift is clearly visible on wide screens.
 * At 1280 the image is drawn at k 0.954 (0.31 on phones), so the old 3-5px
 * drift was under a strand's width, and the 16s alternate stalled at each end.
 * Wide screens now use the phones' four-point loop with the translate doubled.
 * Image, halo, drift-layer opacity/mask, the phone drift and reduced motion
 * are unchanged.
 * Run: node js/pulse-strands-1280.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");

function kf(name) {
  var i = css.indexOf("@keyframes " + name + " {");
  assert.ok(i >= 0, name + " keyframes");
  var depth = 0, j = css.indexOf("{", i);
  for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}" && --depth === 0) break; }
  var body = css.slice(i, j + 1), out = {}, re = /([\d%, ]+)\{\s*transform:\s*translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0\)\s*rotate\(([-\d.]+)deg\)\s*scale\(([\d.]+)\);\s*\}/g, m;
  while ((m = re.exec(body))) out[m[1].trim()] = { x: +m[2], y: +m[3], r: +m[4], s: +m[5] };
  return out;
}
var wide = kf("pulse-strand-drift"), phone = kf("pulse-strand-drift-phone");
var stops = ["0%, 100%", "25%", "50%", "75%"];
assert.deepStrictEqual(Object.keys(wide), stops, "wide: four-point loop (0/100, 25, 50, 75)");
assert.deepStrictEqual(Object.keys(phone), stops, "phone keyframes unchanged shape");
stops.forEach(function (k) {
  assert.strictEqual(wide[k].x, phone[k].x * 2, "translate x doubled at " + k);
  assert.strictEqual(wide[k].y, phone[k].y * 2, "translate y doubled at " + k);
  assert.strictEqual(wide[k].r, phone[k].r, "rotate as phones at " + k);
  assert.strictEqual(wide[k].s, phone[k].s, "scale as phones at " + k);
});
assert.ok(Math.max.apply(null, stops.map(function (k) { return Math.abs(wide[k].x); })) <= 8, "drift stays small (<= 8px)");

var after = /\.circle-fall\[data-pulse-bg\]::after \{(\s*\/\* drift layer[^}]*)\}/.exec(css)[1];
assert.ok(/animation: pulse-strand-drift 12s ease-in-out infinite;/.test(after), "wide: 12s loop, no alternate");
assert.ok(/opacity: 0\.42;/.test(after) && /mix-blend-mode: screen;/.test(after), "drift layer opacity/blend unchanged");
assert.ok(/mask-image: radial-gradient\(ellipse 50% 50% at 51% 44%, transparent 58%, #000 76%, #000 90%, transparent 100%\);/.test(after), "ring-band mask unchanged");
assert.ok(/@media \(max-width: 600px\) \{[\s\S]*?\.circle-fall\[data-pulse-bg\]::after \{\s*animation: pulse-strand-drift-phone 12s ease-in-out infinite;/.test(css), "phones keep their drift");
assert.ok(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.circle-fall\[data-pulse-bg\]::after \{ animation: none !important; transform: none !important; \}/.test(css), "reduced motion: no drift");
assert.ok(css.indexOf('url("../assets/pulse/pulse-bg-1190.webp")') > 0, "Alexa's image unchanged");
console.log("pulse-strands-1280.test.js ok");
