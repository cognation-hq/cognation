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
