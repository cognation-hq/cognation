/**
 * Signing in writes nothing: no tower_posts insert, no other non-GET call
 * from the Tower seed hydrate.
 *
 * Before: the signed-out boot read (seedops-tower-hydrate) was often still
 * out when the member signed in. When it came back it ran as the new
 * session: it applied the signed-out rows, labelled BOOT_FLAG with the
 * member's viewer key, and filled "empty" seed shells through postOne
 * without localOnly. A seed signing in whose own friends-only post the anon
 * read could not see got a live tower_posts insert (template body). The
 * after-age read did the same for a seed with no posts.
 *
 * Now: hydrate's empty-shell fill is local only (live seed posts come only
 * from an explicit ops-panel run), and a flight started before
 * session-started / session-ended / auth-changed drops its results.
 * Timings follow SeedOps' live runs at 1280 and 390.
 * Run: node --test js/signin-zero-writes.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

var BOOT_FLAG = "cognation.seedops.towerHydrate.v1";
var OVERLAY_KEY = "cognation.seedops.tower.posts.v1";
var SEEDS = 280;
var ME = "seed-0015";
var ME_SRV = "srv-14";
/* The seed's own sign-in address on the seed auth domain (built, not literal). */
var ME_LOGIN = [ME, "seed.cognation.internal"].join("@");

/* Non-GET calls a sign-in may make: auth token / refresh, read-only RPCs,
   the session activity ping. Anything else is a write. */
var READ_ONLY_RPC = ["get_my_age_band", "viewer_age_band", "is_handle_available"];
function allowed(r) {
  if (r.method === "GET") return true;
  if (/^auth\/v1\/(token|refresh)/.test(r.table)) return true;
  if (r.table === "/api/session/activity") return true;
  var m = /^rpc\/(.+)$/.exec(r.table);
  return !!(m && READ_ONLY_RPC.indexOf(m[1]) >= 0);
}
function writes(log) { return log.filter(function (r) { return !allowed(r); }); }

function memStorage(onSet) {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); if (onSet) onSet(k, v); },
    removeItem: function (k) { delete m[k]; },
  };
}

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

function pad(n) { n = String(n); while (n.length < 4) n = "0" + n; return n; }

/* lat: { profiles, posts, other } ms. opts.signedIn: session at boot.
   opts.mePosts: the seed's own friends-only post exists on the server
   (visible only to a signed-in read). */
function world(lat, opts) {
  opts = opts || {};
  var c = clock();
  var log = [];
  var writesTo = { store: [], overlay: [], bootFlag: [] };
  var listeners = {};
  var session = { signedIn: !!opts.signedIn };
  var local = memStorage(function (k) { if (k === OVERLAY_KEY) writesTo.overlay.push(c.now()); });
  var sess = memStorage(function (k) { if (k === BOOT_FLAG) writesTo.bootFlag.push(c.now()); });
  function later(v, ms) { return new Promise(function (r) { c.setTimeout(function () { r(v); }, ms); }); }
  function postRows(q, signedIn) {
    var m = /author_profile_id=in\.\(([^)]*)\)/.exec(q);
    var ids = m ? m[1].split(",").map(decodeURIComponent) : [];
    var rows = [];
    ids.forEach(function (id) {
      var i = Number(id.replace("srv-", ""));
      if (id === ME_SRV && (!signedIn || opts.mePosts === false)) return;
      rows.push({
        id: "tp-" + i, author_profile_id: id, body: "note " + i,
        visibility: id === ME_SRV ? "friends" : "public", attachments: [],
        created_at: "2026-10-20T15:00:00Z", rating: "G",
        author: { id: id, user_id: "us-" + i, kind: "personal", handle: "s" + i, display_name: "S" + i, account_kind: "seed", seed_fleet_id: "seed-" + pad(i + 1) },
      });
    });
    return rows;
  }
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
    CognationAuth: {
      getSession: function () {
        return session.signedIn ? { supabaseUserId: "u-1", username: ME_LOGIN, activeProfileId: "local-" + ME } : null;
      },
    },
    CognationSeedOpsDatingHydrate: { hydrate: function () { return Promise.resolve({ ok: true }); } },
    CognationSupabaseSocial: {
      active: function () { return session.signedIn; },
      createTowerPost: function (p) {
        log.push({ t: c.now(), table: "tower_posts", method: "POST", q: "", body: p && p.body });
        return later({ id: "new-1" }, lat.other);
      },
    },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return session.signedIn ? { access_token: "t" } : null; },
      getUser: function () {
        return later(session.signedIn ? { id: "u-1", app_metadata: { seed_fleet_id: ME } } : null, lat.other);
      },
      rpc: function (name) {
        log.push({ t: c.now(), table: "rpc/" + name, method: "POST", q: "" });
        return later(null, lat.other);
      },
      rest: function (table, o) {
        var q = String((o && o.query) || "");
        var signedIn = session.signedIn;
        log.push({ t: c.now(), table: table, method: (o && o.method) || "GET", q: q, signedIn: signedIn });
        if (table === "profiles" && /account_kind=eq\.seed/.test(q)) {
          var rows = [];
          for (var i = 0; i < SEEDS; i++) {
            rows.push({ id: "srv-" + i, user_id: "us-" + i, handle: "s" + i, display_name: "S" + i, bio: "", account_kind: "seed", seed_fleet_id: "seed-" + pad(i + 1), kind: "personal" });
          }
          return later(rows, lat.profiles);
        }
        if (table === "tower_posts") return later(postRows(q, signedIn), lat.posts);
        return later([], lat.other);
      },
    },
    CognationSeedOps: {
      getByFleetId: function (fleet) {
        return { id: "local-" + fleet, seedFleetId: fleet, isSeed: true, accountKind: "seed", handle: fleet, displayName: fleet === ME ? "Chris" : "S" };
      },
    },
    CognationAccounts: { getProfileById: function () { return null; }, saveProfileRecord: function () {} },
    CognationTowerStore: {
      load: function () { return null; },
      setRemotePosts: function (p) { writesTo.store.push(c.now()); return p; },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: local, sessionStorage: sess,
    CustomEvent: win.CustomEvent, console: console, Promise: Promise,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, Date: Date,
  });
  vm.runInContext(src("js/seedops-tower-posts.js"), ctx, { filename: "seedops-tower-posts.js" });
  vm.runInContext(src("js/seedops-tower-hydrate.js"), ctx, { filename: "seedops-tower-hydrate.js" });
  function fire(name, detail) { doc.dispatchEvent(new win.CustomEvent(name, { detail: detail || {} })); }
  /* In-page sign-in (login.js). */
  function signIn() { session.signedIn = true; fire("cognation:session-started"); }
  /* The age lands: user_birth read, then tower.js asks for the after-age read
     and the dating hydrate reports. */
  function ageLoads(reportAfter) {
    log.push({ t: c.now(), table: "user_birth", method: "GET", q: "" });
    win.CognationSeedOpsTowerHydrate.readAfterAge({ reason: "viewer_age_changed", fillEmpty: false });
    c.setTimeout(function () {
      fire("cognation:seedops-dating-hydrate", { action: "hydrate", ok: true, result: { ok: true } });
    }, reportAfter || 200);
  }
  return { clock: c, log: log, writesTo: writesTo, session: session, fire: fire, signIn: signIn, ageLoads: ageLoads, win: win, sess: sess, local: local };
}

