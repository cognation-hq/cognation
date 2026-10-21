/**
 * Tower header follow-up (Designer):
 *  - the display name is centred under the avatar and #f7f9ff (stacked header only);
 *  - the disabled "Unavailable" friend button keeps exactly the same size/padding as
 *    "+ friend": same element, same .tower-follow-btn rule, no disabled-only size rule.
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
console.log("tower-header-followup.test.js ok");
