/* PR B: Pro "Demo · placeholder" cards hidden; PYMK fallback card removed. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const swipe = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
assert.ok(/var SHOW_PRO_PLACEHOLDERS = false;/.test(swipe), "placeholders off by default");
assert.ok(/if \(!SHOW_PRO_PLACEHOLDERS\) lanes\[type\] = lanes\[type\]\.filter\(function \(c\) \{ return c && !c\.demo; \}\)/.test(swipe), "demo cards filtered from every lane");
assert.ok(!/"pro-know-placeholder"/.test(swipe), "PYMK fallback card removed");
console.log("pro-placeholders-hidden ok");
