/**
 * #223 (Oct 22): removing the owner's Instax camera saves server-side and
 * survives reload; Undo / Reset layout bring it back. The Quote sticker sits at
 * the same x for the owner and for visitors: visitors show the saved spot as-is
 * (no per-viewer nudge), the owner's clear-check result is saved, and quotes
 * never write a shared layout.quote (lift/freeze/tilt skip them).
 * Run: node js/tower-223-instax-quote.test.js
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
assert.ok(/publicWidgets\.instax = true/.test(tower), "Reset layout turns it back on");
assert.ok(/instaxRemoved\(p\)/.test(fnSrc("ensurePersonalPolaroid")), "camera stays hidden after reload when removed");

/* 3. Quotes never write layout.quote. */
assert.ok(/isAddedSticker\(/.test(fnSrc("liftDefaultGrid")), "grid lift skips quote stickers");
assert.ok(/isAddedSticker\(/.test(fnSrc("freezeSpawnedWidgets")), "freeze skips quote stickers");
var kq = fnSrc("keepQuoteClear");
assert.ok(/instax/.test(kq), "owner-only camera is not a Quote blocker");

/* 4. Visitors show the saved spot; only the owner's nudge moves (and saves). */
function run(owner) {
  var c = {
    calls: 0, scheduled: null,
    TowerProfileStore: { get: function () { return { owner: owner }; } },
    isTowerOwner: function (p) { return !!p.owner; },
    keepQuoteClear: function (stage, el) { c.calls++; el.setAttribute("data-sticker-x", "8.6"); return true; },
    scheduleQuoteSpotSave: function (s, els) { c.scheduled = els.length; },
  };
  vm.createContext(c);
  vm.runInContext(fnSrc("keepQuotesClear"), c);
  var attrs = { "data-sticker-x": "8.6" };
  var el = {
    __cognationQuoteSpot: { x: 40, yCss: "640px", yPct: 60 },
    classList: { contains: function () { return false; } },
    style: { setProperty: function () {} },
    setAttribute: function (k, v) { attrs[k] = v; },
    removeAttribute: function (k) { delete attrs[k]; },
    getAttribute: function (k) { return attrs[k]; },
  };
  c.keepQuotesClear({ querySelectorAll: function () { return [el]; } });
  return { x: attrs["data-sticker-x"], calls: c.calls, scheduled: c.scheduled };
}
var v = run(false);
assert.strictEqual(v.x, "40", "visitor: back at the saved x, no nudge");
assert.strictEqual(v.calls, 0, "visitor: no clear-check");
assert.strictEqual(v.scheduled, null, "visitor: nothing saved");
var o = run(true);
assert.strictEqual(o.calls, 1, "owner: clear-check runs");
assert.strictEqual(o.scheduled, 1, "owner: nudged spot is saved so visitors match");
assert.ok(/isTowerOwner\(p\)/.test(fnSrc("scheduleQuoteSpotSave")), "only the owner saves");

console.log("tower-223-instax-quote: ok");
