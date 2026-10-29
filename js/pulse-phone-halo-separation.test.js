/* engineer/pulse-phone-halo-separation (Designer LOOK): on PULSE at phone widths,
   adjacent halo frames overlapped as they passed each other (about 22px at 390,
   24 at 375, 27 at 358): each frame bobbed on its own phase (from #295), and even
   with no bob 358 overlapped by about 3px. This drives the real tower.js phone
   branch (its phoneOrbit options, spot angles, rotation path and bob expression)
   through the real phoneOrbit and checks every adjacent pair, at every rotation
   step and bob position, keeps (size_a + size_b) / 2 + 4px between centres. */
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
/* The phone bob, as written: frame i at clock t. */
const bobExpr = num(/var pbob = reduce \? 0 : ([^;]+);/);
const phoneBob = new Function("i", "t", "var performance = { now: function () { return t; } }; return " + bobExpr + ";");

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

function worstGap(panelW) {
  const o = api.phoneOrbit(panelW, G);
  let worst = { gap: Infinity };
  const n = CIRCLE_SPOTS.length;
  for (let s = 0; s < n; s += 0.001) { /* rotation steps */
    const P = [];
    for (let i = 0; i < n; i++) { const p = spotAt(i + s); P.push({ x: p.x * o.f, y: p.y * o.f, size: o.sizeAt(p.d) }); }
    for (let t = 0; t < 360 * Math.PI * 2; t += 360 * Math.PI * 2 / 48) { /* bob positions over one bob period */
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = P[i], b = P[j];
        const dy = (a.y + phoneBob(i, t)) - (b.y + phoneBob(j, t));
        const gap = Math.hypot(a.x - b.x, dy) - (a.size + b.size) / 2;
        if (gap < worst.gap) worst = { gap, s, i, j };
      }
    }
  }
  return { o, worst };
}

test("tower.js phone branch: one shared bob phase, spot angles passed to phoneOrbit; desktop bob unchanged", () => {
  assert.ok(!/\bi\b/.test(bobExpr), "phone bob does not depend on the frame index: " + bobExpr);
  assert.deepStrictEqual(G.spots, CIRCLE_SPOTS.map((sp) => sp.angle));
  assert.ok(/var bob = reduce \? 0 : Math\.sin\(performance\.now\(\) \/ 360 \+ i \* 1\.2\) \* 18;/.test(branch), "desktop per-frame bob untouched");
  assert.ok(/var scale = 0\.8 \+ Math\.max\(0, depth - 0\.68\) \* 0\.4;/.test(branch), "desktop scale untouched");
  assert.strictEqual(api.PHONE_FRAME_GAP, 4);
});

for (const vw of [360, 375, 390, 430]) {
  for (const panelW of [vw, vw - 32]) {
    test(`${vw}px (panel ${panelW}): adjacent frames keep >= 4px apart at every rotation step and bob position`, () => {
      const { o, worst } = worstGap(panelW);
      assert.ok(worst.gap >= 4 - 1e-6, `frames ${worst.i}/${worst.j} at rotation ${worst.s.toFixed(3)}: gap ${worst.gap.toFixed(2)}px`);
      /* still inside the panel, front frame still the largest */
      for (let a = 0; a < 360; a += 0.5) {
        const p = o.point(a);
        assert.ok(Math.abs(p.x) + p.size / 2 <= panelW / 2 - 8 + 1e-6, `angle ${a}`);
      }
      assert.ok(o.sizeK > 0.7 && o.sizeK <= 1, `sizeK ${o.sizeK}`);
      assert.ok(o.point(90).size > o.point(-90).size);
    });
  }
}

test("430: no overlap to fix, frames stay 44px back / 56px front", () => {
  const o = api.phoneOrbit(430, G);
  assert.strictEqual(o.sizeK, 1);
  assert.strictEqual(Math.round(o.point(90).size), 56);
  assert.strictEqual(Math.round(o.point(-90).size), 44);
});

test("without spot angles phoneOrbit is unchanged (sizeK 1)", () => {
  const g = Object.assign({}, G); delete g.spots;
  const o = api.phoneOrbit(390, g);
  assert.strictEqual(o.sizeK, 1);
  assert.strictEqual(Math.round(o.point(90).size), 56);
});
