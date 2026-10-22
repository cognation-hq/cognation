/**
 * #242 follow-up (Oct 22): Reset layout restores widget positions and the
 * camera only. It keeps the owner's other visibility choices (it used to copy
 * DEFAULT_PUBLIC_WIDGETS over them, turning hidden widgets back on), and the
 * removal status lines no longer point at an Undo control the page does not have.
 * Run: node js/tower-reset-keeps-visibility.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
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
function constSrc(name) {
  var start = tower.indexOf("var " + name + " =");
  assert.ok(start > 0, name + " exists");
  return tower.slice(start, tower.indexOf(";", start) + 1);
}

/* 1. The Reset click handler. */
var resetAt = tower.indexOf('resetBtn.addEventListener("click", function () {');
assert.ok(resetAt > 0, "Reset layout handler exists");
var resetFn = blockFrom(tower.indexOf("function ()", resetAt));
assert.ok(!/DEFAULT_PUBLIC_WIDGETS/.test(resetFn), "Reset no longer copies DEFAULT_PUBLIC_WIDGETS over the owner's flags");
assert.ok(!/p\.publicWidgets\s*=/.test(resetFn), "Reset does not replace publicWidgets");
assert.ok(/setInstaxSwitch\(p, true\)|publicWidgets\.instax = true/.test(resetFn), "Reset still turns the camera on");
assert.ok(/p\.polaroidRemoved = false/.test(resetFn), "Reset still restores the Polaroid");
assert.ok(/p\.widgetLayout = \{\}/.test(resetFn), "Reset still restores positions");

/* 2. Run it: hidden widgets stay hidden, the camera comes back. */
var ctx = { saved: null, statusMsg: "" };
vm.createContext(ctx);
vm.runInContext([
  constSrc("PUBLIC_WIDGET_IDS"),
  "var DEFAULT_PUBLIC_WIDGETS = " + blockFrom(tower.indexOf("{", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS ="))) + ";",
  fnSrc("normalizePublicWidgets"), fnSrc("setInstaxSwitch"),
  "var profile = { _profileId: 'seed-0037', widgetLayout: { music: { x: 9 } }, polaroidRemoved: true,",
  "  publicWidgets: { identity: true, slogan: true, social: false, music: false, badges: false, friends: false, html: false, calendar: true, envelope: true, instax: false },",
  "  removedFriendPinIds: ['f1'], featuredFriendIds: ['f2'] };",
  "var TowerProfileStore = { get: function () { return profile; }, save: function (p) { saved = JSON.parse(JSON.stringify(p)); return true; } };",
  "function isTowerOwner() { return true; }",
  "function writeTopFriendLocal() {}",
  "function applyWidgetLayout() {} function applyPublicWidgets() {} function syncPublicWidgetsForm() {}",
  "function renderFriendPins() {} function renderBadgePins() {} function syncOwnerStickerHandles() {}",
  "function syncUndoButton() {} function setProfileStatusSafe(m) { statusMsg = m; }",
  "var root = {};",
  "var runReset = " + resetFn + ";",
  "runReset();",
].join("\n"), ctx);
var pw = ctx.saved.publicWidgets;
["social", "music", "badges", "friends", "html"].forEach(function (id) {
  assert.strictEqual(pw[id], false, id + " stays hidden after Reset");
});
["identity", "slogan", "calendar", "envelope"].forEach(function (id) {
  assert.strictEqual(pw[id], true, id + " stays shown after Reset");
});
assert.strictEqual(pw.instax, true, "camera is back on after Reset");
assert.strictEqual(ctx.saved.polaroidRemoved, false, "Polaroid back");
assert.strictEqual(Object.keys(ctx.saved.widgetLayout).length, 0, "positions reset");
assert.strictEqual(ctx.saved.removedFriendPinIds.length, 0, "removed friend pins come back");
assert.ok(!/Undo/.test(ctx.statusMsg), "reset status has no Undo");

/* 3. Removal status lines: no Undo (no Undo control renders on the page). */
var removeStart = tower.indexOf("var removeSelectedWidget = function");
assert.ok(removeStart > 0, "removeSelectedWidget exists");
var removeFn = blockFrom(removeStart);
var lines = removeFn.match(/setProfileStatusSafe\([^;]*\);/g) || [];
assert.ok(lines.length >= 7, "status lines found");
lines.forEach(function (l) {
  assert.ok(!/Undo/.test(l), "no Undo in: " + l);
});
assert.ok(removeFn.indexOf('"Camera removed — Reset layout to restore."') > 0, "camera copy");
assert.ok(removeFn.indexOf('"Friend pin removed — Reset layout to restore."') > 0, "friend pin copy (Reset clears removed pins)");
assert.ok(removeFn.indexOf('"Badge pin removed."') > 0, "badge copy (Reset keeps badgeVisibility)");
assert.ok(removeFn.indexOf('"Emoji removed."') > 0, "emoji copy (Reset does not bring stickers back)");
assert.ok(removeFn.indexOf('"Quote removed."') > 0, "quote copy (Reset does not bring quotes back)");
assert.ok(removeFn.indexOf('label + " removed."') > 0, "generic copy (Reset keeps visibility flags)");

console.log("tower-reset-keeps-visibility: ok");
