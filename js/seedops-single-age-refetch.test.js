/**
 * After sign-in, Tower seed posts are read once, after the viewer's age loads.
 *
 * Before: seedops-tower-hydrate read them on session-started (age not known
 * yet), then read the same posts again when the age arrived (the dating
 * hydrate report, and since #312 tower.js on cognation:viewer-age-changed).
 * Two identical bursts ~2 s apart unless the second ask landed while the
 * first read was still out. Timings below follow SeedOps' live runs at 1280
 * and 390 (age ~1.8 s after sign-in; posts read ~0.3 s per request).
 * Run: node --test js/seedops-single-age-refetch.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var tower = src("js/tower.js");

function memStorage() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
  };
}

/* Virtual clock: timers and request latency run on it. */
function clock() {
  var now = 0, seq = 0, q = [];
  return {
    now: function () { return now; },
    setTimeout: function (fn, ms) { var id = ++seq; q.push({ id: id, at: now + (ms || 0), fn: fn }); return id; },
    clearTimeout: function (id) { q = q.filter(function (t) { return t.id !== id; }); },
    advance: async function (ms) {
      var end = now + ms;
      for (;;) {
        await new Promise(function (r) { setImmediate(r); });
        q.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
        if (!q.length || q[0].at > end) break;
        var t = q.shift();
        now = Math.max(now, t.at);
        t.fn();
      }
      now = end;
      await new Promise(function (r) { setImmediate(r); });
    },
  };
}

var SEEDS = 280;

/* profile: { latency } ms per request. Every request is logged with its
   method; only GET-style reads (rest without a method) are expected. */
function world(profile, start) {
  var c = clock();
  var log = [];
  var listeners = {};
  var session = { signedIn: !!start.signedIn };
  var sess = memStorage();
  if (start.datingCached) sess.setItem("cognation.seedops.datingHydrate.v2", JSON.stringify({ ok: true }));
  function later(v) { return new Promise(function (r) { c.setTimeout(function () { r(v); }, profile.latency); }); }
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
  var win = {
    document: doc,
    addEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return session.signedIn ? { supabaseUserId: "u-1" } : null; } },
    CognationSeedOpsDatingHydrate: { hydrate: function () { return Promise.resolve({ ok: true }); } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return session.signedIn ? { access_token: "t" } : null; },
      getUser: function () { return later(session.signedIn ? { id: "u-1" } : null); },
      rest: function (table, opts) {
        var q = String((opts && opts.query) || "");
        log.push({ t: c.now(), table: table, method: (opts && opts.method) || "GET", q: q });
        if (table === "profiles" && /account_kind=eq\.seed/.test(q)) {
          var rows = [];
          for (var i = 0; i < SEEDS; i++) {
            var n = String(i + 1); while (n.length < 4) n = "0" + n;
            rows.push({ id: "srv-" + i, user_id: "us-" + i, handle: "s" + i, display_name: "S" + i, bio: "", account_kind: "seed", seed_fleet_id: "seed-" + n, kind: "personal" });
          }
          return later(rows);
        }
        return later([]);
      },
    },
    CognationSeedOps: { getByFleetId: function (fleet) { return { id: "local-" + fleet, displayName: "S" }; } },
    CognationAccounts: { getProfileById: function () { return null; }, saveProfileRecord: function () {} },
    CognationTowerStore: { load: function () { return null; }, setRemotePosts: function (p) { return p; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: memStorage(), sessionStorage: sess,
    CustomEvent: win.CustomEvent, console: console, Promise: Promise,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
  });
  vm.runInContext(src("js/seedops-tower-hydrate.js"), ctx, { filename: "seedops-tower-hydrate.js" });
  function fire(name, detail) { doc.dispatchEvent(new win.CustomEvent(name, { detail: detail || {} })); }
  /* tower.js on cognation:viewer-age-changed when posts were held back. */
  function towerAgeHook() {
    var hyd = win.CognationSeedOpsTowerHydrate;
    if (/hyd\.readAfterAge\(/.test(tower) && typeof hyd.readAfterAge === "function") {
      hyd.readAfterAge({ reason: "viewer_age_changed", fillEmpty: false });
    } else {
      hyd.hydrate({ force: true, fillEmpty: false });
    }
  }
  /* The age lands: commune-swipe emits viewer-age-changed, then the dating
     hydrate finishes its bios and reports. */
  function ageLoads() {
    towerAgeHook();
    c.setTimeout(function () { fire("cognation:seedops-dating-hydrate", { action: "hydrate", ok: true, result: { ok: true } }); }, profile.reportAfterAge);
  }
  return { clock: c, log: log, fire: fire, session: session, ageLoads: ageLoads };
}

/* Seed post reads (author_profile_id=in.) grouped into bursts (gap < 400 ms). */
function postBursts(log, from) {
  var reads = log.filter(function (r) { return r.t >= from && r.table === "tower_posts" && /author_profile_id=in\./.test(r.q); });
  var bursts = [];
  reads.forEach(function (r) {
    var last = bursts[bursts.length - 1];
    if (last && r.t - last.end < 400) { last.end = r.t; last.n += 1; }
    else bursts.push({ start: r.t, end: r.t, n: 1 });
  });
  return bursts;
}
function writes(log) { return log.filter(function (r) { return r.method !== "GET"; }); }

