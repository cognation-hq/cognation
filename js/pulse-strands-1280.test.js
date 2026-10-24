/**
 * cgn-strands-1280: PULSE strand drift is clearly visible on wide screens.
 * At 1280 the image is drawn at k 0.954 (0.31 on phones), so the old 3-5px
 * drift was under a strand's width, and the 16s alternate stalled at each end.
 * v2 (Designer LOOK NO on v1): on the single drift layer above 600px, a 12s
 * ease-in-out four-point loop with ~13px drift, a 1.5% scale breathe and opacity
 * breathing 80-100% of its 0.42. No extra strand copies. Image, halo, mask,
 * the phone drift and reduced motion (fully still) are unchanged.
 * Run: node js/pulse-strands-1280.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");

function kfBody(name) {
  var i = css.indexOf("@keyframes " + name + " {");
  assert.ok(i >= 0, name + " keyframes");
  var depth = 0, j = css.indexOf("{", i);
  for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}" && --depth === 0) break; }
  return css.slice(i, j + 1);
}
function kf(name) {
  var body = kfBody(name), out = {}, m;
  var re = /([\d%, ]+)\{\s*transform:\s*translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0\)\s*rotate\(([-\d.]+)deg\)\s*scale\(([\d.]+)\);(?:\s*opacity:\s*([\d.]+);)?\s*\}/g;
  while ((m = re.exec(body))) out[m[1].trim()] = { x: +m[2], y: +m[3], r: +m[4], s: +m[5], o: m[6] == null ? null : +m[6] };
  return out;
}
var stops = ["0%, 100%", "25%", "50%", "75%"];
var wide = kf("pulse-strand-drift"), phone = kf("pulse-strand-drift-phone");
assert.deepStrictEqual(Object.keys(wide), stops, "wide: four-point loop (0/100, 25, 50, 75)");

/* Phones untouched (pulse-strand-drift-phone, transform only). */
assert.deepStrictEqual(phone, {
  "0%, 100%": { x: -3, y: 1.5, r: -0.3, s: 1.003, o: null },
  "25%": { x: 2.5, y: -1.5, r: 0.15, s: 1.009, o: null },
  "50%": { x: 4, y: 1.5, r: 0.33, s: 0.998, o: null },
  "75%": { x: -1, y: 2.5, r: -0.08, s: 1.006, o: null },
}, "phone drift unchanged");

/* Wide (v2, Designer LOOK): ~12-14px drift, 1.5% scale breathe, opacity 80-100% of 0.42. */
var reach = stops.map(function (k) { return Math.sqrt(wide[k].x * wide[k].x + wide[k].y * wide[k].y); });
var maxReach = Math.max.apply(null, reach);
assert.ok(maxReach >= 12 && maxReach <= 14, "largest drift offset 12-14px (" + maxReach.toFixed(1) + ")");
var scales = stops.map(function (k) { return wide[k].s; });
assert.strictEqual(+(Math.max.apply(null, scales) - Math.min.apply(null, scales)).toFixed(4), 0.015, "scale breathes 1.5%");
var ops = stops.map(function (k) { return wide[k].o; });
assert.ok(ops.every(function (o) { return typeof o === "number"; }), "opacity on every stop");
assert.strictEqual(Math.max.apply(null, ops), 0.42, "opacity peaks at the layer's 0.42 (100%)");
assert.strictEqual(+(Math.min.apply(null, ops) / 0.42).toFixed(3), 0.8, "opacity dips to 80%");
assert.ok(!/filter|background|mask/.test(kfBody("pulse-strand-drift")), "keyframes animate transform/opacity only");
stops.forEach(function (k) { assert.strictEqual(wide[k].r, phone[k].r, "rotate as phones at " + k); });

/* One strand layer: no extra strand copies (only ::before image + ::after drift use the image). */
var copies = css.match(/background-image: url\("\.\.\/assets\/pulse\/pulse-bg-1190\.jpg"\)/g) || [];
assert.strictEqual(copies.length, 1, "the 1190 image is set once (shared ::before/::after rule)");
assert.ok(!/\.circle-fall\[data-pulse-bg\][^{]*::(?:marker|backdrop)|data-pulse-strands/.test(css), "no new strand layers");

var after = /\.circle-fall\[data-pulse-bg\]::after \{(\s*\/\* drift layer[^}]*)\}/.exec(css)[1];
assert.ok(/animation: pulse-strand-drift 12s ease-in-out infinite;/.test(after), "wide: 12s loop, no alternate");
assert.ok(/opacity: 0\.42;/.test(after) && /mix-blend-mode: screen;/.test(after), "drift layer base opacity (still/reduced-motion) and blend unchanged");
assert.ok(/mask-image: radial-gradient\(ellipse 50% 50% at 51% 44%, transparent 58%, #000 76%, #000 90%, transparent 100%\);/.test(after), "ring-band mask unchanged");
assert.ok(/@media \(max-width: 600px\) \{[\s\S]*?\.circle-fall\[data-pulse-bg\]::after \{\s*animation: pulse-strand-drift-phone 12s ease-in-out infinite;/.test(css), "phones keep their drift");
assert.ok(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.circle-fall\[data-pulse-bg\]::after \{ animation: none !important; transform: none !important; \}/.test(css), "reduced motion: no drift");
assert.ok(css.indexOf('url("../assets/pulse/pulse-bg-1190.webp")') > 0, "Alexa's image unchanged");
console.log("pulse-strands-1280.test.js ok");
