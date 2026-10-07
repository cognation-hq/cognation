/**
 * Cap 250 — Circle ring as page background (Alexa lock 2026-10-07).
 * Run: node js/cap250-circle-ring-background.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

var css = src("css/styles.css");
var tower = src("js/tower.js");
var relations = src("js/circle-saved-relations.js");
var relApi = require("./circle-saved-relations.js");

/* Indigo gradient page background #171a3a → #291b3a */
var fall = css.match(/\.circle-fall\s*\{[\s\S]*?\n\}/);
assert.ok(fall, ".circle-fall rule present");
assert.ok(/#171a3a/.test(fall[0]) && /#291b3a/.test(fall[0]), "indigo gradient #171a3a→#291b3a on .circle-fall");
assert.ok(!/background:\s*#101229/.test(fall[0]), "solid blank #101229 panel removed from .circle-fall");

/* Halo + cyan/violet accents on shell */
assert.ok(/rgba\(168,\s*244,\s*255/.test(fall[0]), "cyan halo on Circle background");
assert.ok(/rgba\(197,\s*166,\s*255/.test(fall[0]), "violet halo on Circle background");

/* Five empty spots */
assert.ok(/\.circle-spot\b/.test(css) && /\.circle-spot\.is-empty/.test(css), "empty spot CSS present");
assert.ok(/CIRCLE_SPOTS\s*=\s*\[[\s\S]*?\{ id: "left"[\s\S]*?\{ id: "center"[\s\S]*?\{ id: "right"[\s\S]*?back-right[\s\S]*?back-left/.test(tower), "five CIRCLE_SPOTS retained");
assert.ok(/paintCircleRingShell/.test(tower), "ring shell painter present");
assert.ok(/for \(i = 0; i < CIRCLE_SPOTS\.length; i\+\+\)/.test(tower), "shell paints all five spots");
assert.ok(/paintCircleLightning/.test(tower) && /data-circle-lightning/.test(tower), "cyan/violet synapse lightning retained");
assert.ok(/data-circle-ring-shell/.test(tower), "shell path marked on open");
assert.ok(/fillSpots:\s*fillCircleSpots/.test(tower), "fillSpots API for hydrate");

/* Empty copy must not be the whole empty UI */
assert.ok(relations.indexOf("No saved friendships or follows yet.") === -1, "blank No saved… copy removed");
assert.ok(/list\.classList\.add\("is-empty"\)/.test(relations), "empty list flagged is-empty");
assert.ok(/\.circle-relations\.is-empty[\s\S]*?display:\s*none/.test(css), "empty list hidden so ring is the empty state");

/* Hydrate still fills spots when lines exist */
assert.ok(/peopleForSpots/.test(relations) && /fillRingSpots\(peopleForSpots\(lines\)\)/.test(relations), "hydrate fills spots from lines");
assert.ok(typeof relApi.peopleForSpots === "function", "peopleForSpots exported");

var sample = relApi.peopleForSpots([
  {
    type: "friendship",
    people: [
      { userId: "a", name: "Ada" },
      { userId: "b", name: "Grace" },
    ],
  },
  {
    type: "follow",
    people: [
      { userId: "b", name: "Grace" },
      { userId: "c", name: "Katherine" },
    ],
  },
]);
assert.strictEqual(sample.length, 3, "unique people for spots");
assert.strictEqual(sample[0].name, "Ada");
assert.strictEqual(sample[2].name, "Katherine");

/* Must not restore portrait fall / 15-min topic loop on the Cap 250 path */
var shellBlock = tower.match(/Cap 250 — Circle ring as page background[\s\S]*?return;/);
assert.ok(shellBlock, "Cap 250 early shell path present");
assert.ok(/shellOnly:\s*true/.test(shellBlock[0]), "shellOnly — no portrait physics");
assert.ok(!/applyCircleTopics/.test(shellBlock[0]), "no 15-minute demo topics on shell path");

/* Full-page ring — not shrunk blank panel */
var hasRel = css.match(/\.circle-fall:has\(\[data-circle-relations\]\)\s*\{[\s\S]*?\n\}/);
assert.ok(hasRel && /height:\s*100vh/.test(hasRel[0]), "relations overlay keeps full-page ring height");
assert.ok(hasRel && !/min-height:\s*70vh/.test(hasRel[0]), "old 70vh blank-panel shrink gone");

console.log("cap250-circle-ring-background.test.js: OK");