var PROFILES = {
  "1280": { latency: 300, ageAfter: 1800, reportAfterAge: 60 },
  "390": { latency: 280, ageAfter: 1750, reportAfterAge: 40 },
};

Object.keys(PROFILES).forEach(function (w) {
  var p = PROFILES[w];

  test(w + ": fresh sign-in reads seed posts once, after the age loads", async function () {
    var x = world(p, { signedIn: false });
    await x.clock.advance(5000); /* signed-out boot read */
    var t0 = x.clock.now();
    x.session.signedIn = true;
    x.fire("cognation:session-started");
    await x.clock.advance(p.ageAfter);
    var ageAt = x.clock.now();
    x.ageLoads();
    await x.clock.advance(9000);
    var b = postBursts(x.log, t0);
    assert.equal(b.length, 1, "one seed-post read burst after sign-in, got " + JSON.stringify(b));
    assert.equal(b[0].n, Math.ceil(250 / 40));
    assert.ok(b[0].start >= ageAt, "the read starts after the age loads");
    assert.deepEqual(writes(x.log), [], "no network writes");
  });

  test(w + ": in-context sign-in after sign-out reads once, after the age loads", async function () {
    var x = world(p, { signedIn: true, datingCached: true });
    await x.clock.advance(5000);
    x.session.signedIn = false;
    x.fire("cognation:session-ended");
    await x.clock.advance(5000);
    var t0 = x.clock.now();
    x.session.signedIn = true;
    x.fire("cognation:session-started");
    await x.clock.advance(p.ageAfter);
    var ageAt = x.clock.now();
    x.ageLoads();
    await x.clock.advance(9000);
    var b = postBursts(x.log, t0);
    assert.equal(b.length, 1, "one burst, got " + JSON.stringify(b));
    assert.ok(b[0].start >= ageAt);
    assert.deepEqual(writes(x.log), []);
  });

  test(w + ": signed-in reload reads once, after the age loads", async function () {
    var x = world(p, { signedIn: true });
    var bootAge = 200 + p.ageAfter; /* dating boot at 200 ms, then user + age */
    await x.clock.advance(bootAge);
    var ageAt = x.clock.now();
    x.ageLoads();
    await x.clock.advance(9000);
    var b = postBursts(x.log, 0);
    assert.equal(b.length, 1, "one burst, got " + JSON.stringify(b));
    assert.ok(b[0].start >= ageAt);
    assert.deepEqual(writes(x.log), []);
  });
});

/* The dating cache holds no age (dating-cache-age-scope): a signed-in reload
   with it still waits for this load's user_birth answer and the report. */
Object.keys(PROFILES).forEach(function (w) {
  var p = PROFILES[w];
  test(w + ": signed-in reload with a dating cache reads once, after the age loads", async function () {
    var x = world(p, { signedIn: true, datingCached: true });
    var bootAge = 200 + p.ageAfter;
    await x.clock.advance(bootAge);
    var ageAt = x.clock.now();
    x.ageLoads();
    await x.clock.advance(9000);
    var b = postBursts(x.log, 0);
    assert.equal(b.length, 1, "one burst, got " + JSON.stringify(b));
    assert.ok(b[0].start >= ageAt, "the read waits for the age, not the cache");
    assert.deepEqual(writes(x.log), []);
  });
});

test("a later dating hydrate in the same session does not re-read; a saved birth month does once", async function () {
  var p = PROFILES["1280"];
  var x = world(p, { signedIn: false });
  await x.clock.advance(5000);
  var t0 = x.clock.now();
  x.session.signedIn = true;
  x.fire("cognation:session-started");
  await x.clock.advance(p.ageAfter);
  x.ageLoads();
  await x.clock.advance(5000);
  x.fire("cognation:seedops-dating-hydrate", { action: "hydrate", ok: true });
  await x.clock.advance(5000);
  assert.equal(postBursts(x.log, t0).length, 1);
  x.fire("cognation:birth-saved");
  await x.clock.advance(1000);
  x.ageLoads();
  await x.clock.advance(5000);
  assert.equal(postBursts(x.log, t0).length, 2, "birth-saved allows one more after-age read");
  assert.deepEqual(writes(x.log), []);
});

test("no age report: the waiting read still goes out once", async function () {
  var x = world(PROFILES["1280"], { signedIn: false });
  await x.clock.advance(5000);
  var t0 = x.clock.now();
  x.session.signedIn = true;
  x.fire("cognation:session-started");
  await x.clock.advance(20000);
  assert.equal(postBursts(x.log, t0).length, 1);
});

test("tower.js routes its age-change refetch through readAfterAge", function () {
  assert.ok(/hyd\.readAfterAge\(\{ reason: "viewer_age_changed", fillEmpty: false \}\)/.test(tower), "tower.js calls readAfterAge");
});
