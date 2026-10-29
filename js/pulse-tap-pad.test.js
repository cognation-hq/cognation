/* engineer/pulse-tap-pad-ops-panel (HH/PM cosmetics): at 360 and 375 the PULSE back
   halo frames draw under 44px (44 x the phone shrink from #310's phoneOrbit). Each
   filled frame gets an invisible pad (::after) of at least 44 x 44 centred on it.
   The frame's own size, ring, ripple, bob and motion are unchanged.
   Run: node --test js/pulse-tap-pad.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const api = require("./pulse-falling-friends.js");

const towerSrc = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
const num = (re) => { const m = towerSrc.match(re); assert.ok(m, String(re)); return m[1]; };
const CIRCLE_TILT = Number(num(/var CIRCLE_TILT = (\d+) \* Math\.PI \/ 180;/)) * Math.PI / 180;
const CIRCLE_RING_R = Number(num(/var CIRCLE_RING_R = (\d+);/));
const CIRCLE_PERSPECTIVE = Number(num(/var CIRCLE_PERSPECTIVE = (\d+);/));
const CIRCLE_SPOTS = new Function("return " + num(/var CIRCLE_SPOTS = (\[[\s\S]*?\]);/))();
const branch = towerSrc.slice(towerSrc.indexOf("function placeCircleSpots()"), towerSrc.indexOf("function circleSpotAt("));
const key = "fitApi.phoneOrbit(fitLayer.clientWidth, ";
const optsSrc = branch.slice(branch.indexOf(key) + key.length, branch.indexOf("});", branch.indexOf(key)) + 1);
const G = new Function("CIRCLE_RING_R", "CIRCLE_TILT", "CIRCLE_PERSPECTIVE", "CIRCLE_SPOTS", "reduce", "return " + optsSrc)(CIRCLE_RING_R, CIRCLE_TILT, CIRCLE_PERSPECTIVE, CIRCLE_SPOTS, false);

/* Perspective factor d for every ring angle (tower.js projection). */
function depthRange() {
  let lo = Infinity, hi = -Infinity;
  for (let a = 0; a < 360; a += 0.5) {
    const y = Math.sin(a * Math.PI / 180) * CIRCLE_RING_R;
    const d = CIRCLE_PERSPECTIVE / (CIRCLE_PERSPECTIVE - y * Math.sin(CIRCLE_TILT));
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  return { lo, hi };
}

/* Rules inside each @media (max-width: Npx) block, keyed by selector. */
function mediaRules() {
  const out = [];
  const re = /@media \(max-width: (\d+)px\) \{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    const body = css.slice(re.lastIndex, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = {};
    body.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, decl) => {
      const d = {};
      decl.split(";").forEach((p) => { const k = p.indexOf(":"); if (k > 0) d[p.slice(0, k).trim()] = p.slice(k + 1).trim(); });
      rules[sel.trim()] = d;
    });
    out.push({ maxW: Number(m[1]), rules });
  }
  return out;
}

const PAD_SEL = ".circle-fall[data-pulse-bg] .circle-spot.is-filled::after";
const SPOT_SEL = ".circle-fall[data-pulse-bg] .circle-spot.is-filled";
function padAt(width) {
  const hits = mediaRules().filter((b) => width <= b.maxW && b.rules[PAD_SEL]);
  return hits.length ? { pad: hits[hits.length - 1].rules[PAD_SEL], spot: hits[hits.length - 1].rules[SPOT_SEL] || {}, maxW: hits[hits.length - 1].maxW } : null;
}
/* Evaluates max(100%, Npx) / Npx / 100% against the frame size. */
function cssLen(v, frame) {
  const m = /^max\(100%,\s*([\d.]+)px\)$/.exec(v);
  if (m) return Math.max(frame, Number(m[1]));
  if (v === "100%") return frame;
  const px = /^([\d.]+)px$/.exec(v);
  assert.ok(px, "unsupported length " + v);
  return Number(px[1]);
}

[360, 375].forEach((w) => {
  test("PULSE " + w + ": back frames draw under 44px, and every filled frame's tap pad is at least 44 x 44", () => {
    const o = api.phoneOrbit(w, G);
    const { lo, hi } = depthRange();
    const back = o.sizeAt(lo), front = o.sizeAt(hi);
    assert.ok(back < 44, "back frame at " + w + " is " + back.toFixed(1) + "px (needs the pad)");
    const p = padAt(w);
    assert.ok(p, "a tap pad rule applies at " + w);
    for (const size of [back, (back + front) / 2, front]) {
      assert.ok(cssLen(p.pad.width, size) >= 44, "pad width >= 44 for a " + size.toFixed(1) + "px frame");
      assert.ok(cssLen(p.pad.height, size) >= 44, "pad height >= 44 for a " + size.toFixed(1) + "px frame");
    }
    assert.strictEqual(p.pad.content, '""');
    assert.strictEqual(p.pad.position, "absolute");
    assert.strictEqual(p.pad.left, "50%");
    assert.strictEqual(p.pad.top, "50%");
    assert.strictEqual(p.pad.transform, "translate(-50%, -50%)", "centred on the frame");
    assert.strictEqual(p.pad["pointer-events"], "auto", "the pad takes taps");
    assert.strictEqual(p.spot.overflow, "visible", "the frame does not clip its pad");
  });
});

test("tap pad is invisible and changes nothing about the frame (size, ring, ripple, bob, motion)", () => {
  const p = padAt(360);
  assert.ok(p, "pad rule present");
  assert.strictEqual(p.pad.background, "transparent");
  assert.strictEqual(p.pad.border, "0");
  for (const k of Object.keys(p.pad)) assert.ok(!/shadow|outline|color|opacity|animation|transition|filter/.test(k), "no visible styling: " + k);
  for (const v of Object.values(p.pad)) assert.ok(!/#ff|#ED9300|yellow/i.test(v), "no colour in the pad: " + v);
  assert.deepStrictEqual(Object.keys(p.spot), ["overflow"], "the frame rule only opens overflow (no size, transform or animation)");
});

test("tap pad is scoped to 360 and 375 (390 and wider keep base styles)", () => {
  assert.ok(padAt(375), "375 padded");
  assert.strictEqual(padAt(390), null, "390 not padded (out of scope)");
  assert.strictEqual(padAt(430), null);
});
