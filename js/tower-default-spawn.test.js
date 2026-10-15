/**
 * Tower default spawn spots (Designer spec tower-default-layout, LOOK-YES).
 * Free x/y saved format is unchanged; only unplaced widgets get a spawn spot.
 * No overlap, 24px gap, two-column rows on website, one column (16px sides) on phone.
 * Run: node js/tower-default-spawn.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

function grab(startMarker, endMarker) {
  var a = tower.indexOf(startMarker);
  var b = tower.indexOf(endMarker, a);
  assert.ok(a !== -1 && b > a, "found " + startMarker);
  return tower.slice(a, b);
}
var code = grab("  var SPAWN_GAP = 24;", "  /* Place every visible, unplaced widget");
var ctx = vm.createContext({});
vm.runInContext(code + "\nthis.packSpawn = packSpawn; this.SPAWN_ROWS = SPAWN_ROWS; this.isFactorySeedPos = isFactorySeedPos; this.rectsOverlap = rectsOverlap;", ctx);

/* Spec order. */
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.SPAWN_ROWS.personal)),
  [["avatar"], ["identity"], ["slogan"], ["music"], ["social", "badges"], ["friends", "calendar"], ["polaroid", "html"], ["instax"]]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.SPAWN_ROWS.professional)),
  [["avatar"], ["identity"], ["slogan"], ["youtube"], ["social", "badges"], ["calendar", "html"]]);
assert.ok(!/going-live/.test(JSON.stringify(ctx.SPAWN_ROWS)), "Going live is not a public default");
assert.ok(JSON.stringify(ctx.SPAWN_ROWS.professional).indexOf("music") === -1, "no music on Professional");

function sizes(ids) {
  var out = {};
  ids.forEach(function (id, i) { out[id] = { w: 300, h: 120 + i * 13 }; });
  return out;
}
function rects(placed, sz) {
  return Object.keys(placed).filter(function (k) { return k.indexOf("__") !== 0; }).map(function (id) {
    return { id: id, x: placed[id].x, y: placed[id].y, w: Math.min(sz[id].w, placed.__colW), h: sz[id].h };
  });
}
function assertNoOverlap(list, gap) {
  for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
    assert.ok(!ctx.rectsOverlap(list[i], list[j], gap - 0.5), list[i].id + " overlaps " + list[j].id);
  }
}

["personal", "professional"].forEach(function (kind) {
  var rows = ctx.SPAWN_ROWS[kind];
  var ids = [].concat.apply([], rows);
  /* Website (1120 wide): left | right rows, 24px side padding, 24px gap, no overlap. */
  var sz = sizes(ids);
  var d = ctx.packSpawn(rows, sz, [], 1120, false);
  var r = rects(d, sz);
  assertNoOverlap(r, 24);
  assert.strictEqual(d.avatar.x, 24);
  assert.strictEqual(d.social.y, d.badges.y, kind + ": Links | Badges share a row");
  assert.strictEqual(d.badges.x, 24 + (1120 - 48 - 24) / 2 + 24, "right column");
  /* Phone (390): one column, 16px sides, DOM order top to bottom. */
  var p = ctx.packSpawn(rows, sz, [], 390, true);
  var prevBottom = -1;
  ids.forEach(function (id) {
    assert.strictEqual(p[id].x, 16, kind + " phone x " + id);
    assert.ok(p[id].y >= prevBottom + 24 || prevBottom < 0, kind + " phone order + gap " + id);
    prevBottom = p[id].y + sz[id].h;
  });
});

/* Existing (owner-placed) widgets never move; new ones take the next open spot around them. */
var rows = ctx.SPAWN_ROWS.professional;
var sz2 = { social: { w: 300, h: 100 }, badges: { w: 300, h: 100 }, calendar: { w: 300, h: 200 } };
var occupied = [{ x: 24, y: 24, w: 600, h: 400 }];
var out = ctx.packSpawn(rows, sz2, occupied, 1120, false);
var placedRects = rects(out, sz2).concat([Object.assign({ id: "placed" }, occupied[0])]);
assertNoOverlap(placedRects, 24);
assert.strictEqual(occupied[0].y, 24, "placed rect untouched");

/* Old factory seeds count as unplaced (fixes Professional's overlapping defaults); real drops do not. */
assert.strictEqual(ctx.isFactorySeedPos("identity", { x: 4, y: 26 }), true);
assert.strictEqual(ctx.isFactorySeedPos("social", { x: 4, y: 26 }), true);
assert.strictEqual(ctx.isFactorySeedPos("social", { x: 4.3, y: 26.1 }), false);

/* Wiring: spawn runs after layout + visibility, drops freeze the other defaults, format unchanged. */
assert.ok(/spawnUnplacedWidgets\(root, p\);\n  \}\n\n  function collageCellCount/.test(tower), "spawn after applyWidgetLayout");
assert.ok(/applyPublicWidgetsInner\(root, p\);\s*\/\*[^*]*\*\/\s*spawnUnplacedWidgets\(root, p\);/.test(tower), "spawn after visibility");
assert.ok(/freezeSpawnedWidgets\(root, layout\);\s*sticker\.classList\.remove\("is-spawned"\);\s*layout\[id\] = \{\s*x: dropX,\s*y: dropY,/.test(tower), "drop saves free x/y and freezes others");
assert.ok(tower.indexOf("JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT))") === -1, "no factory copy written on save");
assert.ok(/\.is-spawned \{\s*max-width: var\(--spawn-max-w/.test(css), "spawn column width CSS");
console.log("tower-default-spawn.test.js: ok");
