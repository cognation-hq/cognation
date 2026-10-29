/* engineer/pulse-halo-live-width (PM + HH; spec by HH): restore the accepted #310
   PULSE look on the live page. #310's values were measured with the PULSE layer as
   wide as the viewport (design harness); live, the layer sits inside .container
   (width: min(100% - 2rem, ...)), so it was the viewport minus 32px (360 -> 328,
   375 -> 343, 390 -> 358, 430 -> 398) and phoneOrbit(fitLayer.clientWidth) fitted
   smaller frames with no bob. This test models the LIVE layout from css/styles.css
   (.container width, then any phone rule that widens the PULSE layer) and drives the
   real tower.js phone branch (its phoneOrbit options, rotation path, bob expression)
   through the real phoneOrbit:
     - sizeK / bob per viewport match HH's spec,
     - adjacent frames keep >= 4.5px apart at every rotation step and bob phase,
     - the #313 tap pads (max(frame, --pulse-tap-pad)) never overlap at any phase,
     - tablets and 1280 are unchanged.
   Run: node --test js/pulse-halo-live-width.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const api = require("./pulse-falling-friends.js");

const towerSrc = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const num = (re) => { const m = towerSrc.match(re); assert.ok(m, String(re)); return m[1]; };
const CIRCLE_TILT = Number(num(/var CIRCLE_TILT = (\d+) \* Math\.PI \/ 180;/)) * Math.PI / 180;
const CIRCLE_RING_R = Number(num(/var CIRCLE_RING_R = (\d+);/));
const CIRCLE_PERSPECTIVE = Number(num(/var CIRCLE_PERSPECTIVE = (\d+);/));
const CIRCLE_SPOTS = new Function("return " + num(/var CIRCLE_SPOTS = (\[[\s\S]*?\]);/))();
const branch = towerSrc.slice(towerSrc.indexOf("function placeCircleSpots()"), towerSrc.indexOf("function circleSpotAt("));
const key = "fitApi.phoneOrbit(fitLayer.clientWidth, ";
assert.ok(branch.indexOf(key) > 0, "tower.js fits phones with phoneOrbit(fitLayer.clientWidth, ...)");
const optsSrc = branch.slice(branch.indexOf(key) + key.length, branch.indexOf("});", branch.indexOf(key)) + 1);
const G = new Function("CIRCLE_RING_R", "CIRCLE_TILT", "CIRCLE_PERSPECTIVE", "CIRCLE_SPOTS", "reduce", "return " + optsSrc)(CIRCLE_RING_R, CIRCLE_TILT, CIRCLE_PERSPECTIVE, CIRCLE_SPOTS, false);
const bobExpr = num(/var pbob = reduce \? 0 : ([^;]+);/);
const phoneBob = new Function("i", "t", "fit", "var performance = { now: function () { return t; } }; return " + bobExpr + ";");
const PHONE_MAX = api.PHONE_MAX_W;

/* ---------- live layout from css/styles.css ---------- */
const REM = 16;
/* Top-level and @media (max-width / min-width) rules, in source order. */
const MEDIA = (() => {
  const re = /@media ([^{]+)\{/g;
  const media = [];
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    media.push({ q: m[1].trim(), start: re.lastIndex, end: i - 1, from: m.index });
    re.lastIndex = i;
  }
  return media;
})();
const TOP = (() => {
  const parts = [];
  let at = 0;
  MEDIA.forEach((b) => { parts.push(css.slice(at, b.from), " ".repeat(b.end + 1 - b.from)); at = b.end + 1; });
  parts.push(css.slice(at));
  return parts.join("");
})();
const ruleCache = {};
function rulesFor(selector, vw) {
  const ck = selector + "@" + vw;
  if (ruleCache[ck]) return ruleCache[ck];
  const out = [];
  const media = MEDIA;
  const applies = (q) => {
    const max = /\(max-width: (\d+)px\)/.exec(q), min = /\(min-width: (\d+)px\)/.exec(q);
    if (/prefers-|hover|pointer|orientation|print|height/.test(q)) return false;
    return (!max || vw <= Number(max[1])) && (!min || vw >= Number(min[1]));
  };
  const scan = (body, offset, ok) => {
    body.replace(/([^{}]+)\{([^{}]*)\}/g, (all, sel, decl, at) => {
      if (!ok) return all;
      if (sel.split(",").map((s) => s.trim()).indexOf(selector) < 0) return all;
      const d = {};
      decl.split(";").forEach((p) => { const k = p.indexOf(":"); if (k > 0) d[p.slice(0, k).trim()] = p.slice(k + 1).trim(); });
      out.push({ at: offset + at, d });
      return all;
    });
  };
  scan(TOP, 0, true); /* top level, media blocks blanked out */
  media.forEach((b) => { if (applies(b.q)) scan(css.slice(b.start, b.end), b.start, true); });
  ruleCache[ck] = out.sort((a, b) => a.at - b.at).reduce((acc, r) => Object.assign(acc, r.d), {});
  return ruleCache[ck];
}
/* calc/min with %, rem, px: only the forms these rules use. */
function len(v, pct) {
  const s = String(v).trim();
  let m;
  if ((m = /^min\(100% - ([\d.]+)rem, var\(--max-width\)\)$/.exec(s))) return pct - Number(m[1]) * REM; /* max-width is wider than any phone */
  if ((m = /^calc\(100% \+ ([\d.]+)rem\)$/.exec(s))) return pct + Number(m[1]) * REM;
  if (s === "100%") return pct;
  if ((m = /^(-?[\d.]+)rem$/.exec(s))) return Number(m[1]) * REM;
  if ((m = /^(-?[\d.]+)px$/.exec(s))) return Number(m[1]);
  if (s === "auto" || s === "0") return 0;
  throw new Error("unsupported length " + s);
}
/* The live chain: section (viewport) > .container > .tabs > .circle-page > .circle-fall[data-pulse-bg]. */
function liveLayout(vw) {
  const c = rulesFor(".container", vw);
  const containerW = len(c.width, vw);
  const l = Object.assign({}, rulesFor(".circle-fall", vw), rulesFor(".circle-fall[data-pulse-bg]", vw));
  const layerW = len(l.width || "100%", containerW);
  const ml = l["margin-inline"] ? len(l["margin-inline"].split(/\s+/)[0], containerW) : 0;
  const left = (vw - containerW) / 2 + ml;
  return { containerW, layerW, left, right: left + layerW };
}

/* ---------- tower.js phone branch, as written ---------- */
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
const PAD_SEL = ".circle-fall[data-pulse-bg] .circle-spot.is-filled::after";
function padDiameter(vw, frame, tapPad) {
  const r = rulesFor(PAD_SEL, vw);
  if (!r.width) return frame; /* no pad: the frame is the target */
  let m;
  if ((m = /^max\(100%,\s*var\(--pulse-tap-pad,\s*([\d.]+)px\)\)$/.exec(r.width))) return Math.max(frame, typeof tapPad === "number" ? tapPad : Number(m[1]));
  if ((m = /^max\(100%,\s*([\d.]+)px\)$/.exec(r.width))) return Math.max(frame, Number(m[1]));
  throw new Error("unsupported pad width " + r.width);
}
/* Worst adjacent clearance over rotation (every 0.0005 of a spot step) and every bob
   phase, both exactly (vertical offset sweeps [-A*M, A*M]) and by sampling the
   bob expression tower.js runs. sizeOf(frame) -> circle diameter to separate. */
function worstClear(o, sizeOf) {
  const n = CIRCLE_SPOTS.length;
  let worst = Infinity;
  for (let s = 0; s < n; s += 0.0005) {
    const P = [];
    for (let i = 0; i < n; i++) { const p = spotAt(i + s); const size = o.sizeAt(p.d); P.push({ x: p.x * o.f, y: p.y * o.f, size, c: sizeOf(size) }); }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = P[i], b = P[j];
      const M = 2 * Math.abs(Math.sin(1.2 * (i - j) / 2));
      const dy = Math.max(0, Math.abs(a.y - b.y) - o.bob * M);
      const c = Math.hypot(a.x - b.x, dy) - (a.c + b.c) / 2;
      if (c < worst) worst = c;
    }
  }
  /* cross-check with the bob as tower.js computes it, sampled over one period */
  const PERIOD = 360 * Math.PI * 2;
  for (let s = 0; s < n; s += 0.01) {
    const base = [];
    for (let i = 0; i < n; i++) { const p = spotAt(i + s); base.push({ x: p.x * o.f, y: p.y * o.f, size: o.sizeAt(p.d) }); }
    for (let t = 0; t < PERIOD; t += PERIOD / 96) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = base[i], b = base[j];
        const c = Math.hypot(a.x - b.x, a.y + phoneBob(i, t, o) - b.y - phoneBob(j, t, o)) - (sizeOf(a.size) + sizeOf(b.size)) / 2;
        if (c < worst - 1e-9) worst = c;
      }
    }
  }
  return worst;
}

