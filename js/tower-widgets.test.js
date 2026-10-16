/**
 * Tower widgets PR: drag handle, social remove, resize, calendar contrast,
 * Add widget, single Demo badge, layout compaction.
 * Run: node js/tower-widgets.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html"), tower = src("js/tower.js"), css = src("css/styles.css"), badge = src("js/seedops-badge.js");
var tail = css.slice(css.indexOf("tower-widgets PR"));
assert.ok(tail.length > 100, "tower-widgets css block present");

function fnSource(name) {
  var i = tower.indexOf("function " + name + "(");
  assert.ok(i > 0, name + " exists");
  var d = 0, j = tower.indexOf("{", i);
  for (var k = j; k < tower.length; k++) {
    if (tower[k] === "{") d++;
    else if (tower[k] === "}" && --d === 0) return tower.slice(i, k + 1);
  }
  throw new Error("unbalanced " + name);
}

/* 1. Drag handle: no circle */
assert.ok(/border:\s*0/.test(tail) && /border-radius:\s*0/.test(tail) && /background:\s*transparent|background:\s*none/.test(tail), "handle circle off");

/* 2. Social X gone; keyboard and button remove */
assert.ok(tower.indexOf("data-tower-social-remove") < 0 || /tower-social-chip-remove[\s\S]{0,200}remove\(\)/.test(tower), "no social X created");
var rs = tower.slice(tower.indexOf("var removeSelectedWidget = function"));
assert.ok(/ownerOnPublic\(\)/.test(rs.slice(0, 200)), "remove is owner only");
assert.ok(/socialNetIdFromWidget\(id\)[\s\S]{0,200}removeSocialWidget\(root, socialNet\)/.test(rs), "selected chip removed via keyboard");
assert.ok(/data-tower-remove-selected/.test(html), "touch Remove button");
assert.ok(/savePublic\(p\)/.test(fnSource("removeSocialWidget")), "removed link saved so it does not come back");

/* 3. Resize limits */
assert.ok(/music:\s*\{\s*min:\s*200/.test(tower) && /calendar:\s*\{\s*min:\s*260/.test(tower) && /quote:\s*\{\s*min:\s*140/.test(tower), "resize limits incl. calendar min 260");
assert.ok(/wPx/.test(fnSource("initWidgetResize")), "resized width saved");

/* 4. Calendar contrast */
assert.ok(tail.indexOf("rgba(18, 16, 38, 0.92)") > 0 || tail.indexOf("rgba(18,16,38,0.92)") > 0, "calendar panel");
assert.ok(/#f7f9ff/i.test(tail) && /#d9d2f0/i.test(tail), "calendar text colors");
assert.ok(/197,\s*166,\s*255/.test(tail), "lilac selected");

/* 5. Add widget + one badge */
assert.ok(/data-tower-add-widget/.test(html), "Add widget button");
assert.ok(/syncTowerBadges/.test(badge) && /data-tower-profile-strip/.test(badge), "badge dedupe");

/* 6. Compaction + YouTube chip */
var ctx = {};
vm.createContext(ctx);
vm.runInContext("var COMPACT_MIN_GAP = 160;" + fnSource("boxesOverlap") + ";" + fnSource("planLayoutRepair") + "; this.plan = planLayoutRepair;", ctx);
var moves = ctx.plan([
  { id: "avatar", x: 24, y: 24, w: 200, h: 140 },
  { id: "identity", x: 240, y: 24, w: 300, h: 120 },
  { id: "followers", x: 24, y: 200, w: 300, h: 130 },
  { id: "social-youtube", x: 24, y: 180, w: 80, h: 50 },
  { id: "youtube", x: 24, y: 1010, w: 314, h: 215 },
  { id: "calendar", x: 600, y: 900, w: 300, h: 300, dragged: true }
], 1100, 24);
assert.ok((!moves.avatar || moves.avatar.y === 24) && (!moves.identity || moves.identity.y === 24), "identity row pinned at top");
assert.ok(moves.youtube && moves.youtube.y < 600, "youtube gap closed");
var ytY = moves.youtube.y;
assert.ok(moves["social-youtube"] && moves["social-youtube"].y >= ytY + 215, "chip sits with youtube");
assert.ok(!moves.calendar || moves.calendar.y >= 900, "dragged widget not compacted");
console.log("tower-widgets.test: ok");
