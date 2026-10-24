/**
 * PULSE frames orbit (Alexa 2026-10-22): the five halo frames slowly circle the
 * ring again (28s a turn, steady speed), photos stay upright, falling circles
 * stay clear of every frame, and prefers-reduced-motion keeps them pinned.
 * Run: node js/pulse-frames-orbit.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html"), tower = src("js/tower.js"), css = src("css/styles.css");
var orbitSrc = src("js/pulse-frames-orbit.js");
var orbit = require("./pulse-frames-orbit.js");
var fall = require("./pulse-falling-friends.js");

/* The pinned spots, read from js/tower.js so the test follows the real layout. */
var sqSrc = /var PULSE_BG_SQUARES = (\{[\s\S]*?\n  \});/.exec(tower);
assert.ok(sqSrc, "pinned spots table present");
var SQ = Function("return " + sqSrc[1])();
var ids = ["left", "center", "right", "back-right", "back-left"];
assert.deepStrictEqual(Object.keys(SQ), ids, "five pinned spots");
var P = orbit.buildPath(SQ);

/* ---- Orbit present ---- */
var iOrbit = html.indexOf('src="js/pulse-frames-orbit.js"');
assert.ok(iOrbit > 0 && iOrbit < html.indexOf('src="js/tower.js"'), "orbit script loaded before tower.js");
assert.ok(orbit.ORBIT_MS >= 28000, "28s a turn or slower");
assert.ok(/orbitCircleSpots\(spots\)/.test(tower) && /pinCircleSpotsToBackground\(spots\)\) \{ orbitCircleSpots\(spots\); return; \}/.test(tower), "placing the spots also places the orbit");
var shell = tower.slice(tower.indexOf("function frameShell()"), tower.indexOf("circleFallState.frameShell = frameShell;"));
assert.ok(/if \(orbitCircleSpots\(\)\) st\.raf = requestAnimationFrame\(frameShell\);/.test(shell), "per-frame loop runs while the frames orbit");
assert.ok(!/st\.raf = 0; return; \}\s*st\.raf = requestAnimationFrame/.test(shell), "the old still-only early stop is gone");

ids.forEach(function (id) {
  var f0 = orbit.frameAt(P, id, 0);
  assert.ok(Math.abs(f0.x - SQ[id].x) < 0.01 && Math.abs(f0.y - SQ[id].y) < 0.01 && Math.abs(f0.s - SQ[id].s) < 0.01, id + " starts on its pinned spot");
  var f1 = orbit.frameAt(P, id, orbit.ORBIT_MS);
  assert.ok(Math.abs(f1.x - SQ[id].x) < 0.01 && Math.abs(f1.y - SQ[id].y) < 0.01, id + " is back on its spot after one full turn");
  var f5 = orbit.frameAt(P, id, 5000);
  assert.ok(Math.hypot(f5.x - f0.x, f5.y - f0.y) > 100, id + " has visibly moved after 5s");
});
/* Each frame travels through the next pinned spot in ring order. */
for (var n = 0; n < ids.length; n++) {
  var id = ids[n], next = ids[(n + 1) % ids.length];
  var gap = ((P.start[next] - P.start[id]) + P.length) % P.length;
  var at = orbit.frameAt(P, id, gap / P.length * orbit.ORBIT_MS);
  assert.ok(Math.abs(at.x - SQ[next].x) < 0.5 && Math.abs(at.y - SQ[next].y) < 0.5, id + " passes through " + next);
}
/* Smooth and linear: same distance every 50ms, all the way round. */
var steps = [];
for (var t = 0; t < orbit.ORBIT_MS; t += 50) {
  var a = orbit.frameAt(P, "left", t), b = orbit.frameAt(P, "left", t + 50);
  steps.push(Math.hypot(b.x - a.x, b.y - a.y));
}
var expect = P.length / (orbit.ORBIT_MS / 50);
steps.forEach(function (d) { assert.ok(Math.abs(d - expect) < expect * 0.03, "steady speed (" + d.toFixed(3) + " vs " + expect.toFixed(3) + ")"); });

/* The path stays inside the pinned spots' box, depth scale within the pinned scales. */
var minY = Math.min.apply(null, ids.map(function (k) { return SQ[k].y; }));
var maxY = Math.max.apply(null, ids.map(function (k) { return SQ[k].y; }));
var minX = Math.min.apply(null, ids.map(function (k) { return SQ[k].x; }));
var maxX = Math.max.apply(null, ids.map(function (k) { return SQ[k].x; }));
for (var u = 0; u < orbit.ORBIT_MS; u += 25) {
  ids.forEach(function (k) {
    var f = orbit.frameAt(P, k, u);
    assert.ok(f.y >= minY - 1e-6 && f.y <= maxY + 1e-6 && f.x >= minX - 1e-6 && f.x <= maxX + 1e-6, "frame stays inside the pinned band");
    assert.ok(f.s >= 1 - 1e-6 && f.s <= 1.4 + 1e-6, "depth scale stays between back and front");
  });
}
/* Frames never overlap each other on the way round (390 and 1280 sizes). */
[{ k: 0.292, grow: 0.55 }, { k: 0.954, grow: 0.954 }].forEach(function (view) {
  for (var v = 0; v < orbit.ORBIT_MS; v += 100) {
    var fs5 = ids.map(function (k) { return orbit.frameAt(P, k, v); });
    for (var i = 0; i < 5; i++) for (var j = i + 1; j < 5; j++) {
      var d = Math.hypot((fs5[i].x - fs5[j].x) * view.k, (fs5[i].y - fs5[j].y) * view.k);
      var r = 70.4 * view.grow * (fs5[i].s + fs5[j].s) / 2;
      assert.ok(d >= r * 0.99, "frames keep apart at k=" + view.k + " t=" + v);
    }
  }
});

