/**
 * #223 Part B (Oct 22): the Quote sticker renders at its saved x / y / yPx for
 * the owner and for visitors alike. Render never nudges it and never saves:
 * the only move off a widget is the owner's drop, which is what gets saved.
 * Quotes never write the shared layout.quote key (lift/freeze skip them, tilt
 * saves to the quote's own quoteStickers entry).
 * Run: node js/tower-223-quote-spot.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
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

/* 1. Quotes never write layout.quote. */
assert.ok(/isAddedSticker\(/.test(fnSrc("liftDefaultGrid")), "grid lift skips quote stickers");
assert.ok(/isAddedSticker\(/.test(fnSrc("freezeSpawnedWidgets")), "freeze skips quote stickers");
var tiltAt = tower.indexOf('if (wid === "quote" && tiltQuoteId)');
assert.ok(tiltAt > 0, "tilt has a quote branch");
var tiltBr = tower.slice(tiltAt, tiltAt + 600);
assert.ok(/p\.quoteStickers = getQuoteStickers\(p\)/.test(tiltBr) && /nq\.tilt = tilt/.test(tiltBr), "tilt saves to the quote's own entry");
assert.ok(tiltBr.indexOf("return;") < tiltBr.indexOf("freezeSpawnedWidgets") || tiltBr.indexOf("freezeSpawnedWidgets") < 0, "tilt returns before the layout write");

/* 2. No auto-write: nothing in render schedules or performs a save. */
assert.ok(tower.indexOf("scheduleQuoteSpotSave") < 0, "no auto-save of nudged spots");
var kqs = fnSrc("keepQuotesClear");
assert.ok(!/TowerProfileStore\.save|keepQuoteClear\(|setTimeout/.test(kqs), "render path never nudges or saves");
assert.ok(/el\.__cognationQuoteSpot = \{ x: q\.x/.test(fnSrc("renderQuoteStickers")), "render remembers the saved spot");

/* 3. Owner and visitor both land on the saved x. */
function run(owner) {
  var c = {
    calls: 0, saves: 0,
    TowerProfileStore: { get: function () { return { owner: owner }; }, save: function () { c.saves++; } },
    isTowerOwner: function (p) { return !!p.owner; },
    keepQuoteClear: function (stage, el) { c.calls++; el.setAttribute("data-sticker-x", "8.6"); return true; },
  };
  vm.createContext(c);
  vm.runInContext(kqs, c);
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
  return { x: attrs["data-sticker-x"], calls: c.calls, saves: c.saves };
}
[false, true].forEach(function (owner) {
  var r = run(owner);
  var who = owner ? "owner" : "visitor";
  assert.strictEqual(r.x, "40", who + ": saved x");
  assert.strictEqual(r.calls, 0, who + ": no nudge on render");
  assert.strictEqual(r.saves, 0, who + ": nothing saved");
});

console.log("tower-223-quote-spot: ok");
