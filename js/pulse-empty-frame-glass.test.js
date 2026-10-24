/**
 * PULSE empty halo frames (Designer nit): with fewer than 5 friends the empty
 * frames use the locked glass empty-frame look from
 * design-comps/pulse-falling-friends/spec.md (Alexa 2026-10-20, PM + Designer):
 * glass rgba(18,16,38,0.92) + thin #d9d2f0 outline. Filled frames, frame count
 * and positions are unchanged. Style only.
 * Run: node js/pulse-empty-frame-glass.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");

function rule(selectorRe) {
  var m = css.match(new RegExp("(^|\\n)" + selectorRe + " \\{([^}]*)\\}"));
  return m ? m[2] : null;
}

/* Empty frame: glass + #d9d2f0 ring, keeps the base 1px width. */
var empty = rule("\\.circle-spot\\.is-empty");
assert.ok(empty, ".circle-spot.is-empty rule present");
assert.ok(/background:\s*rgba\(18,\s*16,\s*38,\s*0\.92\);/.test(empty), "empty frame glass rgba(18,16,38,0.92)");
assert.ok(/border-color:\s*#d9d2f0;/i.test(empty), "empty frame thin #d9d2f0 ring");
assert.ok(!/#070b16/i.test(empty), "empty frame no longer black");
assert.ok(!/border(-width)?:\s*[2-9]/.test(empty), "ring stays thin (base 1px)");
assert.ok(!/transform|animation|transition|left|top|width|height/.test(empty), "style only: no size, position or motion");

/* Base and filled frames unchanged. */
var base = rule("\\.circle-spot");
assert.ok(/border:\s*1px solid rgba\(214, 218, 232, 0\.5\);/.test(base) && /background:\s*#070b16;/.test(base), "base frame unchanged");
var filled = rule("\\.circle-spot\\.is-filled");
assert.ok(filled, ".circle-spot.is-filled rule present");
assert.ok(/border-color:\s*rgba\(220, 224, 238, 0\.62\);/.test(filled), "filled ring unchanged");
assert.ok(/background:\s*#070b16;/.test(filled) && /background-size:\s*cover;/.test(filled), "filled background unchanged");
assert.ok(!/d9d2f0|rgba\(18,\s*16,\s*38/i.test(filled), "filled frames do not take the glass look");

/* Banned colours stay out of the new rule. */
assert.ok(!/#1c1630/i.test(empty), "no #1c1630");

/* Behaviour: run the real ring painter with 2 friends on a tiny fake DOM. */
function sliceFn(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " present");
  var i = tower.indexOf("{", start), depth = 0;
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
var spotsSrc = tower.match(/var CIRCLE_SPOTS = \[[\s\S]*?\];/);
assert.ok(spotsSrc, "CIRCLE_SPOTS present");

function el(tag) {
  var classes = [];
  var node = {
    tagName: tag, children: [], attrs: {}, textContent: "",
    classList: {
      add: function (c) { if (classes.indexOf(c) < 0) classes.push(c); },
      remove: function (c) { var k = classes.indexOf(c); if (k >= 0) classes.splice(k, 1); },
      contains: function (c) { return classes.indexOf(c) >= 0; }
    },
    setAttribute: function (k, v) { node.attrs[k] = String(v); },
    getAttribute: function (k) { return k in node.attrs ? node.attrs[k] : null; },
    appendChild: function (c) { node.children.push(c); c.parentNode = node; return c; },
    removeChild: function (c) { node.children.splice(node.children.indexOf(c), 1); },
    addEventListener: function () {},
    querySelector: function () { return null; }
  };
  Object.defineProperty(node, "className", {
    get: function () { return classes.join(" "); },
    set: function (v) { classes = String(v).split(/\s+/).filter(Boolean); }
  });
  return node;
}
var paint = new Function("document", "window", "paintCircleLightning", "placeCircleSpots", "paintFriendPicture", "openCircleProfile",
  spotsSrc[0] + "\n" + sliceFn("paintCircleRingShell") + "\nreturn { paint: paintCircleRingShell, spots: CIRCLE_SPOTS };");
var api = paint({ createElement: el }, {}, function () {}, function () {}, function () {}, function () { return function () {}; });

function spotsFor(people) {
  var layer = el("div");
  api.paint(layer, people);
  var ring = layer.children[0];
  var spin = ring.children.filter(function (c) { return c.className === "circle-ring-spin"; })[0];
  var kids = spin.children;
  if (kids[0] && kids[0].className === "circle-ring-people") kids = kids[0].children;
  return kids;
}

var two = spotsFor([{ name: "Sam", userId: "u-sam", handle: "sam" }, { name: "Jo", userId: "u-jo", handle: "jo" }]);
assert.strictEqual(two.length, 5, "still five frames with 2 friends");
assert.deepStrictEqual(two.map(function (s) { return s.getAttribute("data-circle-spot"); }), api.spots.map(function (s) { return s.id; }), "same frames, same order (positions come from these ids)");
assert.deepStrictEqual(two.map(function (s) { return s.classList.contains("is-filled"); }), [true, true, false, false, false], "2 filled");
assert.deepStrictEqual(two.map(function (s) { return s.classList.contains("is-empty"); }), [false, false, true, true, true], "3 empty frames get the glass class");
two.slice(2).forEach(function (s) {
  assert.strictEqual(s.textContent, "", "empty frame: no new copy");
  assert.strictEqual(s.getAttribute("aria-hidden"), "true", "empty frame stays decorative");
});

var five = spotsFor([1, 2, 3, 4, 5].map(function (n) { return { name: "F" + n, userId: "u" + n }; }));
assert.strictEqual(five.filter(function (s) { return s.classList.contains("is-empty"); }).length, 0, "5 friends: no empty frames");
assert.strictEqual(spotsFor([]).filter(function (s) { return s.classList.contains("is-empty"); }).length, 5, "0 friends: five empty frames");

console.log("pulse-empty-frame-glass: ok");
