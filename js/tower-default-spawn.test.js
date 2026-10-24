/**
 * Tower default spawn spots (Designer spec tower-default-layout, LOOK-YES).
 * Free x/y saved format is unchanged; only unplaced widgets get a spawn spot.
 * No overlap, 24px gap (avatar/name/slogan tight as one card), two-column rows on website.
 * Phone (<768px): saved x/y ignored, one column (16px sides), no drag or save.
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
vm.runInContext(code + "\nthis.PROFILE_STACK_GAP = PROFILE_STACK_GAP; this.packSpawn = packSpawn; this.SPAWN_ROWS = SPAWN_ROWS; this.expandSpawnRows = expandSpawnRows; this.isFactorySeedPos = isFactorySeedPos; this.rectsOverlap = rectsOverlap;", ctx);

/* Spec order. */
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.SPAWN_ROWS.personal)),
  [["avatar"], ["identity"], ["slogan"], ["visitor-calendar"], ["music"], ["friends"], ["__socials__"], ["badges", "calendar"], ["polaroid", "html"], ["instax"]]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.SPAWN_ROWS.professional)),
  [["avatar"], ["identity"], ["slogan"], ["visitor-calendar"], ["youtube"], ["__socials__"], ["badges"], ["followers", "calendar"], ["html"]]);
assert.ok(JSON.stringify(ctx.SPAWN_ROWS).indexOf('"social"') === -1, "no grouped social slot in SPAWN_ROWS");
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
    var stack = { avatar: 1, identity: 1, slogan: 1 };
    var g = stack[list[i].id] && stack[list[j].id] ? ctx.PROFILE_STACK_GAP : gap;
    assert.ok(!ctx.rectsOverlap(list[i], list[j], g - 0.5), list[i].id + " overlaps " + list[j].id);
  }
}

/* Sample opted-in chips so pack tests exercise __socials__ expansion (pairs of two). */
function sampleProfile(kind) {
  return {
    _profileKind: kind,
    socialLinks: {
      instagram: "https://instagram.com/a",
      tiktok: "https://tiktok.com/@a",
      venmo: "@a",
      x: "https://x.com/a",
    },
    publicWidgets: {},
  };
}
/* expandSpawnRows needs social helpers; stub via opted-in ids by patching through a thin expand. */
function expandForTest(kind) {
  var base = ctx.SPAWN_ROWS[kind];
  var chips = kind === "professional"
    ? ["social-instagram", "social-tiktok", "social-x"]
    : ["social-instagram", "social-tiktok", "social-venmo", "social-x"];
  var out = [];
  base.forEach(function (row) {
    if (row.length === 1 && row[0] === "__socials__") {
      var i;
      for (i = 0; i < chips.length; i += 2) out.push(chips.slice(i, i + 2));
      return;
    }
    out.push(row.slice());
  });
  return out;
}

["personal", "professional"].forEach(function (kind) {
  var rows = expandForTest(kind);
  var ids = [].concat.apply([], rows);
  /* Website (1120 wide): left | right rows, 24px side padding, 24px gap, no overlap. */
  var sz = sizes(ids);
  var d = ctx.packSpawn(rows, sz, [], 1120, false);
  var r = rects(d, sz);
  assertNoOverlap(r, 24);
  assert.strictEqual(d.avatar.x, 24);
  if (kind === "professional") {
    assert.strictEqual(d["social-instagram"].y, d["social-tiktok"].y, kind + ": first social pair shares a row");
    assert.strictEqual(d.followers.y, d.calendar.y, kind + ": Followers | Calendar share a row");
    assert.strictEqual(d.badges.x, 24, kind + ": Badges full-width left after socials");
  } else {
    assert.ok(d.friends && !d.social, kind + ": friends alone; no grouped social");
    assert.strictEqual(d["social-instagram"].y, d["social-tiktok"].y, kind + ": first social pair shares a row");
    assert.strictEqual(d.badges.y, d.calendar.y, kind + ": Badges | Calendar share a row");
    assert.strictEqual(d["social-tiktok"].x, 24 + (1120 - 48 - 24) / 2 + 24, "second chip right column");
  }
  /* Phone (390): one column, 16px sides, DOM order top to bottom. */
  var p = ctx.packSpawn(rows, sz, [], 390, true);
  var prevBottom = -1;
  ids.forEach(function (id) {
    assert.strictEqual(p[id].x, 16, kind + " phone x " + id);
    var minGap = (id === "identity" || id === "slogan") ? ctx.PROFILE_STACK_GAP : 24;
    assert.ok(p[id].y >= prevBottom + minGap || prevBottom < 0, kind + " phone order + gap " + id);
    prevBottom = p[id].y + sz[id].h;
  });
});

