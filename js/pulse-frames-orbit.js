/**
 * PULSE frames orbit (Alexa 2026-10-22, "Bring back the five frames slowly
 * circling the ring"). The five halo frames glide around the ring again at a
 * steady speed, one full turn every 28 seconds (linear: same on-screen speed
 * all the way round, no easing).
 *
 * The path runs through the five spots where the frames are pinned now (left,
 * center, right, back-right, back-left, image px relative to the ring centre),
 * along the ring's oval. It never goes higher than the two back spots and never
 * wider than the left/right spots, so the frames stay inside the same band the
 * falling circles already keep clear of.
 *
 * Frames only slide (translate + depth scale); nothing around them turns, so
 * there is no rotation to counter and photos stay upright (net 0deg) the
 * whole way round.
 * prefers-reduced-motion: no orbit; frames stay pinned where they are.
 * Run: node js/pulse-frames-orbit.test.js
 */
(function (root) {
  "use strict";

  var ORBIT_MS = 28000;
  var ORDER = ["left", "center", "right", "back-right", "back-left"];
  /* Ring oval fitted to the five pinned spots (image px). */
  var OVAL = { cx: 12.5, cy: -42, a: 490.5, b: 180 };
  var STEPS = 90; /* samples per segment */

  function rad(d) { return d * Math.PI / 180; }

  /* Depth scale from height on the ring, read from the pinned spots:
     back (highest) smallest, sides in between, front (lowest) largest. */
  function scaleTable(spots) {
    var seen = {};
    var rows = [];
    ORDER.forEach(function (id) {
      var sq = spots[id];
      if (!sq || seen[sq.y]) return;
      seen[sq.y] = true;
      rows.push({ y: sq.y, s: sq.s });
    });
    rows.sort(function (p, q) { return p.y - q.y; });
    return rows;
  }

  function scaleAtY(rows, y) {
    if (!rows.length) return 1;
    if (y <= rows[0].y) return rows[0].s;
    for (var i = 1; i < rows.length; i++) {
      if (y <= rows[i].y) {
        var m = (y - rows[i - 1].y) / (rows[i].y - rows[i - 1].y);
        return rows[i - 1].s + (rows[i].s - rows[i - 1].s) * m;
      }
    }
    return rows[rows.length - 1].s;
  }

  /* Closed path through the pinned spots, sampled and measured by length. */
  function buildPath(spots) {
    var o = OVAL;
    var nodes = ORDER.map(function (id) {
      var sq = spots[id];
      var t = Math.atan2((sq.y - o.cy) / o.b, (sq.x - o.cx) / o.a) * 180 / Math.PI;
      var ex = o.cx + o.a * Math.cos(rad(t));
      var ey = o.cy + o.b * Math.sin(rad(t));
      return { id: id, x: sq.x, y: sq.y, t: t, dx: sq.x - ex, dy: sq.y - ey };
    });
    var topY = Math.min.apply(null, nodes.map(function (n) { return n.y; }));
    var minX = Math.min.apply(null, nodes.map(function (n) { return n.x; }));
    var maxX = Math.max.apply(null, nodes.map(function (n) { return n.x; }));
    var pts = [];
    var nodeIndex = {};
    for (var n = 0; n < nodes.length; n++) {
      var from = nodes[n];
      var to = nodes[(n + 1) % nodes.length];
      var t1 = to.t;
      if (t1 >= from.t) t1 -= 360;
      var flat = from.y === topY && to.y === topY; /* far side: straight across, never above */
      nodeIndex[from.id] = pts.length;
      for (var j = 0; j < STEPS; j++) {
        var m = j / STEPS;
        var x, y;
        if (j === 0) { x = from.x; y = from.y; }
        else if (flat) { x = from.x + (to.x - from.x) * m; y = topY; }
        else {
          var t = from.t + (t1 - from.t) * m;
          var w = (1 - Math.cos(Math.PI * m)) / 2; /* smooth blend of the fit error */
          x = o.cx + o.a * Math.cos(rad(t)) + from.dx * (1 - w) + to.dx * w;
          y = o.cy + o.b * Math.sin(rad(t)) + from.dy * (1 - w) + to.dy * w;
          if (y < topY) y = topY;
          if (x < minX) x = minX;
          if (x > maxX) x = maxX;
        }
        pts.push({ x: x, y: y });
      }
    }
    var arc = [0];
    for (var i = 1; i <= pts.length; i++) {
      var p = pts[i - 1], q = pts[i % pts.length];
      arc.push(arc[i - 1] + Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)));
    }
    var start = {};
    ORDER.forEach(function (id) { start[id] = arc[nodeIndex[id]]; });
    return { pts: pts, arc: arc, length: arc[pts.length], start: start, scales: scaleTable(spots), topY: topY, minX: minX, maxX: maxX };
  }

  function pointAt(path, dist) {
    var L = path.length;
    var d = ((dist % L) + L) % L;
    var lo = 0, hi = path.pts.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (path.arc[mid] <= d) lo = mid; else hi = mid - 1; }
    var p = path.pts[lo], q = path.pts[(lo + 1) % path.pts.length];
    var seg = path.arc[lo + 1] - path.arc[lo];
    var m = seg > 0 ? (d - path.arc[lo]) / seg : 0;
    var y = p.y + (q.y - p.y) * m;
    return { x: p.x + (q.x - p.x) * m, y: y, s: scaleAtY(path.scales, y) };
  }

  /* Where frame `id` sits `elapsedMs` after PULSE opened (0 = its pinned spot).
     rotate is the photo's net turn: always 0 (upright). */
  function frameAt(path, id, elapsedMs) {
    var turn = (elapsedMs || 0) / ORBIT_MS;
    var p = pointAt(path, path.start[id] + turn * path.length);
    return { x: p.x, y: p.y, s: p.s, rotate: 0 };
  }

  /* Inline transform for a frame: translate + scale only, never rotate. */
  function frameTransform(f, k, grow) {
    return "translate(-50%, -50%) translate(" + (f.x * k).toFixed(1) + "px," + (f.y * k).toFixed(1) + "px) scale(" + (f.s * grow).toFixed(3) + ")";
  }

  function reducedMotion(win) {
    win = win || root;
    try {
      return !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  var api = {
    ORBIT_MS: ORBIT_MS,
    ORDER: ORDER,
    buildPath: buildPath,
    pointAt: pointAt,
    frameAt: frameAt,
    frameTransform: frameTransform,
    reducedMotion: reducedMotion,
  };
  if (root) root.CognationPulseOrbit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
