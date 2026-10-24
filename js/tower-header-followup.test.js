/**
 * Tower header follow-up (Designer):
 *  - the display name is centred under the avatar and #f7f9ff (stacked header only);
 *  - the disabled "Unavailable" friend button keeps exactly the same size/padding as
 *    "+ friend": same element, same .tower-follow-btn rule, no disabled-only size rule;
 *  - every friend/follow pill state has a 12px floor, keeping #186's 0.3x name scaling
 *    above it, about 28px tall with about 10px side padding at the floor.
 * Run: node js/tower-header-followup.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var follow = fs.readFileSync(path.join(root, "js/tower-follow.js"), "utf8");
var flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

/* Name: centred + #f7f9ff, after the rules it overrides. */
var nameRule = flat.match(/#panel-tower \.tower-avatar-stack \.tower-profile-name-wrap \.tower-profile-name \{ text-align: center; color: #f7f9ff !important; \}/);
assert.ok(nameRule, "header name centred under the avatar, #f7f9ff");
var leftAt = flat.indexOf(".tower-profile-name-wrap .tower-profile-name { margin: 0;");
var mutedAt = flat.indexOf("#panel-tower :is(p, li, td, th, small, time, figcaption)");
assert.ok(leftAt !== -1 && mutedAt !== -1 && nameRule.index > leftAt && nameRule.index > mutedAt, "placed after the left-align and muted-text rules");
/* Specificity beats `#panel-tower :is(p, …)` (1,0,1): ours is (1,3,0). */
assert.ok(/^#panel-tower(\s+\.[a-z-]+){3}$/.test("#panel-tower .tower-avatar-stack .tower-profile-name-wrap .tower-profile-name"));
/* Strip layout (name beside the avatar) keeps its left alignment: not touched. */
assert.ok(/\[data-tower-profile-strip\] > \.tower-sticker--identity\.is-spawned \.tower-profile-name-wrap, [^{]*\{ margin: 0; text-align: left; \}/.test(flat), "strip layout unchanged");
var block = css.slice(css.indexOf("/* Tower header name (Designer follow-up)"));
assert.ok(!/#ED9300|yellow|amber/i.test(block), "no yellow");
/* Loading state still hides the name. */
assert.ok(/\.tower-profile-name\.is-loading \{ color: var\(--cgn-text-muted\); visibility: hidden; \}/.test(flat), "loading placeholder unchanged");

/* Unavailable = same button as "+ friend". */
assert.ok(!/\.tower-follow-btn[^{,]*(:disabled|\[disabled\])[^{]*\{[^}]*(font-size|padding|font:)/.test(flat), "no disabled-only size/padding rule on the friend button");
var unavailable = follow.match(/btn\.textContent = "Unavailable";/g) || [];
assert.ok(unavailable.length >= 2, "Unavailable is a label on the same button");
assert.ok(!/classList\.(add|toggle)\("[^"]*(tag|status|small)[^"]*"/.test(follow), "no tag/status class swapped in");
assert.ok(/btn\.disabled = true;\s*btn\.textContent = "Unavailable";/.test(follow), "Unavailable stays disabled");
/* Friend/follow pill: 12px floor with #186's 0.3x name scaling above it, ~28px tall,
   ~10px sides (em, so it grows with the scaled size). One rule for every state. */
var pill = flat.match(/\.tower-follow-btn \{[^}]*\}/);
assert.ok(pill, "base pill rule");
assert.ok(/font-size: max\(12px, calc\(var\(--tower-name-size, 28px\) \* 0\.3\)\);/.test(pill[0]), "12px floor, 0.3x name above it");
assert.ok(/padding: 0\.5em 0\.83em;/.test(pill[0]) && /line-height: 1;/.test(pill[0]), "~28px tall, ~10px sides at 12px");
function pillSize(namePx) { return Math.max(12, namePx * 0.3); }
function pillHeight(namePx) { var f = pillSize(namePx); return f * 1 + 2 * 0.5 * f + 2; /* line-height 1 + padding + 1px borders */ }
assert.strictEqual(pillSize(28), 12, "default 28px name: floor (was 8.4px)");
assert.strictEqual(pillSize(16), 12, "small name: floor");
assert.ok(Math.abs(pillSize(56) - 16.8) < 1e-9, "enlarged 56px name still scales up (16.8px)");
assert.ok(pillHeight(28) >= 26 && pillHeight(28) <= 30, "about 28px tall at the floor (box model 26px; measured 28px in Chrome with the font line box)");
assert.ok(Math.abs(0.83 * 12 - 10) < 0.1, "about 10px side padding at the floor");
assert.ok(!/\.tower-follow-btn[^{]*\{[^}]*font-size: max\(8px/.test(flat), "old 8px floor gone");
/* No other rule resizes one state: every state uses .tower-follow-btn. */
assert.ok(!/(\[data-tower-follow\]|\[data-tower-add-friends\])[^{,]*\{[^}]*font-size/.test(flat), "no per-button font-size override");
console.log("tower-header-followup.test.js ok");