/* Profile card: avatar, name and slogan sit together (tight gap), then the 24px gap. */
["personal", "professional"].forEach(function (kind) {
  var rows2 = expandForTest(kind);
  var ids2 = [].concat.apply([], rows2);
  [false, true].forEach(function (phone) {
    var sz3 = sizes(ids2);
    var o = ctx.packSpawn(rows2, sz3, [], phone ? 390 : 1120, phone);
    assert.strictEqual(o.identity.y, o.avatar.y + sz3.avatar.h + ctx.PROFILE_STACK_GAP, kind + " name under avatar");
    assert.strictEqual(o.slogan.y, o.identity.y + sz3.identity.h + ctx.PROFILE_STACK_GAP, kind + " slogan under name");
    /* Calendar card: its own full row right under the bio card, then the next widget. */
    assert.strictEqual(o["visitor-calendar"].y, o.slogan.y + sz3.slogan.h + 24, kind + " calendar card 24px after the bio card");
    assert.strictEqual(o["visitor-calendar"].x, o.avatar.x, kind + " calendar card lines up with the bio card");
    var next = kind === "personal" ? "music" : "youtube";
    assert.strictEqual(o[next].y, o["visitor-calendar"].y + sz3["visitor-calendar"].h + 24, kind + " 24px after the calendar card");
  });
});

/* Phone: saved x/y ignored, every visible widget stacked; no drag, no save from phone. */
assert.ok(/var layout = phone \? \{\} : getWidgetLayout\(p\) \|\| \{\};/.test(tower), "phone ignores saved x/y");
assert.ok(/if \(phone\) \{[\s\S]*?rows\.push\(\[wid\]\);/.test(tower), "phone stacks widgets outside spec order too");
assert.ok(/function onPointerDown\(ev\) \{\s*if \(!ownerOnPublic\(\)\) return;\s*\/\*[^*]*\*\/\s*if \(isPhoneStage\(stage\)\) return;/.test(tower), "no drag on phone");
assert.ok(/function freezeSpawnedWidgets[\s\S]*?if \(isPhoneStage\(stage\)\) return layout;/.test(tower), "phone never freezes into the website layout");
assert.ok(/function persistSelectedTilt[\s\S]{0,200}isPhoneStage\(tiltStage\)\) return;/.test(tower), "no tilt save on phone");

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
/* CSS grid autospawn (LOOK lock): no absolute for defaults; followers on Pro. */
assert.ok(tower.indexOf("is-default-grid") !== -1, "CSS grid class for pure autospawn");
assert.ok(/is-default-grid/.test(css) && /grid-template-columns/.test(css), "default-grid CSS present");
assert.ok(JSON.stringify(ctx.SPAWN_ROWS.professional).indexOf("followers") !== -1, "followers in Pro order");
assert.ok(JSON.stringify(ctx.SPAWN_ROWS.professional).indexOf("music") === -1, "no music on Pro");
assert.ok(JSON.stringify(ctx.SPAWN_ROWS.professional).indexOf("friends") === -1, "no Top Friends on Pro");
assert.ok(JSON.stringify(ctx.SPAWN_ROWS.professional).indexOf("polaroid") === -1, "no polaroid on Pro");
assert.ok(/data-tower-widget="followers"/.test(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")), "followers sticker in HTML");
console.log("tower-default-spawn.test.js: ok");