function postBursts(log, from) {
  var reads = log.filter(function (r) { return r.t >= from && r.table === "tower_posts" && r.method === "GET" && /author_profile_id=in\./.test(r.q); });
  var bursts = [];
  reads.forEach(function (r) {
    var last = bursts[bursts.length - 1];
    if (last && r.t - last.end < 400) { last.end = r.t; last.n += 1; } else bursts.push({ start: r.t, end: r.t, n: 1 });
  });
  return bursts;
}

/* Live timings (ms from the signed-out boot read leaving):
   1280 — anon posts out at ~400, sign-in ~1150 while they are still out,
          age ~530 later; 390 — anon read done before sign-in (~4270),
          age ~3000 later. */
var T1280 = { lat: { profiles: 400, posts: 1100, other: 200 }, signIn: 1150, age: 530 };
var T390 = { lat: { profiles: 1666, posts: 1000, other: 380 }, signIn: 4273, age: 3049 };

async function signInRun(t, opts) {
  var w = world(t.lat, opts);
  await w.clock.advance(350);          /* boot timer: signed-out read leaves */
  await w.clock.advance(t.signIn);
  var signedInAt = w.clock.now();
  w.signIn();
  await w.clock.advance(t.age);
  var ageAt = w.clock.now();
  w.ageLoads();
  await w.clock.advance(8000);
  return { w: w, signedInAt: signedInAt, ageAt: ageAt };
}

[["1280", T1280], ["390", T390]].forEach(function (pair) {
  test("sign-in at " + pair[0] + " timing: anon read finishing around the sign-in makes 0 non-GET calls", async function () {
    var r = await signInRun(pair[1], {});
    assert.deepEqual(writes(r.w.log).map(function (x) { return x.method + " " + x.table; }), []);
  });

  test("sign-in at " + pair[0] + " timing, seed with 0 posts: 0 non-GET calls", async function () {
    var r = await signInRun(pair[1], { mePosts: false });
    assert.deepEqual(writes(r.w.log).map(function (x) { return x.method + " " + x.table; }), []);
  });

  test("first sign-in at " + pair[0] + " timing: exactly one seed-post burst after sign-in, after user_birth", async function () {
    var r = await signInRun(pair[1], {});
    var b = postBursts(r.w.log, r.signedInAt);
    assert.equal(b.length, 1, JSON.stringify(b));
    assert.ok(b[0].start >= r.ageAt, "burst at " + b[0].start + " before user_birth at " + r.ageAt);
  });
});

