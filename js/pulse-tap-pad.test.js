/* engineer/pulse-tap-pad-ops-panel (HH/PM cosmetics; Designer: include 390): at 360,
   375 and 390 the PULSE back halo frames draw under 44px (44 x the phone shrink from
   #310's phoneOrbit). Each filled frame gets an invisible round pad (::after), 44px
   across or the frame's size if larger, centred on it. Pads never overlap each other
   or the front frame at any rotation step or bob phase. The frame's own size, ring,
   ripple, bob and motion are unchanged; 430+ and desktop are untouched.
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
  const re = /@media (?:\(min-width: (\d+)px\) and )?\(max-width: (\d+)px\) \{/g;
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
    out.push({ minW: m[1] ? Number(m[1]) : 0, maxW: Number(m[2]), rules });
  }
  return out;
}

const PAD_SEL = ".circle-fall[data-pulse-bg] .circle-spot.is-filled::after";
const SPOT_SEL = ".circle-fall[data-pulse-bg] .circle-spot.is-filled";
function padAt(width) {
  const hits = mediaRules().filter((b) => width >= b.minW && width <= b.maxW && b.rules[PAD_SEL]);
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

[360, 375, 390].forEach((w) => {
  test("PULSE " + w + ": back frames draw under 44px, and every filled frame's tap pad is at least 44px across", () => {
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
    assert.strictEqual(p.pad["border-radius"], "50%", "round pad (square pads overlap as frames pass)");
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

test("tap pad covers 360 to 429; 430+ (full-size frames) and desktop keep base styles", () => {
  assert.ok(padAt(375), "375 padded");
  assert.ok(padAt(390), "390 padded (Designer LOOK)");
  assert.ok(padAt(429), "429 padded");
  assert.strictEqual(padAt(430), null, "430 untouched");
  assert.strictEqual(padAt(768), null, "tablet untouched");
  assert.strictEqual(padAt(1280), null, "desktop untouched");
  assert.strictEqual(api.phoneOrbit(430, G).sizeK, 1, "430 back frames are already 44px");
});

/* Frame centres as tower.js places them (phone branch): circleSpotAt(i + shift)
   scaled by fit.f, plus the per-frame bob, with fit.sizeAt(depth). */
function project(angleDeg) {
  const t = angleDeg * Math.PI / 180;
  const x = Math.cos(t) * CIRCLE_RING_R, y = Math.sin(t) * CIRCLE_RING_R;
  const d = CIRCLE_PERSPECTIVE / (CIRCLE_PERSPECTIVE - y * Math.sin(CIRCLE_TILT));
  return { x: x * d, y: y * Math.cos(CIRCLE_TILT) * d, d };
}
function spotAt(phase) {
  const n = CIRCLE_SPOTS.length, w = ((phase % n) + n) % n, i = Math.floor(w), mix = w - i;
  const from = CIRCLE_SPOTS[i];
  let to = CIRCLE_SPOTS[(i + 1) % n].angle;
  if (to > from.angle) to -= 360;
  return project(from.angle + (to - from.angle) * mix);
}
const bobExpr = (towerSrc.match(/var pbob = reduce \? 0 : ([^;]+);/) || [])[1];
const phoneBob = new Function("i", "t", "fit", "var performance = { now: function () { return t; } }; return " + bobExpr + ";");
const PERIOD = 360 * Math.PI * 2;
/* Every frame position over rotation steps and bob phases: [{x, y, size, pad}] per step. */
function* layouts(o, padW) {
  const n = CIRCLE_SPOTS.length;
  for (let s = 0; s < n; s += 0.004) {
    const base = [];
    for (let i = 0; i < n; i++) { const p = spotAt(i + s); base.push({ x: p.x * o.f, y: p.y * o.f, size: o.sizeAt(p.d) }); }
    for (let t = 0; t < PERIOD; t += PERIOD / 48) {
      yield base.map((b, i) => ({ x: b.x, y: b.y + phoneBob(i, t, o), size: b.size, pad: cssLen(padW, b.size) }));
    }
  }
}

/* The PULSE fit layer spans the viewport on phones (--pulse-panel-w measured headless
   = 360/375/390px at those widths), so phoneOrbit gets the viewport width. */
for (const vw of [360, 375, 390]) {
  for (const panelW of [vw]) {
    test(`${vw}px: round pads never overlap each other or the front frame, and every pad answers 8/8 taps on its 44px ring`, () => {
      const o = api.phoneOrbit(panelW, G);
      let worst = Infinity, misses = 0;
      const dirs = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => [Math.cos(a * Math.PI / 180) * 21.5, Math.sin(a * Math.PI / 180) * 21.5]);
      const padW = padAt(vw).pad.width;
      for (const P of layouts(o, padW)) {
        for (let i = 0; i < P.length; i++) {
          for (let j = i + 1; j < P.length; j++) {
            /* pad i vs pad j (the front frame's pad is its own circle, as it is >= 44) */
            const gap = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) - (P[i].pad + P[j].pad) / 2;
            if (gap < worst) worst = gap;
          }
          /* hit check: 8 points 21.5px out (inside a 44px target) land only on frame i */
          for (const [dx, dy] of dirs) {
            const x = P[i].x + dx, y = P[i].y + dy;
            const inOwn = Math.hypot(dx, dy) <= P[i].pad / 2;
            const inOther = P.some((q, k) => k !== i && Math.hypot(x - q.x, y - q.y) <= q.pad / 2);
            if (!inOwn || inOther) misses++;
          }
        }
      }
      assert.ok(worst > 0, `pads overlap: worst gap ${worst.toFixed(2)}px`);
      assert.strictEqual(misses, 0, "every tap point lands on its own frame");
    });
  }
}
