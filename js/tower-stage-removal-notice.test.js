/**
 * Remove with Edit profile closed (PM, Oct 22): the same removal line shows as
 * a short dark glass notice at the end of the owner-only toolbar above the
 * Tower stage (768px and up), or a fixed notice at the bottom of the viewport
 * below 768px so nothing moves (Designer LOOK on #247). ~4s, a new removal
 * replaces it, never alongside the Edit profile status line, never for
 * visitors, no writes, no new controls. Removal lines use a period, not a dash.
 * Run: node js/tower-stage-removal-notice.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
function blockFrom(start) {
  var depth = 0, i = tower.indexOf("{", start);
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
function fnSrc(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  return blockFrom(start);
}

/* 1. Markup: one notice, inside the owner-only toolbar, hidden, a status line, not a control. */
var barAt = html.indexOf("data-tower-scrapbook-bar");
var barEnd = html.indexOf("data-tower-public-look", barAt);
var noticeAt = html.indexOf("data-tower-stage-notice");
assert.ok(noticeAt > barAt && noticeAt < barEnd, "notice sits in the toolbar above the stage");
assert.strictEqual(html.split("data-tower-stage-notice").length, 2, "one notice");
var tag = html.slice(html.lastIndexOf("<", noticeAt), html.indexOf(">", noticeAt) + 1);
assert.ok(/^<p /.test(tag) && /role="status"/.test(tag) && /aria-live="polite"/.test(tag) && / hidden>$/.test(tag), "hidden <p> status line: " + tag);
assert.ok(/class="tower-hidden-widget-notice tower-stage-notice"/.test(tag), "reuses the dark glass notice class");
assert.ok(/\[data-tower-app\]:not\(\[data-tower-is-owner="true"\]\) \[data-tower-scrapbook-bar\]/.test(css), "toolbar (and so the notice) is owner-only");

/* 2. Styles: same dark glass rule as the Show hidden widgets notice. */
var glass = /#panel-tower \.tower-stage-notice\.tower-hidden-widget-notice,\s*#panel-tower \.tower-profile-edit-dropdown\.tower-profile-edit-dropdown \.tower-hidden-widget-notice \{([^}]*)\}/.exec(css);
assert.ok(glass, "stage notice shares the glass rule");
[/background: rgba\(18, 16, 38, 0\.92\)/, /-webkit-backdrop-filter: blur\(12px\)/, /[^-]backdrop-filter: blur\(12px\)/, /border: 1px solid rgba\(217, 210, 240, 0\.4\)/,
 /color: #f7f9ff/, /font-size: 14px/, /border-radius: 8px/, /padding: 10px 12px/].forEach(function (re) {
  assert.ok(re.test(glass[1]), "glass " + re);
});
var place = /\.tower-scrapbook-bar\.tower-scrapbook-bar \.tower-hidden-widget-notice\.tower-stage-notice \{([^}]*)\}/.exec(css);
assert.ok(place && /margin: -5px 0 -5px auto !important/.test(place[1]) && !/position:\s*(absolute|fixed)/.test(place[1]), "in flow at the toolbar's end, not floated over the stage");
assert.ok(/#panel-tower \.tower-stage-notice\[hidden\],\s*\[data-tower-app\]:not\(\[data-tower-is-owner="true"\]\) \[data-tower-stage-notice\] \{\s*display: none !important;/.test(css), "hidden really hides; never for visitors wherever it sits");

/* 2b. Below 768: fixed at the bottom of the viewport, out of the toolbar flow, so
   the stage top and the toolbar height stay the same before, during and after
   (measured in the browser by /workspace/stage-notice-shots/v2/shot.mjs). */
var SEL = "#panel-tower \\[data-tower-app\\] > \\.tower-hidden-widget-notice\\.tower-stage-notice";
var narrowAt = css.indexOf("@media (max-width: 767.98px) {", css.indexOf("tower-stage-notice"));
assert.ok(narrowAt > 0, "below-768 block");
var narrow = blockFromCss(narrowAt);
function blockFromCss(start) {
  var depth = 0, i = css.indexOf("{", start);
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) break;
  }
  return css.slice(start, i + 1);
}
var fixed = new RegExp(SEL + " \\{([^}]*)\\}").exec(narrow);
assert.ok(fixed, "below-768 notice rule");
var f = fixed[1];
assert.ok(/position: fixed !important/.test(f), "position: fixed (out of flow: the toolbar height and stage top cannot change)");
assert.ok(/margin: 0 !important/.test(f), "no flow margins");
assert.ok(/left: 50%/.test(f) && /transform: translate\(-50%, 8px\)/.test(f), "centred, starts 8px low");
assert.ok(/max-width: calc\(100% - 32px\)/.test(f), "max-width calc(100% - 32px)");
assert.ok(/bottom: calc\(16px \+ env\(safe-area-inset-bottom\)\)/.test(f), "bottom: 16px + safe area");
var z = /z-index: (\d+)/.exec(f);
assert.ok(z && +z[1] > 100, "z-index above the stage");
assert.ok(/transition: opacity 160ms ease, transform 160ms ease/.test(f), "160ms fade and slide");
assert.ok(/opacity: 0/.test(f) && /pointer-events: none/.test(f), "starts hidden; not a control");
var inRule = new RegExp(SEL + "\\.is-in \\{([^}]*)\\}").exec(narrow);
assert.ok(inRule && /opacity: 1/.test(inRule[1]) && /translate\(-50%, 0\)/.test(inRule[1]), "in state");
var rmAt = css.indexOf("@media (max-width: 767.98px) and (prefers-reduced-motion: reduce) {");
assert.ok(rmAt > 0, "reduced-motion block");
var rm = new RegExp(SEL + " \\{([^}]*)\\}").exec(blockFromCss(rmAt));
assert.ok(rm && /transition: none/.test(rm[1]) && /transform: translate\(-50%, 0\)/.test(rm[1]) && /opacity: 1/.test(rm[1]), "reduced motion: no slide, no transition");
var desk = /\.tower-scrapbook-bar\.tower-scrapbook-bar \.tower-hidden-widget-notice\.tower-stage-notice \{([^}]*)\}/.exec(css.slice(0, narrowAt));
assert.ok(desk && !/position/.test(desk[1]), "768 and up: unchanged, in the toolbar row");

