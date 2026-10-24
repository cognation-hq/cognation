/**
 * #223 Part A (Oct 22): removing the owner's Instax camera saves server-side
 * (publicWidgets.instax = false in the layout row) and survives reload;
 * Reset layout turns it back on (Undo has no control on the page).
 * Run: node js/tower-instax-remove-saves.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var syncSrc = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
function fnSrc(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = tower.indexOf("{", start);
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
function varFnSrc(name) {
  var start = tower.indexOf("var " + name + " = function");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = tower.indexOf("{", start);
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
function constSrc(name) {
  var start = tower.indexOf("var " + name + " =");
  assert.ok(start > 0, name + " exists");
  return tower.slice(start, tower.indexOf(";", start) + 1);
}

/* 1. The off switch is kept by normalize and rides the synced switches. */
var ctx = {};
vm.createContext(ctx);
vm.runInContext([constSrc("PUBLIC_WIDGET_IDS"), "var DEFAULT_PUBLIC_WIDGETS = " +
  tower.slice(tower.indexOf("{", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS =")), tower.indexOf("};", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS =")) + 2),
  fnSrc("normalizePublicWidgets"), fnSrc("instaxRemoved"), fnSrc("setInstaxSwitch")].join("\n"), ctx);
assert.strictEqual(ctx.normalizePublicWidgets({ instax: false }).instax, false, "explicit camera-off survives normalize");
assert.ok(!("instax" in ctx.normalizePublicWidgets({})), "no key = camera on (old rows unchanged)");
var prof = { publicWidgets: { calendar: true } };
ctx.setInstaxSwitch(prof, false);
assert.strictEqual(ctx.instaxRemoved(prof), true, "removed");
assert.strictEqual(prof.publicWidgets.calendar, true, "other switches kept");
ctx.setInstaxSwitch(prof, true);
assert.strictEqual(ctx.instaxRemoved(prof), false, "restored");
assert.ok(/KEY_RE/.test(syncSrc), "switch keys pass through the layout sync");

/* 2. Remove / Undo / Reset save the switch. */
var removeFn = varFnSrc("removeSelectedWidget");
var instaxBranch = removeFn.slice(removeFn.indexOf('id === "instax"'), removeFn.indexOf('id === "friends"'));
assert.ok(instaxBranch.length > 0 && removeFn.indexOf('id === "instax"') < removeFn.indexOf('id === "friends"'), "camera has its own remove branch");
assert.ok(/setInstaxSwitch\(\w+, false\)/.test(instaxBranch), "remove turns the switch off");
assert.ok(/TowerProfileStore\.save\(\w+/.test(instaxBranch), "remove saves (the switch change uploads the layout row)");
assert.ok(/type: "instax"/.test(instaxBranch), "remove can be undone");
assert.ok(/entry\.type === "instax"[\s\S]{0,400}setInstaxSwitch\(\w+, true\)/.test(tower), "Undo turns it back on");
assert.ok(/setInstaxSwitch\(p, true\)/.test(tower), "Reset layout turns it back on");
assert.ok(/instaxRemoved\(p\)/.test(fnSrc("ensurePersonalPolaroid")), "camera stays hidden after reload when removed");

console.log("tower-instax-remove-saves: ok");
