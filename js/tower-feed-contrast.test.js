/**
 * TOWER Feed contrast (Designer follow-up): post cards on the site glass
 * rgba(18,16,38,0.92) and a 1px #d9d2f0 @ 40% Feed border, scoped to the TOWER Feed
 * (.tower-feed[data-tower-feed]) and placed after the global rules it must beat.
 * The Times, the Demo badge and the other panels keep their rules.
 * Run: node js/tower-feed-contrast.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

var feedRule = flat.match(/\.tower-feed\[data-tower-feed\] \{ border: 1px solid rgba\(217, 210, 240, 0\.4\) !important; \}/);
var postRule = flat.match(/\.tower-feed\[data-tower-feed\] \.tower-post \{ background: rgba\(18, 16, 38, 0\.92\) !important; \}/);
assert.ok(feedRule, "Feed list border: 1px #d9d2f0 at 40%");
assert.ok(postRule, "Feed post cards: glass rgba(18,16,38,0.92)");

/* Placed after the global rules they override (same !important, later wins on ties). */
var blackBorder = flat.indexOf(".tower-feed, .tower-side, .commune-swipe-shell, .news-paper, .login-gate-panel { background-color: rgba(255, 255, 255, 0.28) !important;");
var panelBg = flat.search(/\.tower-post, \.tower-private-theme[^{]*\{ border: 1px solid rgba\(220, 246, 255, 0\.24\) !important;[^}]*background: var\(--cgn-panel\) !important;/);
assert.ok(blackBorder !== -1 && panelBg !== -1, "global rules found");
assert.ok(feedRule.index > blackBorder && postRule.index > panelBg, "new rules come after the global ones");

/* Scoped: every selector in the new block names the TOWER Feed; nothing for the Times, badge or other panels. */
var start = css.indexOf("/* TOWER Feed contrast (Designer follow-up).");
assert.ok(start !== -1, "block present");
var block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, "");
var selectors = block.match(/[^{}]+(?=\{)/g).map(function (s) { return s.trim(); });
assert.strictEqual(selectors.length, 2, "two rules only");
selectors.forEach(function (s) { assert.ok(/^\.tower-feed\[data-tower-feed\]/.test(s), "scoped to the TOWER Feed: " + s); });
assert.ok(!/commune-paper|times|seedops-demo-badge|#4a1d12|color\s*:/i.test(block), "no Times, badge or text-color change");
assert.ok(!/#ED9300|yellow|amber|#ff[cd]/i.test(block), "no yellow");
assert.ok(/\.seedops-demo-badge \{\s*color: #4a1d12 !important;/.test(css), "Demo badge color unchanged");
console.log("tower-feed-contrast.test.js ok");
