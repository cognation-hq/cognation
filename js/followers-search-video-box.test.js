/**
 * Designer nits: Followers "Search followers" is a glass input at full card width
 * (rgba(18,16,38,0.92), 1px #d9d2f0 at 40%, text #f7f9ff, placeholder #d9d2f0), and the
 * empty Professional YouTube box fills the card width at 16:9 at every width (desktop in
 * #234; extended below 768px in #235).
 * Run: node js/followers-search-video-box.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

var wrap = flat.indexOf("#panel-tower .tower-sticker--followers .tower-followers { max-width: none; }");
var find = flat.indexOf("#panel-tower .tower-sticker--followers .tower-followers-find { width: 100%; box-sizing: border-box; background: rgba(18, 16, 38, 0.92) !important; color: #f7f9ff !important; border: 1px solid rgba(217, 210, 240, 0.4) !important; }");
var ph = flat.indexOf("#panel-tower .tower-sticker--followers .tower-followers-find::placeholder { color: #d9d2f0 !important; opacity: 1; }");
assert.ok(wrap !== -1, "Followers card content spans the card");
assert.ok(find !== -1, "Search followers is the glass input");
assert.ok(ph !== -1, "placeholder #d9d2f0");
var oldFind = flat.indexOf("#panel-tower .tower-followers-find { width: 100%;");
assert.ok(oldFind !== -1 && find > oldFind, "comes after the white input rule it replaces");

var yt = flat.search(/#panel-tower \.tower-sticker--youtube \.tower-pro-youtube \{ width: 100%; \} #panel-tower \.tower-sticker--youtube \.tower-pro-youtube-screen \{ width: 100%; aspect-ratio: 16 \/ 9; min-height: 0; height: auto; \}/);
var oldYt = flat.indexOf(".tower-pro-youtube { width: 18.5rem;");
assert.ok(yt !== -1, "empty YouTube box at full card width, 16:9, all widths");
assert.ok(oldYt !== -1 && yt > oldYt, "comes after the 18.5rem rule");
assert.ok(!/@media \(min-width: 768px\) \{ #panel-tower \.tower-sticker--youtube/.test(flat), "no desktop-only scope: phone matches");
assert.ok(!/1c1630/i.test(css.slice(css.indexOf("/* Designer nits (follow-up to #228/#232)."), css.indexOf("/* TOWER Feed contrast (Designer follow-up)."))), "no #1c1630");
console.log("followers-search-video-box.test.js ok");
