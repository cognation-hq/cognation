/**
 * Remove with Edit profile closed (PM, Oct 22): the same removal line shows as
 * a short dark glass notice at the end of the owner-only toolbar above the
 * Tower stage. ~4s, a new removal replaces it, never alongside the Edit profile
 * status line, never for visitors, no writes, no new controls.
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
var glass = /#panel-tower \.tower-scrapbook-bar \.tower-stage-notice\.tower-hidden-widget-notice,\s*#panel-tower \.tower-profile-edit-dropdown\.tower-profile-edit-dropdown \.tower-hidden-widget-notice \{([^}]*)\}/.exec(css);
assert.ok(glass, "stage notice shares the glass rule");
[/background: rgba\(18, 16, 38, 0\.92\)/, /-webkit-backdrop-filter: blur\(12px\)/, /[^-]backdrop-filter: blur\(12px\)/, /border: 1px solid rgba\(217, 210, 240, 0\.4\)/,
 /color: #f7f9ff/, /font-size: 14px/, /border-radius: 8px/, /padding: 10px 12px/].forEach(function (re) {
  assert.ok(re.test(glass[1]), "glass " + re);
});
var place = /\.tower-scrapbook-bar\.tower-scrapbook-bar \.tower-hidden-widget-notice\.tower-stage-notice \{([^}]*)\}/.exec(css);
assert.ok(place && /margin: -5px 0 -5px auto !important/.test(place[1]) && !/position:\s*(absolute|fixed)/.test(place[1]), "in flow at the toolbar's end, not floated over the stage");
assert.ok(/\.tower-scrapbook-bar \.tower-stage-notice\[hidden\] \{\s*display: none !important;/.test(css), "hidden really hides");

/* 3. Behaviour. */
function el(attrs) {
  return { hidden: true, textContent: "", attrs: attrs || {} };
}
var ctx = { saves: 0, timers: [], cleared: [], owner: true };
vm.createContext(ctx);
vm.runInContext([
  "var STAGE_REMOVAL_NOTICE_MS = 4000;",
  "function setTimeout(fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }",
  "function clearTimeout(t) { cleared.push(t); }",
  "function isTowerOwner(p) { return !!(p && p.owner); }",
  "var TowerProfileStore = { get: function () { return { owner: owner }; }, save: function () { saves++; return true; } };",
  fnSrc("clearStageRemovalNotice"), fnSrc("showStageRemovalNotice"),
].join("\n"), ctx);
var notice = el(), panel = el();
ctx.root = {
  querySelector: function (sel) {
    if (sel === "[data-tower-stage-notice]") return notice;
    if (sel === "[data-tower-profile-edit-panel]") return panel;
    return null;
  },
};
var line = "Music removed — Show it again in Edit profile.";
ctx.showStageRemovalNotice(ctx.root, line);
assert.strictEqual(notice.hidden, false, "shows with Edit profile closed");
assert.strictEqual(notice.textContent, line, "same copy as the status line");
assert.strictEqual(ctx.timers.length, 1);
assert.strictEqual(ctx.timers[0].ms, 4000, "clears after 4s");

ctx.showStageRemovalNotice(ctx.root, "Badges removed — Show it again in Edit profile.");
assert.strictEqual(notice.textContent, "Badges removed — Show it again in Edit profile.", "a new removal replaces it");
assert.deepStrictEqual(Array.from(ctx.cleared), [1], "old timer cancelled");
ctx.timers[1].fn();
assert.strictEqual(notice.hidden, true, "cleared after 4s");
assert.strictEqual(notice.textContent, "");

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
});
assert.ok(/if \(!id \|\| id === "avatar" \|\| id === "feed" \|\| id === "messages"\) return;/.test(removeFn), "Messages envelope: unchanged (not removable)");

/* 5. Opening Edit profile clears it (never both). */
var edit = tower.slice(tower.indexOf("function initProfileEditDropdown"), tower.indexOf("function initFramePicker"));
assert.ok(/if \(open\) \{[\s\S]{0,500}clearStageRemovalNotice\(root\)[\s\S]{0,40}\} else \{/.test(edit), "opening Edit profile clears the stage notice");

console.log("tower-stage-removal-notice: ok");
