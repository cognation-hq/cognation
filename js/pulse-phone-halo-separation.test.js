/* engineer/pulse-phone-halo-separation (Designer LOOK; HH: keep the ripple): on
   PULSE at phone widths, adjacent halo frames overlapped as they passed each other
   (about 22px at 390, 24 at 375, 27 at 358). Phones keep the desktop ripple (frame
   i bobs on sin(t/360 + 1.2*i)) with a smaller amplitude. This drives the real
   tower.js phone branch (its phoneOrbit options, spot angles, rotation path and
   per-frame bob expression) through the real phoneOrbit and checks every adjacent
   pair, at every rotation step and bob phase, keeps (size_a + size_b) / 2 + 4px
   between centres. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const api = require("./pulse-falling-friends.js");

const src = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
const num = (re) => { const m = src.match(re); assert.ok(m, String(re)); return m[1]; };
const CIRCLE_TILT = Number(num(/var CIRCLE_TILT = (\d+) \* Math\.PI \/ 180;/)) * Math.PI / 180;
const CIRCLE_RING_R = Number(num(/var CIRCLE_RING_R = (\d+);/));
const CIRCLE_PERSPECTIVE = Number(num(/var CIRCLE_PERSPECTIVE = (\d+);/));
const spotsSrc = num(/var CIRCLE_SPOTS = (\[[\s\S]*?\]);/);
const CIRCLE_SPOTS = new Function("return " + spotsSrc)();

/* The options tower.js passes to phoneOrbit, evaluated as written (motion on). */
const branch = src.slice(src.indexOf("function placeCircleSpots()"), src.indexOf("function circleSpotAt("));
const optsSrc = branch.slice(branch.indexOf("fitApi.phoneOrbit(fitLayer.clientWidth, {") + "fitApi.phoneOrbit(fitLayer.clientWidth, ".length, branch.indexOf("});", branch.indexOf("fitApi.phoneOrbit(fitLayer.clientWidth")) + 1);
const G = new Function("CIRCLE_RING_R", "CIRCLE_TILT", "CIRCLE_PERSPECTIVE", "CIRCLE_SPOTS", "reduce", "return " + optsSrc)(CIRCLE_RING_R, CIRCLE_TILT, CIRCLE_PERSPECTIVE, CIRCLE_SPOTS, false);
/* The phone bob, as written: frame i at clock t (fit = the phoneOrbit result). */
const bobExpr = num(/var pbob = reduce \? 0 : ([^;]+);/);
const phoneBob = new Function("i", "t", "fit", "var performance = { now: function () { return t; } }; return " + bobExpr + ";");

function project(angleDeg) {
  const t = angleDeg * Math.PI / 180;
  const x = Math.cos(t) * CIRCLE_RING_R;
  const y = Math.sin(t) * CIRCLE_RING_R;
  const d = CIRCLE_PERSPECTIVE / (CIRCLE_PERSPECTIVE - y * Math.sin(CIRCLE_TILT));
  return { x: x * d, y: y * Math.cos(CIRCLE_TILT) * d, d };
}
/* tower.js circleSpotAt */
function spotAt(phase) {
  const n = CIRCLE_SPOTS.length;
  const w = ((phase % n) + n) % n;
  const i = Math.floor(w);
  const mix = w - i;
  const from = CIRCLE_SPOTS[i];
  let to = CIRCLE_SPOTS[(i + 1) % n].angle;
  if (to > from.angle) to -= 360;
  return project(from.angle + (to - from.angle) * mix);
}

const PERIOD = 360 * Math.PI * 2; /* bob period, ms */
/* Closest pass for every adjacent pair over rotation steps and bob phases. Bob is
   sampled from tower.js's own expression (96 phases per period), and the exact
   worst over all phases is checked too: the pair's vertical offset sweeps
   [-A*M, A*M], M = 2|sin(1.2*(i - j)/2)|. */
function worstGap(o, bobOverride) {
  const fit = bobOverride == null ? o : Object.assign({}, o, { bob: bobOverride });
  const A = fit.bob;
  let worst = { gap: Infinity, exact: Infinity };
  const n = CIRCLE_SPOTS.length;
  for (let s = 0; s < n; s += 0.002) { /* rotation steps */
    const P = [];
    for (let i = 0; i < n; i++) { const p = spotAt(i + s); P.push({ x: p.x * o.f, y: p.y * o.f, size: o.sizeAt(p.d) }); }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = P[i], b = P[j];
      const half = (a.size + b.size) / 2;
      const M = 2 * Math.abs(Math.sin(G.bobPhase * (i - j) / 2));
      const exact = Math.hypot(a.x - b.x, Math.max(0, Math.abs(a.y - b.y) - A * M)) - half;
      if (exact < worst.exact) worst.exact = exact;
      for (let t = 0; t < PERIOD; t += PERIOD / 96) {
        const dy = (a.y + phoneBob(i, t, fit)) - (b.y + phoneBob(j, t, fit));
        const gap = Math.hypot(a.x - b.x, dy) - half;
        if (gap < worst.gap) worst = Object.assign(worst, { gap, s, i, j });
      }
    }
  }
  return worst;
}

