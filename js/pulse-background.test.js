/**
 * PULSE background: Alexa's image (squares removed), WebP + JPEG fallback,
 * light phone file, gentle drift off under reduced motion, friend circles on top.
 * Run: node js/pulse-background.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var css = src("css/styles.css"), tower = src("js/tower.js");
var tail = css.slice(css.indexOf("pulse-background PR"));

["pulse-bg-1190.webp", "pulse-bg-1190.jpg", "pulse-bg-760.webp", "pulse-bg-760.jpg"].forEach(function (f) {
  var p = path.join(root, "assets/pulse", f);
  assert.ok(fs.existsSync(p), f + " exists");
  assert.ok(fs.statSync(p).size < 60 * 1024, f + " is web-light");
});
assert.ok(/image-set\(url\("\.\.\/assets\/pulse\/pulse-bg-1190\.webp"\) type\("image\/webp"\), url\("\.\.\/assets\/pulse\/pulse-bg-1190\.jpg"\)/.test(tail), "webp with jpeg fallback");
assert.ok(/background-image: url\("\.\.\/assets\/pulse\/pulse-bg-1190\.jpg"\);/.test(tail), "plain jpeg for browsers without image-set");
assert.ok(/max-width: 600px[\s\S]*pulse-bg-760\.webp/.test(tail), "phones load the 760px file");
assert.ok(/animation: pulse-strand-drift/.test(tail) && /@keyframes pulse-strand-drift/.test(tail), "strand drift");
assert.ok(/prefers-reduced-motion: reduce\)\s*\{\s*\.circle-fall\[data-pulse-bg\]::after \{ animation: none/.test(tail), "drift off for reduced motion");
assert.ok(/\.pulse-fall-stack \{ z-index: 3; \}/.test(tail), "friend circles above the ring");
assert.ok(!/yellow|#ff[cd]|#fe[0-9a-f]{4}|255, ?2[0-9]{2}, ?[0-9]{1,2}\)/i.test(tail), "no yellow");
assert.ok(/layer\.setAttribute\("data-pulse-bg", ""\)/.test(tower), "PULSE layer opts in");
assert.ok(/PULSE_BG_SQUARES/.test(tower) && /pinCircleSpotsToBackground\(spots\)/.test(tower), "spots sit where the squares were");
assert.ok(/\.circle-fall\[data-pulse-bg\] svg\.circle-bolt \{ display: none; \}/.test(tail), "lightning + bolt hidden on PULSE (r4)");
assert.ok(/\.circle-ring::before \{[\s\S]*?rgba\(168, 244, 255, 0\.16\)[\s\S]*?rgba\(197, 166, 255, 0\.2\)/.test(tail), "halo blended over the image");
var r6 = css.slice(css.indexOf("pulse-background r6"));
assert.ok(/max-width: 600px[\s\S]*radial-gradient\(min\(calc\(786px \* var\(--pulse-bg-k\)\), calc\(50vw - 16px\)\) calc\(290px \* var\(--pulse-bg-k\)\) at 50% 48%/.test(r6), "phone halo is a ring-shaped oval, capped at the panel");
assert.ok(/\.circle-ring::before \{[\s\S]*?786px/.test(r6), "phone ring glow uses the same oval");
assert.ok(/fitK = \(layer\.clientWidth \/ 2 - 8\) \/ 576/.test(tower) && /matchMedia\("\(max-width: 600px\)"\)/.test(tower), "phones shrink the image so the strands stay inside the panel");
console.log("pulse-background.test: ok");