const LIVE = { 360: 328, 375: 343, 390: 358, 430: 398 };
const SPEC = { 430: { k: [1, 1], bob: 2.8 }, 390: { k: [0.88, 0.88], bob: 3.2 }, 375: { k: [0.88, 0.88], bob: 1.5 }, 360: { k: [0.87, 0.88], bob: 0 } };
const fits = {};
function fitFor(vw) { if (!fits[vw]) fits[vw] = api.phoneOrbit(liveLayout(vw).layerW, G); return fits[vw]; }

test("live layout: .container is the viewport minus 32px (360 -> 328, 375 -> 343, 390 -> 358, 430 -> 398)", () => {
  for (const vw of Object.keys(LIVE).map(Number)) assert.strictEqual(liveLayout(vw).containerW, LIVE[vw], "container at " + vw);
});

for (const vw of [360, 375, 390, 430]) {
  test(`${vw}: the PULSE layer spans the viewport on the live page (0 to ${vw}), so phoneOrbit sees ${vw}`, () => {
    const L = liveLayout(vw);
    assert.strictEqual(L.layerW, vw, "layer width at " + vw + " (container " + L.containerW + ")");
    assert.strictEqual(L.left, 0, "layer starts at the screen edge");
    assert.strictEqual(L.right, vw, "layer ends at the screen edge");
  });
  test(`${vw}: sizeK ${SPEC[vw].k[0] === SPEC[vw].k[1] ? SPEC[vw].k[0] : "~0.874"} and bob ${SPEC[vw].bob}px at the live layer width (HH spec)`, () => {
    const o = fitFor(vw);
    assert.ok(o.sizeK >= SPEC[vw].k[0] - 1e-9 && o.sizeK <= SPEC[vw].k[1] + 1e-9, `sizeK at ${vw}: ${o.sizeK.toFixed(4)}`);
    assert.strictEqual(o.bob, SPEC[vw].bob, "bob at " + vw);
    if (vw === 430) { assert.strictEqual(o.sizeAt(1), 44, "430 back frame 44px"); }
  });
  test(`${vw}: adjacent frames keep >= 4.5px apart at every rotation step and bob phase (live layer)`, () => {
    const o = fitFor(vw);
    const worst = worstClear(o, (s) => s);
    assert.ok(worst >= 4.5, `min gap at ${vw}: ${worst.toFixed(3)}px`);
  });
  test(`${vw}: every frame stays on screen (>= 8px from the layer edges) and the layer is not clipped by its parents`, () => {
    const o = fitFor(vw);
    const L = liveLayout(vw);
    for (let a = 0; a < 360; a += 0.5) {
      const p = o.point(a);
      assert.ok(L.layerW / 2 - Math.abs(p.x) - p.size / 2 >= 8 - 1e-6, "frame at " + a + "deg");
    }
    /* live chain (measured headless): .circle-page > .tabs.tabs--chrome > .container */
    for (const sels of [[".container"], [".tabs", ".tabs.tabs--chrome"], [".circle-page"]]) {
      const sel = sels[sels.length - 1];
      const r = Object.assign.apply(null, [{}].concat(sels.map((x) => rulesFor(x, vw))));
      assert.ok(!/hidden|clip/.test(r.overflow || "") && !/hidden|clip/.test(r["overflow-x"] || ""), sel + " does not clip the full-bleed layer");
    }
  });
}

