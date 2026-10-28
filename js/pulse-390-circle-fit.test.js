/* engineer/pulse-390-circle-fit: phones keep all five PULSE frames inside the panel. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const api = require("./pulse-falling-friends.js");

const G = { r: 320, tilt: 80 * Math.PI / 180, persp: 500, bob: 18, lift: 32 };

test("tower.js still uses the #265 orbit constants this test models", () => {
  const src = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  assert.ok(/var CIRCLE_TILT = 80 \* Math\.PI \/ 180;/.test(src));
  assert.ok(/var CIRCLE_RING_R = 320;/.test(src));
  assert.ok(/var CIRCLE_PERSPECTIVE = 500;/.test(src));
  assert.ok(/fitApi\.phoneOrbit\(fitLayer\.clientWidth/.test(src), "placeCircleSpots fits phones");
  assert.ok(/max-width: " \+ fitApi\.PHONE_MAX_W \+ "px/.test(src), "phone branch only below 768px");
  assert.strictEqual(api.PHONE_MAX_W, 767);
});

for (const vw of [360, 375, 390, 430]) {
  test(`${vw}px: every frame, at every orbit angle, sits >= 8px inside the panel`, () => {
    const panelW = vw - 32;
    const o = api.phoneOrbit(panelW, G);
    assert.strictEqual(o.ringW, panelW - 32);
    for (let a = 0; a < 360; a += 0.5) {
      const p = o.point(a);
      assert.ok(p.size >= 44 - 1e-9 && p.size <= 56 + 1e-9, `size ${p.size}`);
      assert.ok(Math.abs(p.x) + p.size / 2 <= panelW / 2 - 8 + 1e-6, `angle ${a} x ${p.x}`);
      assert.ok(Math.abs(p.x) <= o.ringW / 2 + 1e-6, "centre inside the ring box");
    }
    assert.strictEqual(Math.round(o.point(90).size), 56, "front frame 56px");
    assert.strictEqual(Math.round(o.point(-46).size), 44, "back frames 44px");
    assert.ok(o.top < 0 && o.bottom > 0);
  });
}

test("blockedBand covers the orbit reach so falling circles and chips stay clear", () => {
  const layer = {
    clientHeight: 800,
    style: { getPropertyValue: () => "" },
    getAttribute: (n) => (n === "data-pulse-orbit" ? "-120.0,150.0" : null),
    querySelectorAll: () => []
  };
  const band = api.blockedBand(layer);
  assert.ok(band.top <= 384 - 120 + 1e-6);
  assert.ok(band.bottom >= 384 + 150 - 1e-6);
});

test("phone CSS is scoped below 768px", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  const i = css.indexOf("engineer/pulse-390-circle-fit");
  assert.ok(i > 0);
  const block = css.slice(css.indexOf("@media (max-width: 767px) {", i), css.indexOf(".pulse-side-toggle {", i));
  assert.ok(/var\(--pulse-ring-w, min\(640px, 94vw\)\)/.test(block));
  assert.ok(/var\(--pulse-panel-w,/.test(block));
  assert.ok(/radial-gradient\(ellipse 53% 44% at 51% 44%, #000 74%, transparent 100%\)/.test(block), "#150 edge fade");
  assert.ok(/--pulse-name-px: 12px/.test(block));
});

/* engineer/pulse-chip-clearance: SeedOps 430 FAIL on 06f5bd8 (chip under a falling
   circle touched a back frame). On phones circles + chip sit below the orbit. */
function phoneLayer(vw, ringY) {
  const o = api.phoneOrbit(vw - 32, G);
  return {
    o,
    layer: {
      clientHeight: 900,
      style: { getPropertyValue: (n) => (n === "--pulse-ring-y" ? ringY + "px" : "") },
      getAttribute: (n) => (n === "data-pulse-orbit" ? o.top.toFixed(1) + "," + o.bottom.toFixed(1) : null),
      querySelectorAll: () => []
    }
  };
}
for (const vw of [360, 375, 390, 430]) {
  test(`${vw}px: falling circles and their chip clear every frame at every orbit angle (bob included)`, () => {
    const cy = 380;
    const { o, layer } = phoneLayer(vw, cy);
    for (const h of [260, 420, 700]) { /* short visible heights put live circles inside the ring */
      const L = api.phoneBelowRing(layer, { size: 28, slots: [{ x: 10, y: h - 62 }, { x: 60, y: h - 62 }] });
      for (const s of L.slots) {
        const chipTop = s.y + L.size + 2;
        const chipBottom = chipTop + api.PHONE_CHIP;
        for (let a = 0; a < 360; a += 0.5) {
          const p = o.point(a);
          for (const bob of [-18, 0, 18]) {
            const frameBottom = cy + p.y + bob + p.size / 2 + 22; /* + 12px name */
            assert.ok(s.y >= frameBottom + 16 - 1, `${vw} angle ${a}: circle top ${s.y} vs frame/name ${frameBottom}`);
            assert.ok(chipTop > frameBottom && chipBottom > chipTop);
          }
        }
      }
    }
  });
}
test("blockedBand adds the chip height (+8px gap) above the orbit on phones", () => {
  const { o, layer } = phoneLayer(430, 384);
  const band = api.blockedBand(layer);
  assert.ok(band.top <= 384 + o.top - 48 + 0.1);
  assert.strictEqual(api.PHONE_CHIP, 48);
});
test("desktop (no data-pulse-orbit) placement is untouched", () => {
  const layer = { clientHeight: 900, style: { getPropertyValue: () => "" }, getAttribute: () => null, querySelectorAll: () => [] };
  const L = { size: 40, slots: [{ x: 1, y: 100 }] };
  assert.strictEqual(api.phoneBelowRing(layer, L).slots[0].y, 100);
});
test("360 frames without a photo render like 375: solid fill, crisp white initial, no blur (every width since engineer/pulse-photo-onerror)", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  const i = css.indexOf("engineer/pulse-chip-clearance");
  const block = css.slice(css.indexOf("@media (max-width: 767px) {", i), css.indexOf(".pulse-side-toggle {", i));
  assert.ok(/\.circle-spot\.is-filled:not\(\[data-pulse-photo\]\) \{[^}]*color: #ffffff !important; text-shadow: none; filter: none;[^}]*background-image: none !important/.test(block));
  assert.ok(!/max-width: 3\d\dpx/.test(block), "no 360-only rule: 360 and 375 share one phone rule");
  assert.ok(/ellipse 86% 70% at 51% 47%/.test(block), "seam: top edge feathered");
  /* engineer/pulse-photo-onerror: the rule left the max-width: 767px block (1280 too). */
  const phone = block.slice(0, block.indexOf("\n}\n") + 3);
  assert.ok(!/is-filled:not\(\[data-pulse-photo\]\)/.test(phone), "photo-less rule is not inside the phone media query");
  assert.ok(/\n\.circle-fall\[data-pulse-bg\] \.circle-spot\.is-filled:not\(\[data-pulse-photo\]\) \{/.test(block), "photo-less rule at top level");
  assert.ok(/@media \(min-width: 768px\) \{\s*\.circle-fall\[data-pulse-bg\] \.circle-spot\.is-filled:not\(\[data-pulse-photo\]\) \{ font-size: 2\.128rem; \}/.test(block), "1280 initial = 38% of 5.6rem");
  assert.ok(!/a\.pulse-fall-circle/.test(block.slice(block.indexOf("engineer/pulse-photo-onerror") + 400)), "falling circles not matched");
});