/* ---- Reduced motion: no orbit at all ---- */
function win(reduce) { return { matchMedia: function (q) { return { matches: reduce && /prefers-reduced-motion: reduce/.test(q) }; } }; }
assert.strictEqual(orbit.reducedMotion(win(true)), true, "reduced motion detected");
assert.strictEqual(orbit.reducedMotion(win(false)), false, "normal motion detected");
assert.strictEqual(orbit.reducedMotion({}), false, "no matchMedia: normal");
var orbitFn = tower.slice(tower.indexOf("function orbitCircleSpots("), tower.indexOf("function placeCircleSpots()"));
assert.ok(/orbit\.reducedMotion\(window\)\) return false;/.test(orbitFn), "reduced motion: orbit never moves a frame");
assert.ok(/else \{ placeCircleSpots\(\); st\.raf = 0; \}/.test(shell), "reduced motion: frames go back to their pinned spots and the loop stops");
assert.ok(/addEventListener\("change", onMotionPref\)/.test(tower), "switching reduced motion on mid-turn pins the frames");
var pinFn = tower.slice(tower.indexOf("function pinCircleSpotsToBackground("), tower.indexOf("function orbitCircleSpots("));
assert.ok(/spots\[i\]\.style\.transform = pin;/.test(pinFn) && /setAttribute\("data-pulse-pin", pin\)/.test(pinFn), "pinned spots unchanged (what reduced motion shows)");

/* ---- Counter-rotation: photos stay upright ---- */
for (var w = 0; w < orbit.ORBIT_MS; w += 500) {
  ids.forEach(function (k) {
    var f = orbit.frameAt(P, k, w);
    assert.strictEqual(f.rotate, 0, "photo net rotation 0deg");
    var tr = orbit.frameTransform(f, 0.954, 0.954);
    assert.ok(/^translate\(-50%, -50%\) translate\([-\d.]+px,[-\d.]+px\) scale\([\d.]+\)$/.test(tr) && !/rotate/.test(tr), "frame transform slides and scales only");
  });
}
var spinCss = css.slice(css.indexOf(".circle-ring-spin {"), css.indexOf("}", css.indexOf(".circle-ring-spin {")));
assert.ok(!/rotate|animation/.test(spinCss), "the ring holder never turns, so nothing needs undoing");
assert.ok(!/rotate\(/.test(orbitFn), "tower.js orbit never rotates a frame");

/* ---- Falling circles stay clear of every frame at every spot ---- */
global.getComputedStyle = function () { return { getPropertyValue: function () { return "0.954"; } }; };
/* Names are sized in true screen px (6px gap + 14.4px line, divided by the frame's
   own scale, as in css/styles.css), so their local size follows the current scale. */
function spotEl(tr, pin) {
  var s = Number(/scale\(([\d.]+)\)/.exec(tr)[1]);
  return { offsetHeight: 70.4, style: { transform: tr }, getAttribute: function (n) { return n === "data-pulse-pin" ? pin : null; },
    querySelector: function () { return { offsetTop: 70.4 + 6 / s, offsetHeight: 14.4 / s }; } };
}
function layer(spots) {
  return { clientWidth: 1280, clientHeight: 900, style: { getPropertyValue: function () { return ""; } }, querySelectorAll: function () { return spots; } };
}
var pins = ids.map(function (k) { return orbit.frameTransform(orbit.frameAt(P, k, 0), 0.954, 0.954); });
var pinnedBand = fall.blockedBand(layer(ids.map(function (k, i) { return spotEl(pins[i], pins[i]); })));
for (var q = 0; q < orbit.ORBIT_MS; q += 700) {
  var moving = ids.map(function (k, i) { return spotEl(orbit.frameTransform(orbit.frameAt(P, k, q), 0.954, 0.954), pins[i]); });
  var band = fall.blockedBand(layer(moving));
  assert.ok(Math.abs(band.top - pinnedBand.top) < 0.01 && Math.abs(band.bottom - pinnedBand.bottom) < 0.5, "band measured mid-orbit = pinned band");
  /* and every moving frame (with its name) sits inside it */
  moving.forEach(function (sp) {
    var m = /translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([\d.]+)\)/.exec(sp.style.transform);
    var cy = 900 * 0.48 + Number(m[2]), half = 70.4 * Number(m[3]) / 2;
    assert.ok(cy - half >= band.top - 0.5 && cy + half + 20.4 <= band.bottom + 0.5, "moving frame inside the clear band");
  });
}

/* ---- Taps on each Tower photo still open that person's Tower ---- */
var ringShell = tower.slice(tower.indexOf("function paintCircleRingShell("), tower.indexOf("function pinCircleSpotsToBackground("));
assert.ok(/spot\.addEventListener\("click", openSpot\)/.test(ringShell) && /openCircleProfile\(handle\)/.test(ringShell), "frame tap opens that Tower");
assert.ok(/body\.is-circle-open \.circle-spot\.is-filled \{\s*pointer-events: auto !important;/.test(css), "filled frames take taps");

/* ---- No yellow, tab bar untouched ---- */
assert.ok(!/yellow|amber|gold|#ed9300|#ff[cd]/i.test(orbitSrc), "no yellow in the orbit");

console.log("pulse-frames-orbit.test.js: OK");