for (const vw of [360, 375, 390]) {
  test(`${vw}: #313 tap pads (max(frame, --pulse-tap-pad)) never overlap at any rotation or bob phase; pad >= frame`, () => {
    const o = fitFor(vw);
    assert.ok(typeof o.tapPad === "number" && o.tapPad <= 44, "phoneOrbit returns a tap pad <= 44: " + o.tapPad);
    assert.strictEqual(o.tapPad, 44, "the full 44px pad fits at " + vw);
    const worst = worstClear(o, (s) => padDiameter(vw, s, o.tapPad));
    assert.ok(worst >= 0, `pads overlap at ${vw}: ${worst.toFixed(3)}px`);
    for (const s of [o.sizeAt(1), o.sizeAt(1.2)]) assert.ok(padDiameter(vw, s, o.tapPad) >= s, "pad never smaller than its frame");
  });
}

test("tap pad cap: on a narrower panel the pad shrinks just enough that pads never overlap (328px panel, the old live 360)", () => {
  const o = api.phoneOrbit(328, G);
  assert.ok(o.tapPad < 44 && o.tapPad >= o.sizeAt(1), "capped pad " + o.tapPad);
  assert.ok(worstClear(o, (s) => padDiameter(360, s, o.tapPad)) >= 0, "capped pads clear");
  assert.ok(worstClear(o, (s) => padDiameter(360, s, 44)) < 0, "an uncapped 44px pad would overlap there");
});