test("tower.js phone branch: per-frame ripple kept (same phase step as desktop), amplitude from phoneOrbit; desktop unchanged", () => {
  assert.ok(/^Math\.sin\(performance\.now\(\) \/ 360 \+ i \* 1\.2\) \* fit\.bob$/.test(bobExpr), "phone bob keeps the desktop ripple, amplitude fit.bob: " + bobExpr);
  assert.strictEqual(G.bobPhase, 1.2);
  assert.strictEqual(G.bob, 18);
  assert.deepStrictEqual(G.spots, CIRCLE_SPOTS.map((sp) => sp.angle));
  assert.ok(/var bob = reduce \? 0 : Math\.sin\(performance\.now\(\) \/ 360 \+ i \* 1\.2\) \* 18;/.test(branch), "desktop per-frame bob untouched");
  assert.ok(/var scale = 0\.8 \+ Math\.max\(0, depth - 0\.68\) \* 0\.4;/.test(branch), "desktop scale untouched");
  assert.strictEqual(api.PHONE_FRAME_GAP, 4);
});

for (const vw of [360, 375, 390, 430]) {
  for (const panelW of [vw, vw - 32]) {
    test(`${vw}px (panel ${panelW}): adjacent frames keep >= 4px apart at every rotation step and bob phase`, () => {
      const o = api.phoneOrbit(panelW, G);
      const worst = worstGap(o);
      assert.ok(worst.gap >= 4 - 1e-6, `frames ${worst.i}/${worst.j} at rotation ${worst.s.toFixed(3)}: gap ${worst.gap.toFixed(2)}px (bob ${o.bob})`);
      assert.ok(worst.exact >= 4 - 1e-6, `exact worst over bob phases ${worst.exact.toFixed(2)}px`);
      assert.ok(o.bob >= 0 && o.bob <= 18, `bob ${o.bob}`);
      /* bob is as large as it can be: half a pixel more would break the gap */
      if (o.bob < 18) assert.ok(worstGap(o, o.bob + 0.5).exact < 4, `bob ${o.bob} could be larger`);
      /* still inside the panel, front frame still the largest */
      for (let a = 0; a < 360; a += 0.5) {
        const p = o.point(a);
        assert.ok(Math.abs(p.x) + p.size / 2 <= panelW / 2 - 8 + 1e-6, `angle ${a}`);
      }
      if (panelW === 430) assert.strictEqual(o.sizeK, 1, "430 keeps full-size frames");
      else if (panelW === vw) assert.ok(o.sizeK >= 0.87 && o.sizeK <= 0.88, `sizeK ${o.sizeK} (frame shrink capped near 12%)`);
      else assert.ok(o.sizeK > 0.7 && o.sizeK <= 1, `sizeK ${o.sizeK}`);
      assert.ok(o.point(90).size > o.point(-90).size);
    });
  }
}

test("phones still bob where there is room: 375, 390 and 430 keep a ripple", () => {
  for (const w of [375, 390, 430]) assert.ok(api.phoneOrbit(w, G).bob > 0, `${w}`);
});

test("430: full-size frames (sizeK 1, 44px back / 56px front) with the largest ripple bob that holds 4px", () => {
  const o = api.phoneOrbit(430, G);
  assert.strictEqual(o.sizeK, 1);
  assert.ok(o.bob > 2 && o.bob < 18, `bob ${o.bob}`);
  assert.strictEqual(Math.round(o.point(90).size), 56);
  assert.strictEqual(Math.round(o.point(-90).size), 44);
});

test("390, 375 and 360 keep their shrink: sizeK 0.88, 0.88, about 0.874", () => {
  assert.strictEqual(api.phoneOrbit(390, G).sizeK, 0.88);
  assert.strictEqual(api.phoneOrbit(375, G).sizeK, 0.88);
  const k360 = api.phoneOrbit(360, G).sizeK;
  assert.ok(k360 > 0.873 && k360 < 0.875, `sizeK ${k360}`);
});

test("reduced motion (no bob): 430 keeps 44px back / 56px front", () => {
  const o = api.phoneOrbit(430, Object.assign({}, G, { bob: 0 }));
  assert.strictEqual(o.sizeK, 1);
  assert.strictEqual(o.bob, 0);
  assert.strictEqual(Math.round(o.point(90).size), 56);
  assert.strictEqual(Math.round(o.point(-90).size), 44);
});

test("without spot angles phoneOrbit is unchanged (sizeK 1, bob as given)", () => {
  const g = Object.assign({}, G); delete g.spots;
  const o = api.phoneOrbit(390, g);
  assert.strictEqual(o.sizeK, 1);
  assert.strictEqual(o.bob, 18);
  assert.strictEqual(Math.round(o.point(90).size), 56);
});
