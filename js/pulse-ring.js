/**
 * PULSE ring balls (Alexa 2026-10-15 via Designer/PM; website restore base).
 * Friend photo circles sit on the halo ring in mirrored pairs (opposite sides).
 * Motion, all circles in step: hop to the next ring spot, then bounce in place
 * twice. At the three front spots the friend's name shows under the photo; on
 * the back spots the circle is faded with no name. Tap opens that friend's Tower.
 * prefers-reduced-motion: static spots, every name shown.
 * Pure math only (no DOM); tower.js paints. Run: node js/pulse-ring.test.js
 */
(function (root) {
  "use strict";

  var SPOTS = 8; /* 4 mirrored pairs */
  var HOP_MS = 700;
  var BOUNCE_MS = 450; /* ×2 per stop */
  var STEP_MS = HOP_MS + BOUNCE_MS * 2;
  var BOUNCE_PX = 14;
  var BACK_OPACITY = 0.35;

  /* Spot k sits at 90° + k·45°. 90° is stage front (nearest the viewer).
     Front spots are 45°, 90°, 135° (k = 7, 0, 1), so moving k → k+1 passes
     all three front spots in a row, then fades to the back. */
  function spotAngle(k) {
    k = ((k % SPOTS) + SPOTS) % SPOTS;
    return 90 + k * (360 / SPOTS);
  }

  function isFrontSpot(k) {
    k = ((k % SPOTS) + SPOTS) % SPOTS;
    return k === SPOTS - 1 || k === 0 || k === 1;
  }

  /* Friends → start spots. Pair i: friend 2i at spot i, friend 2i+1 directly
     opposite at spot i + SPOTS/2. Up to SPOTS friends ride the ring; the rest
     still fall and stay in the list underneath. */
  function assignSpots(friends) {
    var list = Array.isArray(friends) ? friends.slice(0, SPOTS) : [];
    var half = SPOTS / 2;
    return list.map(function (friend, n) {
      var pair = Math.floor(n / 2);
      var spot = n % 2 === 0 ? pair : pair + half;
      return { friend: friend, start: spot, pair: pair };
    });
  }

  function stepAt(t) {
    t = Math.max(0, t || 0);
    var step = Math.floor(t / STEP_MS);
    var into = t - step * STEP_MS;
    if (into < HOP_MS) return { step: step, phase: "hop", p: into / HOP_MS };
    var b = (into - HOP_MS) / BOUNCE_MS;
    return { step: step, phase: "bounce", bounce: Math.floor(b) + 1, p: b - Math.floor(b) };
  }

  /* One ball at time t. Returns spot, angle (deg), lift (px up), opacity, showName. */
  function ballAt(start, t, reduced) {
    if (reduced) {
      return { spot: start, angle: spotAngle(start), lift: 0, opacity: 1, showName: true, front: isFrontSpot(start) };
    }
    var s = stepAt(t);
    var from = start + s.step;
    var to = from + 1;
    if (s.phase === "hop") {
      var arc = Math.sin(Math.PI * s.p) * BOUNCE_PX * 1.6;
      var a = spotAngle(from) + (360 / SPOTS) * s.p;
      var fo = isFrontSpot(from) ? 1 : BACK_OPACITY;
      var tOp = isFrontSpot(to) ? 1 : BACK_OPACITY;
      return { spot: ((to % SPOTS) + SPOTS) % SPOTS, angle: a, lift: arc, opacity: fo + (tOp - fo) * s.p, showName: false, front: isFrontSpot(to) };
    }
    var front = isFrontSpot(to);
    return {
      spot: ((to % SPOTS) + SPOTS) % SPOTS,
      angle: spotAngle(to),
      lift: Math.sin(Math.PI * s.p) * BOUNCE_PX,
      opacity: front ? 1 : BACK_OPACITY,
      showName: front,
      front: front,
    };
  }

  function prefersReducedMotion(win) {
    try {
      return !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  }

  var api = {
    SPOTS: SPOTS,
    HOP_MS: HOP_MS,
    BOUNCE_MS: BOUNCE_MS,
    STEP_MS: STEP_MS,
    BACK_OPACITY: BACK_OPACITY,
    spotAngle: spotAngle,
    isFrontSpot: isFrontSpot,
    assignSpots: assignSpots,
    stepAt: stepAt,
    ballAt: ballAt,
    prefersReducedMotion: prefersReducedMotion,
  };
  if (root) root.CognationPulseRing = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