/* 3. Behaviour. */
function el() {
  var cls = {};
  return { hidden: true, textContent: "", offsetWidth: 0, parentNode: null,
    classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } } };
}
var ctx = { saves: 0, timers: [], cleared: [], owner: true, narrow: false, reduce: false };
vm.createContext(ctx);
vm.runInContext([
  "var STAGE_REMOVAL_NOTICE_MS = 4000;",
  "var STAGE_REMOVAL_NOTICE_FADE_MS = 160;",
  "var window = { matchMedia: function (q) { return { matches: /max-width: 767/.test(q) ? narrow : /reduce/.test(q) ? reduce : false }; } };",
  "function requestAnimationFrame(fn) { fn(); }",
  "function setTimeout(fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }",
  "function clearTimeout(t) { cleared.push(t); }",
  "function isTowerOwner(p) { return !!(p && p.owner); }",
  "var TowerProfileStore = { get: function () { return { owner: owner }; }, save: function () { saves++; return true; } };",
  fnSrc("stageNoticeNarrow"), fnSrc("stageNoticeAnimates"), fnSrc("placeStageRemovalNotice"), fnSrc("clearStageRemovalNotice"), fnSrc("showStageRemovalNotice"),
].join("\n"), ctx);
var notice = el(), panel = el();
function host(name) { return { name: name, appendChild: function (c) { c.parentNode = this; } }; }
var bar = host("bar");
notice.parentNode = bar;
ctx.root = {
  name: "app",
  appendChild: function (c) { c.parentNode = this; },
  querySelector: function (sel) {
    if (sel === "[data-tower-stage-notice]") return notice;
    if (sel === "[data-tower-profile-edit-panel]") return panel;
    return null;
  },
};
var line = "Music removed. Show it again in Edit profile.";
ctx.showStageRemovalNotice(ctx.root, line);
assert.strictEqual(notice.hidden, false, "shows with Edit profile closed");
assert.strictEqual(notice.parentNode.name, "bar", "768 and up: stays in the toolbar row");
assert.ok(notice.classList.contains("is-in"), "shown state");
assert.strictEqual(notice.textContent, line, "same copy as the status line");
assert.strictEqual(ctx.timers.length, 1);
assert.strictEqual(ctx.timers[0].ms, 4000, "clears after 4s");

ctx.showStageRemovalNotice(ctx.root, "Badges removed. Show it again in Edit profile.");
assert.strictEqual(notice.textContent, "Badges removed. Show it again in Edit profile.", "a new removal replaces it");
assert.deepStrictEqual(Array.from(ctx.cleared), [1], "old timer cancelled");
ctx.timers[1].fn();
assert.strictEqual(notice.hidden, true, "768 and up: cleared after 4s, at once (unchanged)");
assert.strictEqual(notice.textContent, "");
assert.ok(!notice.classList.contains("is-in"));

