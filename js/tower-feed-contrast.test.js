/**
 * TOWER Feed contrast (Designer follow-up): post cards on the site glass
 * rgba(18,16,38,0.92) with 12px padding and an 8px gap, no outer Feed border, and the
 * "Send a signal" composer on the same glass (placeholder #d9d2f0). Scoped to the TOWER
 * Feed panel and placed after the global rules it must beat.
 * The Times, the Demo badge and the other panels keep their rules.
 * Run: node js/tower-feed-contrast.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

var feedRule = flat.match(/\.tower-feed\[data-tower-feed\] \{ border: 0 !important; gap: 8px !important; \}/);
var postRule = flat.match(/\.tower-feed\[data-tower-feed\] \.tower-post \{ background: rgba\(18, 16, 38, 0\.92\) !important; padding: 12px !important; \}/);
var composeRule = flat.match(/#panel-signal \.signal-feed-host \.tower-compose\[data-tower-compose\] \{ background: rgba\(18, 16, 38, 0\.92\) !important; \}/);
var placeholderRule = flat.match(/#panel-signal \.signal-feed-host \.tower-compose\[data-tower-compose\] textarea::placeholder \{ color: #d9d2f0 !important; opacity: 1; \}/);
assert.ok(feedRule, "Feed list: no outer border, 8px gap between cards");
assert.ok(postRule, "Feed post cards: glass rgba(18,16,38,0.92), 12px inner padding");
assert.ok(composeRule, "Send a signal composer: same glass");
assert.ok(placeholderRule, "composer placeholder #d9d2f0 (4.5:1+ on the glass)");
assert.ok(!/\.tower-feed\[data-tower-feed\] \{[^}]*rgba\(217, 210, 240, 0\.4\)/.test(flat), "the 1px 40% line is gone");

/* Placed after the global rules they override (same !important, later wins on ties). */
var blackBorder = flat.indexOf(".tower-feed, .tower-side, .commune-swipe-shell, .news-paper, .login-gate-panel { background-color: rgba(255, 255, 255, 0.28) !important;");
var panelBg = flat.search(/\.tower-post, \.tower-private-theme[^{]*\{ border: 1px solid rgba\(220, 246, 255, 0\.24\) !important;[^}]*background: var\(--cgn-panel\) !important;/);
var oldCompose = flat.indexOf("#panel-signal .signal-feed-host .tower-compose { background: rgba(16, 19, 48, 0.42) !important;");
var oldPlaceholder = flat.indexOf("#panel-signal :is(input, select, textarea)::placeholder");
assert.ok(blackBorder !== -1 && panelBg !== -1 && oldCompose !== -1 && oldPlaceholder !== -1, "global rules found");
assert.ok(feedRule.index > blackBorder && postRule.index > panelBg && composeRule.index > oldCompose && placeholderRule.index > oldPlaceholder, "new rules come after the ones they override");

/* Scoped: TOWER Feed list/cards and the Feed panel's composer only; nothing for the Times, badge, buttons or other panels. */
var start = css.indexOf("/* TOWER Feed contrast (Designer follow-up).");
assert.ok(start !== -1, "block present");
var block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, "");
var selectors = block.match(/[^{}]+(?=\{)/g).map(function (s) { return s.trim(); });
assert.strictEqual(selectors.length, 4, "four rules only");
selectors.forEach(function (s) {
  assert.ok(/^\.tower-feed\[data-tower-feed\]/.test(s) || /^#panel-signal \.signal-feed-host \.tower-compose\[data-tower-compose\]/.test(s), "scoped to the TOWER Feed panel: " + s);
});
assert.ok(!/btn|button|summary|#tower-files|commune-paper|times|seedops-demo-badge|#4a1d12/i.test(block), "no button, Times or badge rules");
assert.ok(!/#ED9300|yellow|amber|#ff[cd]/i.test(block), "no yellow");
(block.match(/color:\s*[^;]+/g) || []).forEach(function (c) { assert.ok(/#d9d2f0|#f7f9ff/i.test(c), "colours only from site tokens: " + c); });
assert.ok(/\.seedops-demo-badge \{\s*color: #4a1d12 !important;/.test(css), "Demo badge color unchanged");
console.log("tower-feed-contrast.test.js ok");
