/**
 * 10/4 Cognation top-bar look lock: dark letters #1c1630 on the lilac ombre bar,
 * thin dark underline on the active tab, no fill. Main top-row tabs only.
 * Run: node js/topbar-dark-letters.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");

var DARK = "#1c1630";

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Every top-level rule whose selector list is exactly `selector` (whitespace-normalized). */
function rulesFor(selector) {
  var want = selector.replace(/\s+/g, " ").trim();
  var out = [];
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(css))) {
    var sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    if (sel === want) out.push({ at: m.index, body: m[2] });
  }
  return out;
}
function last(selector) {
  var list = rulesFor(selector);
  assert.ok(list.length, "rule present: " + selector);
  return list[list.length - 1];
}
function decl(body, prop) {
  var m = body.match(new RegExp("(?:^|[;\\s])" + escapeRe(prop) + "\\s*:\\s*([^;]+);"));
  return m ? m[1].replace(/!important/, "").replace(/\s+/g, " ").trim() : null;
}

var TABS = '.app-topbar .tablist [role="tab"], .app-topbar-shortcut';
var HOVER = '.app-topbar .tablist [role="tab"]:hover, .app-topbar .tablist [role="tab"]:focus-visible, .app-topbar-shortcut:hover, .app-topbar-shortcut:focus-visible';
var ACTIVE = '.app-topbar .tablist [role="tab"][aria-selected="true"], body.is-circle-open .app-topbar-shortcut[data-tower-anchor="circle"]';

/* Top row is still TOWER · SIGNAL · COMMUNE · CIRCLE. */
assert.ok(/id="tab-tower"[^>]*>TOWER</.test(html) && /id="tab-signal"[^>]*>SIGNAL</.test(html) && /id="tab-commune"[^>]*>COMMUNE</.test(html), "top-row tabs");
assert.ok(/class="app-topbar-shortcut" data-tower-anchor="circle">CIRCLE</.test(html), "CIRCLE shortcut");

/* Inactive top-row labels: #1c1630 at 70% on the text color (not element opacity), no fill,
   2px underline slot, no text-shadow (Designer 2026-10-07). */
var tabs = last(TABS);
assert.strictEqual(decl(tabs.body, "color"), "rgba(28, 22, 48, 0.7)", "inactive tabs #1c1630 at 70%");
assert.strictEqual(decl(tabs.body, "opacity"), null, "70% is on color, not element opacity");
assert.strictEqual(decl(tabs.body, "text-shadow"), "none", "no text-shadow on inactive tabs");
assert.strictEqual(decl(tabs.body, "background"), "transparent", "no fill");
assert.strictEqual(decl(tabs.body, "border-bottom"), "2px solid transparent", "thin underline slot, transparent when inactive");

/* Active tab: same dark letters + thin dark underline, no fill, no glow. */
var active = last(ACTIVE);
assert.strictEqual(decl(active.body, "color"), DARK, "active letters dark");
assert.strictEqual(decl(active.body, "border-bottom-color"), DARK, "active underline is the dark lock color");
assert.strictEqual(decl(active.body, "background"), "transparent", "active has no fill");
assert.strictEqual(decl(active.body, "box-shadow"), "none", "active has no glow");
assert.strictEqual(decl(active.body, "text-shadow"), "none", "no text-shadow on the active tab");
assert.strictEqual(decl(active.body, "opacity"), null, "active stays full strength");

/* Hover keeps dark letters (no white flash) and the existing hover underline. */
var hover = last(HOVER);
assert.strictEqual(decl(hover.body, "color"), DARK, "hover letters stay dark");
assert.strictEqual(decl(hover.body, "border-bottom-color"), "rgba(28, 22, 48, 0.4)", "hover underline #1c1630 at 40%");
assert.strictEqual(decl(hover.body, "text-shadow"), "none", "no text-shadow on hover");

/* The lock rules are the last word: no later top-level rule recolors the top-row tabs. */
var lockAt = Math.max(tabs.at, active.at, hover.at);
var re = /([^{}]+)\{([^{}]*)\}/g;
var m;
while ((m = re.exec(css))) {
  if (m.index <= lockAt) continue;
  var sel = m[1].replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/\.app-topbar \.tablist \[role="tab"\]|\.app-topbar-shortcut/.test(sel)) continue;
  assert.ok(!/(^|[;\s])color\s*:/.test(m[2]), "later rule recolors top-row tabs: " + sel.trim());
}

/* Out of scope: COGNATION | WAYMAKERS switch, Log out, and the #64 sub-switch rules stay white. */
assert.strictEqual(decl(last(".site-switch-side.is-active, .site-switch-side[aria-current=\"page\"]").body, "color"), "#fff", "COGNATION | WAYMAKERS active stays white");
assert.strictEqual(decl(last(".app-topbar-actions .app-logout-btn").body, "color"), "#fff", "Log out stays white");
var pipe = css.slice(css.indexOf("/* ===== Shared pipe-switch sides"));
assert.ok(pipe.length > 100 && pipe.indexOf(DARK) === -1, "#64 scoped sub-switch block untouched by the dark lock");
assert.ok(!/\.site-switch[^{]*\{[^}]*1c1630/.test(css), "no site-switch rule uses the dark lock color");
assert.ok(!/\.tower-kind-btn[^{]*\{[^}]*1c1630/.test(css), "Tower kind buttons untouched");
assert.ok(!/\.signal-subtab[^{]*\{[^}]*1c1630/.test(css), "SIGNAL subtabs untouched");

/* Lilac ombre bar itself unchanged. */
assert.ok(/\.app-topbar,\s*\.tabs\.tabs--chrome:has\(#panel-signal:not\(\[hidden\]\)\) \.app-topbar,[\s\S]*?rgba\(232, 214, 245, 0\.98\) 0%,\s*rgba\(244, 220, 238, 0\.97\) 42%,\s*rgba\(255, 220, 232, 0\.96\) 100%/.test(css), "lilac ombre bar unchanged");

console.log("topbar-dark-letters.test.js: OK");