/* Below 768: 160ms fade out before it hides; a new removal during the fade keeps it. */
ctx.narrow = true;
ctx.timers.length = 0;
ctx.showStageRemovalNotice(ctx.root, line);
assert.ok(notice.classList.contains("is-in") && !notice.hidden, "narrow: fades in");
assert.strictEqual(notice.parentNode.name, "app", "narrow: sits in the app root (outside the backdrop-filter side) so fixed means the viewport");
ctx.timers[0].fn();
assert.ok(!notice.classList.contains("is-in") && !notice.hidden, "narrow: fading out, still in the DOM");
assert.strictEqual(ctx.timers[1].ms, 160, "fade out is 160ms");
ctx.timers[1].fn();
assert.strictEqual(notice.hidden, true, "narrow: hidden after the fade");
assert.strictEqual(notice.parentNode.name, "bar", "back in the toolbar once it clears");
ctx.timers.length = 0;
ctx.showStageRemovalNotice(ctx.root, line);
ctx.timers[0].fn();
ctx.showStageRemovalNotice(ctx.root, "Quote removed.");
assert.ok(ctx.cleared.indexOf(2) >= 0, "a removal during the fade cancels the fade");
assert.ok(!notice.hidden && notice.textContent === "Quote removed." && notice.classList.contains("is-in"), "new line shows");
ctx.clearStageRemovalNotice(ctx.root, true);

/* Reduced motion below 768: no fade, hides at once. */
ctx.reduce = true;
ctx.timers.length = 0;
ctx.showStageRemovalNotice(ctx.root, line);
ctx.timers[0].fn();
assert.strictEqual(notice.hidden, true, "reduced motion: no fade timer, hides at once");
assert.strictEqual(ctx.timers.length, 1);
ctx.reduce = false;
ctx.narrow = false;

panel.hidden = false;
ctx.showStageRemovalNotice(ctx.root, line);
assert.strictEqual(notice.hidden, true, "Edit profile open: status line only, no stage notice");
panel.hidden = true;

ctx.owner = false;
ctx.showStageRemovalNotice(ctx.root, line);
assert.strictEqual(notice.hidden, true, "never for visitors");
assert.strictEqual(ctx.saves, 0, "display only: no writes");

/* 4. Wiring: every real Remove line goes to the stage too; the pay-links hint (nothing removed) does not. */
var safe = blockFrom(tower.indexOf("function setProfileStatusSafe(msg, isError, removal)"));
assert.ok(/if \(removal\) showStageRemovalNotice\(root, msg\);/.test(safe), "status helper forwards Remove lines");
var removeFn = blockFrom(tower.indexOf("var removeSelectedWidget = function"));
var calls = removeFn.match(/setProfileStatusSafe\([\s\S]*?\);/g) || [];
var removal = calls.filter(function (c) { return /,\s*true\s*\)\s*;$/.test(c); });
assert.strictEqual(removal.length, calls.length - 1, "all but one line are removal lines");
calls.forEach(function (c) {
  if (/Venmo, Pay for services/.test(c)) assert.ok(!/,\s*true\s*\)\s*;$/.test(c), "pay-links hint stays in Edit profile only");
  else assert.ok(/ removed/.test(c), "removal line: " + c);
  assert.ok(c.indexOf("—") < 0, "period, not a dash: " + c);
});
["\"Friend pin removed. Reset layout to restore.\"", "label + \" removed. Reset layout to restore.\"",
 "\"Camera removed. Reset layout to restore.\"", "label + \" removed. Show it again in Edit profile.\""].forEach(function (str) {
  assert.ok(removeFn.indexOf(str) > 0, "copy: " + str);
});
assert.ok(/if \(!id \|\| id === "avatar" \|\| id === "feed" \|\| id === "messages"\) return;/.test(removeFn), "Messages envelope: unchanged (not removable)");

/* 5. Opening Edit profile clears it (never both). */
var edit = tower.slice(tower.indexOf("function initProfileEditDropdown"), tower.indexOf("function initFramePicker"));
assert.ok(/if \(open\) \{[\s\S]{0,500}clearStageRemovalNotice\(root, true\)[\s\S]{0,40}\} else \{/.test(edit), "opening Edit profile clears the stage notice");

console.log("tower-stage-removal-notice: ok");
