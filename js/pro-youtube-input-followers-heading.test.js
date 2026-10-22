/**
 * Designer nits 2: owner "Paste a YouTube link" uses the Search followers glass input at
 * full card width, 8px below the video box; owner Followers title starts at the card
 * padding (handles are hidden in #panel-tower, so the drag-dot gutter is unused).
 * Run: node js/pro-youtube-input-followers-heading.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
var S = "#panel-tower .tower-sticker--youtube .tower-pro-youtube-owner";

var owner = flat.indexOf(S + " { width: 100%; max-width: none; margin-top: 8px; }");
var input = flat.indexOf(S + " .tower-music-url-label input { display: block; width: 100%; box-sizing: border-box; background: rgba(18, 16, 38, 0.92) !important; color: #f7f9ff !important; border: 1px solid rgba(217, 210, 240, 0.4) !important; }");
var ph = flat.indexOf(S + " .tower-music-url-label input::placeholder { color: #d9d2f0 !important; opacity: 1; }");
assert.ok(owner !== -1, "full card width, 8px above");
assert.ok(input !== -1, "glass input");
assert.ok(ph !== -1, "placeholder #d9d2f0");
var oldInput = flat.indexOf("#panel-tower .tower-music-url-label input, .tower-music-url-label input { width: 100%; box-sizing: border-box; background: #fff !important;");
assert.ok(oldInput !== -1 && input > oldInput, "after the white input rule");

var title = '[data-tower-app][data-tower-is-owner="true"][data-tower-side="public"] .tower-sticker--followers .tower-widget-title { margin-left: 0; padding-left: 0; }';
var t = flat.indexOf(title);
var gutter = flat.indexOf("margin-left: calc(1.6rem + 14px);");
assert.ok(t !== -1 && gutter !== -1 && t > gutter, "Followers title at card padding, after the gutter rule");
assert.ok(/#panel-tower \.tower-sticker-handle, #panel-tower \.tower-sticker-handle\[hidden\] \{ display: none !important;/.test(flat), "handles stay hidden in #panel-tower (why the gutter is unused)");
assert.ok(/\.tower-sticker--calendar \.tower-cal-public-title \{ padding-left: 0; margin-left: calc\(1\.6rem \+ 14px\); \}/.test(flat), "Calendar title rule unchanged");
console.log("pro-youtube-input-followers-heading.test.js ok");
