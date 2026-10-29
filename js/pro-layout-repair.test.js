/**
 * Load-time layout repair (live check r143) + one-row avatar buttons + hidden Add-pro button.
 * Run: node js/pro-layout-repair.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

var start = tower.indexOf("  function boxesOverlap(a, b)");
var end = tower.indexOf("  function repairLayoutOverlaps(");
assert.ok(start > 0 && end > start);
var ctx = {};
vm.createContext(ctx);
vm.runInContext(tower.slice(start, end) + "this.plan = planLayoutRepair; this.ov = boxesOverlap;", ctx);
function anyOverlap(items, moves) {
  var boxes = items.map(function (it) {
    var m = moves[it.id];
    return { id: it.id, x: m ? m.x : it.x, y: m ? m.y : it.y, w: it.w, h: it.h };
  });
  for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) if (ctx.ov(boxes[i], boxes[j])) return boxes[i].id + " x " + boxes[j].id;
  return "";
}

/* 1. SeedOps browser B (r143): YouTube covers Followers 314x88, Followers covers Calendar 85x112. */
var b = [
  { id: "avatar", x: 16, y: 32, w: 121, h: 175 },
  { id: "identity", x: 149, y: 32, w: 294, h: 119 },
  { id: "youtube", x: 16, y: 247, w: 314, h: 215 },
  { id: "followers", x: 16, y: 374, w: 526, h: 131 },
  { id: "calendar", x: 457, y: 393, w: 526, h: 342, dragged: true },
];
var mb = ctx.plan(b, 1068, 24);
assert.strictEqual(anyOverlap(b, mb), "", "browser B repaired");
assert.ok(!mb.calendar, "owner-dragged Calendar keeps its spot");
assert.ok(!mb.youtube, "non-colliding widgets stay put");
assert.ok(!mb.avatar || mb.avatar.y === 24, "avatar seated at top");
assert.ok(mb.followers && mb.followers.x === 16 && mb.followers.y > 374, "only Followers moves, down, same x");

/* 2. Old Shawn-style layout: avatar/name x YouTube, YouTube x Followers. */
var old = [
  { id: "avatar", x: 20, y: 370, w: 121, h: 175, dragged: true },
  { id: "identity", x: 20, y: 545, w: 234, h: 119, dragged: true },
  { id: "youtube", x: 75, y: 385, w: 314, h: 215, dragged: true },
  { id: "followers", x: 0, y: 455, w: 206, h: 131, dragged: true },
  { id: "calendar", x: 470, y: 245, w: 280, h: 342, dragged: true },
];
var mo = ctx.plan(old, 1068, 24);
assert.strictEqual(anyOverlap(old, mo), "", "old layout repaired");
assert.ok(!mo.calendar, "dragged Calendar not colliding stays");
assert.strictEqual(mo.avatar.y, 24, "avatar card at the top");
assert.strictEqual(mo.identity.y, 24, "name card at the top, beside the avatar");
assert.strictEqual(mo.identity.x, mo.avatar.x + 121 + 12, "side by side");
["youtube", "followers"].forEach(function (id) {
  var it = old.filter(function (o) { return o.id === id; })[0];
  assert.ok(!mo[id] || mo[id].y >= it.y, id + " only moves down");
});

/* 3. Invalid spots are clamped into the card; a clean layout is untouched. */
var bad = [{ id: "followers", x: -40, y: -10, w: 300, h: 100 }, { id: "calendar", x: 900, y: 0, w: 400, h: 100 }];
var mbad = ctx.plan(bad, 1068, 24);
assert.deepStrictEqual(JSON.parse(JSON.stringify(mbad.followers)), { x: 0, y: 0 });
assert.strictEqual(mbad.calendar.x, 668);
assert.strictEqual(Object.keys(ctx.plan([{ id: "a", x: 0, y: 0, w: 10, h: 10 }, { id: "b", x: 0, y: 40, w: 10, h: 10 }], 100, 24)).length, 0);

/* 4. Wiring: runs after every desktop layout pass and after a drop; saves once, owner only; no deletes. */
assert.ok(/repairLayoutOverlaps\(stage, p, layout, spawnIds\);\s*\n\s*\}/.test(tower), "called at end of spawnUnplacedWidgets");
assert.ok(/repairLayoutOverlaps\(stage, pr, getWidgetLayout\(pr\), spawnIdsDrop(, \{ ownerAction: true \})?\)/.test(tower), "called after a drop");
var fn = tower.slice(end, tower.indexOf("  /* Saved spot if the owner placed it"));
assert.ok(/isPhoneStage\(stage\)/.test(fn) && /is-default-grid/.test(fn), "skips phone + grid");
assert.ok(/repairSavedSig\[pid\] !== sig/.test(fn) && /isTowerOwner\(p\)/.test(fn), "save once, owner only");
assert.ok(fn.indexOf("delete ") < 0, "repair deletes nothing");

/* 5. Back from 390px: placed widgets get their saved spot again before repair. */
assert.ok(/if \(!el\.hasAttribute\("data-sticker-x"\) && layout\[id\] && isPlacedPos\(layout, id\)\)/.test(tower));

/* 6. GO LIVE + Edit profile in one row in the free layout. */
assert.ok(/:not\(\.is-phone-stack\) > \.tower-sticker--avatar \.tower-profile-actions \{\s*grid-row: 2;\s*grid-column: 1;/.test(css));
assert.ok(/:not\(\.is-phone-stack\) > \.tower-sticker--avatar \.tower-profile-edit \{\s*grid-row: 2;\s*grid-column: 2;/.test(css));

/* 7. Hidden "Add a professional page" really hides (.btn display beat [hidden]). */
assert.ok(/\.tower-add-profile-row \[hidden\] \{\s*display: none !important;/.test(css));

console.log("pro-layout-repair tests passed");