test("tower.js passes the pad cap to CSS and the pad rule reads it (fallback 44px)", () => {
  assert.ok(/fitLayer\.style\.setProperty\("--pulse-tap-pad", fit\.tapPad\.toFixed\(1\) \+ "px"\)/.test(branch), "sets --pulse-tap-pad");
  assert.ok(/fitLayer\.style\.removeProperty\("--pulse-tap-pad"\)/.test(branch), "clears it off phones");
  const r = rulesFor(PAD_SEL, 390);
  assert.strictEqual(r.width, "max(100%, var(--pulse-tap-pad, 44px))");
  assert.strictEqual(r.height, "max(100%, var(--pulse-tap-pad, 44px))");
  assert.strictEqual(rulesFor(PAD_SEL, 430).width, undefined, "430 has no pad (frames are 44px+)");
});

test("phone frames are placed with 2-decimal px so rounding cannot eat the 4.5px gap", () => {
  assert.ok(/spots\[i\]\.style\.width = px\.toFixed\(2\) \+ "px";/.test(branch));
  assert.ok(/translate\(" \+ \(pos\.x \* fit\.f\)\.toFixed\(2\) \+ "px," \+ \(pos\.y \* fit\.f \+ pbob\)\.toFixed\(2\) \+ "px\) scale\(1\)"/.test(branch));
});

test("tablets (768+) and 1280 are unchanged: layer = .container, desktop orbit code untouched", () => {
  for (const vw of [768, 1024, 1280]) {
    const L = liveLayout(vw);
    assert.strictEqual(L.layerW, L.containerW, "layer = container at " + vw);
    assert.strictEqual(L.left, (vw - L.containerW) / 2);
  }
  assert.ok(vw767(), "the full-bleed rule is phones only (max-width: " + PHONE_MAX + "px)");
  assert.ok(/max-width: " \+ fitApi\.PHONE_MAX_W \+ "px/.test(branch), "phone branch only below 768px");
  assert.ok(/var bob = reduce \? 0 : Math\.sin\(performance\.now\(\) \/ 360 \+ i \* 1\.2\) \* 18;/.test(branch), "desktop bob");
  assert.ok(/var size = 5\.6;/.test(branch), "desktop size");
  assert.ok(/var scale = 0\.8 \+ Math\.max\(0, depth - 0\.68\) \* 0\.4;/.test(branch), "desktop scale");
  assert.ok(/translate\(" \+ pos\.x\.toFixed\(1\) \+ "px," \+ \(pos\.y \+ bob\)\.toFixed\(1\) \+ "px\) scale\(" \+ scale\.toFixed\(3\) \+ "\)"/.test(branch), "desktop transform");
});
function vw767() {
  const l = rulesFor(".circle-fall[data-pulse-bg]", PHONE_MAX), t = rulesFor(".circle-fall[data-pulse-bg]", PHONE_MAX + 1);
  return l.width === "calc(100% + 2rem)" && t.width === undefined;
}

test("bob keeps the ripple phase sin(t/360 + 1.2*i); only the amplitude depends on width", () => {
  assert.ok(/^Math\.sin\(performance\.now\(\) \/ 360 \+ i \* 1\.2\) \* fit\.bob$/.test(bobExpr), bobExpr);
  assert.strictEqual(G.bobPhase, 1.2);
});