test("first sign-in while the signed-out profiles read is still out: one burst, after user_birth", async function () {
  /* The signed-out flight's seed-post read would leave after the sign-in, as
     the member, before the age is known. */
  var r = await signInRun({ lat: { profiles: 1200, posts: 1000, other: 200 }, signIn: 500, age: 1800 }, {});
  var b = postBursts(r.w.log, r.signedInAt);
  assert.equal(b.length, 1, JSON.stringify(b));
  assert.ok(b[0].start >= r.ageAt, "burst at " + b[0].start + " before user_birth at " + r.ageAt);
  assert.deepEqual(writes(r.w.log).map(function (x) { return x.method + " " + x.table; }), []);
});

test("signed-in reload makes 0 non-GET calls (seed with posts and with 0 posts)", async function () {
  for (var mePosts of [true, false]) {
    var w = world(T1280.lat, { signedIn: true, mePosts: mePosts });
    await w.clock.advance(350 + 900);
    w.ageLoads();
    await w.clock.advance(8000);
    assert.deepEqual(writes(w.log).map(function (x) { return x.method + " " + x.table; }), [], "mePosts=" + mePosts);
  }
});

test("hydrate's empty-shell fill never calls createTowerPost, even signed in as the seed", async function () {
  var w = world({ profiles: 50, posts: 50, other: 50 }, { signedIn: true, mePosts: false });
  await w.clock.advance(50);
  var out;
  w.win.CognationSeedOpsTowerHydrate.hydrate({ force: true }).then(function (o) { out = o; });
  await w.clock.advance(3000);
  assert.ok(out && out.ok, JSON.stringify(out));
  assert.equal(w.log.filter(function (x) { return x.method === "POST"; }).length, 0);
  /* The fill still happens, locally: the seed's shell gets an overlay post. */
  var overlay = JSON.parse(w.local.getItem(OVERLAY_KEY) || '{"posts":[]}');
  assert.ok(overlay.posts.some(function (p) { return p.seedFleetId === ME; }), "local fill for " + ME);
  assert.match(src("js/seedops-tower-hydrate.js"), /postOne\(rec\.seedFleetId, \{[^}]*localOnly: true/);
});

test("a flight out of date at sign-in writes no store, overlay or BOOT_FLAG", async function () {
  var w = world({ profiles: 400, posts: 1100, other: 200 }, {});
  await w.clock.advance(350 + 600);      /* anon posts read is out */
  var signedInAt = w.clock.now();
  w.signIn();
  await w.clock.advance(1500);           /* anon read is back; age not yet */
  assert.deepEqual(w.writesTo.store.filter(function (t) { return t >= signedInAt; }), [], "store");
  assert.deepEqual(w.writesTo.overlay.filter(function (t) { return t >= signedInAt; }), [], "overlay");
  assert.equal(w.sess.getItem(BOOT_FLAG), null, "BOOT_FLAG");
  /* The after-age read then applies and labels BOOT_FLAG for the member. */
  w.ageLoads();
  await w.clock.advance(5000);
  var flag = JSON.parse(w.sess.getItem(BOOT_FLAG) || "null");
  assert.ok(flag && flag.viewer && flag.viewer !== "signed-out", JSON.stringify(flag));
  assert.ok(w.writesTo.store.length >= 1);
});

test("a flight out of date at sign-out writes nothing; the signed-out read runs after it", async function () {
  var w = world({ profiles: 400, posts: 1100, other: 200 }, { signedIn: true });
  await w.clock.advance(350);
  w.ageLoads();                          /* signed-in read leaves */
  await w.clock.advance(600);
  var outAt = w.clock.now();
  w.session.signedIn = false;
  w.fire("cognation:session-ended");
  await w.clock.advance(1500);
  /* Every read after sign-out is signed out; the queued run happened. */
  var after = w.log.filter(function (x) { return x.t >= outAt && x.table === "tower_posts"; });
  assert.ok(after.length > 0, "signed-out read ran");
  assert.ok(after.every(function (x) { return x.signedIn === false; }));
  await w.clock.advance(3000);
  var flag = JSON.parse(w.sess.getItem(BOOT_FLAG) || "null");
  assert.ok(flag && flag.viewer === "signed-out", JSON.stringify(flag));
});

test("control: an ops-panel post as the signed-in seed still writes tower_posts live", async function () {
  var w = world({ profiles: 50, posts: 50, other: 50 }, { signedIn: true });
  var res = w.win.CognationSeedOpsTowerPosts.postOne(ME, {});
  await w.clock.advance(1000);
  var posts = w.log.filter(function (x) { return x.method === "POST" && x.table === "tower_posts"; });
  assert.equal(posts.length, 1);
  assert.ok(w.win.CognationSeedOpsTowerPosts.TEMPLATES.some(function (tpl) { return tpl.replace("{name}", "Chris") === posts[0].body; }));
  assert.ok(res);
  /* The ops trigger passes the caller's opts through (no forced localOnly). */
  assert.match(src("js/seedops-ops-trigger.js"), /return api\.postOne\(gate\.record \|\| gate\.target, opts \|\| \{\}\);/);
});
