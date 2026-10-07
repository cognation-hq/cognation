/**
 * Shared pipe-switch active side (Designer lock 2026-10-07).
 * SIGNAL News | Feed and COMMUNE Personal | Professional active side = COGNATION | WAYMAKERS
 * top switch: same lilac ombre, label color, text-shadow, and label type — values taken from
 * that switch's own rules, scoped so `.site-switch-side { padding: 0 !important }` and the
 * generic `[role="tab"][aria-selected="true"]` fill cannot reach them.
 * Run: node js/pipe-switch-active-side.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function squash(s) {
  return String(s).replace(/\s+/g, " ").trim();
}
function ruleBody(css, selectorRe) {
  var m = css.match(new RegExp(selectorRe.source + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}
function decl(body, prop) {
  var m = body && body.match(new RegExp("(?:^|[;\\s])" + prop + "\\s*:\\s*([^;]+);"));
  return m ? squash(m[1].replace(/!important/, "")) : null;
}

var css = src("css/styles.css");
var html = src("index.html");

/* Source of truth: the top COGNATION | WAYMAKERS switch's own rules. */
var topbar = ruleBody(css, /\/\* ===== Designer lock: lilac ombre topbar[\s\S]*?\.tabs\.tabs--chrome:has\(#panel-commune:not\(\[hidden\]\)\) \.app-topbar/);
assert.ok(topbar, "Designer lilac ombre topbar rule present");
var ombre = decl(topbar, "background");
assert.ok(/linear-gradient\(\s*105deg/.test(ombre), "topbar ombre gradient found");

var topActive = ruleBody(css, /\.site-switch-side\.is-active,\s*\.site-switch-side\[aria-current="page"\]/);
assert.ok(topActive, "top switch active rule present");
var topSide = ruleBody(css, /\n\.site-switch-side/);
assert.ok(topSide, "top switch side rule present");

/* Top switch + Tower kind toggle must stay as they are. */
assert.strictEqual(decl(topSide, "padding"), "0", "top switch side keeps padding 0");
assert.strictEqual(decl(topActive, "color"), "#fff");
assert.ok(/<div class="site-switch" data-site-switch/.test(html), "top switch markup unchanged (no signal-subtabs)");
assert.ok(!/class="site-switch[^"]*signal-subtabs|class="signal-subtabs[^"]*"[^>]*data-site-switch/.test(html), "top switch is not a pill shell");
assert.ok(/class="tower-kind-btn"/.test(html) && !/tower-kind-btn[^"]*site-switch-side/.test(html), "Tower kind buttons do not use site-switch-side");

/* Both pill switches use the shared classes inside their panels. */
function panelSlice(id) {
  var start = html.indexOf('id="' + id + '"');
  assert.ok(start >= 0, id + " present");
  var next = html.indexOf('role="tabpanel"', start + 20);
  return html.slice(start, next > 0 ? next : undefined);
}
assert.ok(/class="signal-subtabs site-switch"/.test(panelSlice("panel-signal")), "SIGNAL switch = signal-subtabs site-switch inside #panel-signal");
assert.ok(/class="commune-mode-switch signal-subtabs site-switch"/.test(panelSlice("panel-commune")), "COMMUNE switch = signal-subtabs site-switch inside #panel-commune");

/* Scoped sides rule: ID-level, beats `.site-switch-side { padding: 0 !important }`. */
var scope = /:is\(#panel-signal, #panel-commune\) \.signal-subtabs\.site-switch > \.site-switch-side/;
var sides = ruleBody(css, new RegExp("\\n" + scope.source));
assert.ok(sides, "scoped side rule present");
assert.ok(/padding:\s*0\.4rem 0\.95rem !important/.test(sides), "pill padding restored with !important");
assert.strictEqual(decl(sides, "padding"), decl(ruleBody(css, /\n\.tower-kind-btn/), "padding"), "pill padding = existing .tower-kind-btn padding");
assert.strictEqual(decl(sides, "font-family"), decl(topSide, "font-family"), "label type = top switch");
assert.strictEqual(decl(sides, "font-weight"), decl(topSide, "font-weight"));
assert.strictEqual(decl(sides, "font-size"), decl(topSide, "font-size"));
assert.strictEqual(decl(sides, "letter-spacing"), decl(topSide, "letter-spacing"));
assert.ok(!/(^|;)\s*color\s*:/.test(sides), "inactive side keeps its muted color (not set here)");

/* Active side = top switch active label on the top switch's lilac ombre. */
var active = ruleBody(css, new RegExp(scope.source + ':is\\(\\.is-active, \\.is-selected, \\[aria-selected="true"\\]\\)'));
assert.ok(active, "scoped active rule present");
assert.strictEqual(decl(active, "background"), ombre, "same lilac ombre stops as the top switch bar");
assert.strictEqual(decl(active, "color"), decl(topActive, "color"), "same active label color");
assert.strictEqual(decl(active, "text-shadow"), decl(topActive, "text-shadow"), "same active text-shadow");
assert.ok(/border-color:\s*transparent !important/.test(active), "no black outline from generic tab rule");
assert.ok(/box-shadow:\s*none !important/.test(active), "no extra glow (top switch has none)");
["color", "text-shadow", "background"].forEach(function (p) {
  assert.ok(new RegExp(p + "\\s*:[^;]*!important").test(active), p + " is !important");
});

/* Scoped rules come after the shared override and the generic tab fill in the cascade. */
var at = css.search(new RegExp("\\n" + scope.source));
assert.ok(at > css.indexOf("\n.site-switch-side {"), "after .site-switch-side override");
assert.ok(at > css.indexOf('[role="tab"][aria-selected="true"]:not(.tower-kind-btn)'), "after generic tab fill");

/* Mobile keeps the same pill geometry as .signal-subtab mobile. */
assert.ok(new RegExp("@media \\(max-width: 640px\\) \\{\\s*" + scope.source + "\\s*\\{[^}]*padding:\\s*0\\.35rem 0\\.75rem !important").test(css), "mobile pill padding");

console.log("pipe-switch-active-side.test.js: OK");
