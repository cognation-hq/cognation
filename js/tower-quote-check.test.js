/**
 * #223 follow-ups (Oct 22): Quote sticker text is public, so it goes through
 * the same word check Tower posts use (CognationAutoRate.rate must be G/PG and
 * CognationAgeFloor.isAdultKeyword must be false) before it saves. A blocked
 * quote writes nothing (no server row, no localStorage cache) and shows a
 * message; visitors never see a stored quote that fails the check. Also covers
 * the Designer LOOK NO: quote position saved from the canvas top-left (yPx),
 * no grid lift on a quote drag, clamp clear of widgets, one glass style.
 * Run: node js/tower-quote-check.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var syncSrc = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var autoRate = require("./auto-rate.js");
var ageFloor = require("./age-floor-keywords.js");
function J(x) { return JSON.parse(JSON.stringify(x)); }
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

/* A tiny page: the real check, the real addQuoteSticker, recorded saves. */
function page(withHelpers) {
  var saves = [];
  var renders = [];
  var store = { quoteStickers: [] };
  var win = {};
  if (withHelpers !== false) {
    win.CognationAutoRate = autoRate;
    win.CognationAgeFloor = ageFloor;
  }
  var ctx = {
    window: win,
    Math: Math,
    Date: Date,
    isFinite: isFinite,
    String: String,
    TowerProfileStore: {
      get: function () { return JSON.parse(JSON.stringify(store)); },
      save: function (p, opts) { saves.push({ p: J(p), opts: opts }); store = J(p); },
    },
    getQuoteStickers: function (p) { return (p && p.quoteStickers) || []; },
    renderQuoteStickers: function (root, p) { renders.push(J(p.quoteStickers)); },
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc("quoteTextAllowed") + "\n" + fnSrc("uidQuote") + "\n" + fnSrc("addQuoteSticker"), ctx);
  return { ctx: ctx, saves: saves, renders: renders };
}

/* 1. Blocked quote: no save at all (server upload and cache both go through save). */
(function blockedQuoteWritesNothing() {
  var pg = page();
  ["free porn here", "nude pics", "buy cocaine now"].forEach(function (t) {
    var r = pg.ctx.addQuoteSticker({}, t, { x: 10, y: 10 });
    assert.deepStrictEqual(J(r), { blocked: true }, "blocked: " + t);
  });
  assert.strictEqual(pg.saves.length, 0, "a blocked quote never reaches TowerProfileStore.save");
  assert.strictEqual(pg.renders.length, 0, "a blocked quote is not drawn");
})();

/* 2. Clean quote saves (once) with its yPx canvas offset. */
(function cleanQuoteSaves() {
  var pg = page();
  var r = pg.ctx.addQuoteSticker({}, "Keep going, you are doing great", { x: 40, y: 30, yPx: 296 });
  assert.ok(r && !r.blocked && r.id, "clean quote returns its entry");
  assert.strictEqual(pg.saves.length, 1, "one save");
  var q = pg.saves[0].p.quoteStickers[0];
  assert.strictEqual(q.text, "Keep going, you are doing great");
  assert.strictEqual(q.yPx, 296, "yPx kept");
})();

/* 3. Fails closed when a helper is missing (never publishes unchecked text). */
(function failsClosed() {
  var pg = page(false);
  assert.deepStrictEqual(J(pg.ctx.addQuoteSticker({}, "hello there", {})), { blocked: true });
  assert.strictEqual(pg.saves.length, 0);
})();

/* 4. The dialog shows the message and stays open on a block. */
(function dialogShowsMessage() {
  assert.ok(/QUOTE_BLOCKED_MESSAGE\s*=\s*"This quote wasn't saved\./.test(tower), "message text");
  var i = tower.indexOf("data-tower-add-quote-status");
  assert.ok(i > 0, "dialog status line");
  var block = tower.slice(i - 1500, i + 1500);
  assert.ok(/added\s*&&\s*added\.blocked/.test(block), "confirm checks blocked");
  assert.ok(/setProfileStatusOn\(root,\s*QUOTE_BLOCKED_MESSAGE,\s*true\)/.test(block), "same status line as the profile, marked as an error");
  assert.ok(/role",\s*"status"/.test(block), "announced to screen readers");
})();

/* 5. Visitors never see a stored quote that fails the check. */
(function visitorsSkipFailingQuotes() {
  var src = fnSrc("renderQuoteStickers");
  assert.ok(/ownerView\s*=\s*isTowerOwner\(p\)/.test(src), "owner flag");
  assert.ok(/!ownerView\s*&&\s*!quoteTextAllowed\(q\.text\)/.test(src), "non-owners skip failing quotes");
})();

/* 6. LayoutSync drops failing quotes on load and upload, and keeps yPx. */
(function syncFiltersAndKeepsYPx() {
  var win = { CognationTowerQuoteAllowed: function (t) { return !/porn/i.test(t); } };
  var ctx = { window: win, self: win, globalThis: win, console: console };
  vm.createContext(ctx);
  vm.runInContext(syncSrc, ctx);
  var clean = win.CognationTowerLayoutSync._cleanWidgets;
  var out = J(clean({
    quoteStickers: [
      { id: "q1", text: "hello", x: 74.1, y: 37.6, yPx: 295.4, z: 10, tilt: 0 },
      { id: "q2", text: "free porn here", x: 10, y: 10, z: 10, tilt: 0 },
    ],
  }));
  assert.strictEqual(out.quoteStickers.length, 1, "failing quote dropped");
  assert.strictEqual(out.quoteStickers[0].yPx, 295, "yPx rounded and kept");
})();

/* 7. Designer LOOK NO: a quote drag never lifts the default grid, and the drop
      is clamped clear of widgets and saved as an offset from the canvas. */
(function dragAndClamp() {
  assert.ok(/wid !== "quote" && liftDefaultGrid\(stage\)/.test(tower), "quote drag skips the grid lift");
  var i = tower.indexOf('if (id === "quote") {\n          var qid');
  assert.ok(i > 0);
  var br = tower.slice(i, i + 1800);
  assert.ok(/keepQuoteClear\(stage, sticker\)/.test(br), "clamped at drop");
  assert.ok(/moved\.yPx = Math\.round\(qYpx\)/.test(br), "yPx saved");
  var clamp = fnSrc("keepQuoteClear");
  assert.ok(/data-tower-widget/.test(clamp) && /isPhoneStage/.test(clamp), "blocks every widget; phones stack");
  var render = fnSrc("renderQuoteStickers");
  assert.ok(/stickerYFromLayout\(q, stageH\)/.test(render), "restored the same way");
  assert.ok(/watchQuotesClear\(stage\)/.test(render), "clamped on every render");
})();

/* 8. One glass style for every quote (owner, visitor, as added, after reload). */
(function glassStyle() {
  var i = css.indexOf("Quote sticker = one glass pill");
  assert.ok(i > 0);
  var blk = css.slice(i, i + 2000);
  assert.ok(/background:\s*rgba\(18, 16, 38, 0\.92\)/.test(blk));
  assert.ok(/backdrop-filter:\s*blur\(12px\)/.test(blk));
  assert.ok(/border:\s*1px solid rgba\(217, 210, 240, 0\.4\)/.test(blk));
  assert.ok(/color:\s*#f7f9ff/.test(blk));
  assert.ok(/font-family:\s*var\(--cgn-ui/.test(blk));
  assert.ok(!/#ED9300/i.test(blk), "no yellow");
})();

console.log("tower-quote-check tests passed");
