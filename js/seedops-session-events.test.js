/**
 * SeedOps scripts react to login.js session events (session-started /
 * session-ended); auth-changed never fires in-page. The cached auth user is
 * dropped on either event, and tower-posts logs a skip when signed out.
 * Run: node --test js/seedops-session-events.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }

/* writes: optional array; every setItem, and every removeItem of a key that
   existed, is recorded there as "<name>:<op>:<key>". */
function memoryStorage(name, writes) {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { if (writes) writes.push(name + ":set:" + k); d[k] = String(v); },
    removeItem: function (k) {
      if (writes && Object.prototype.hasOwnProperty.call(d, k)) writes.push(name + ":remove:" + k);
      delete d[k];
    },
  };
}

/* Records every call other than the auth reads (configured/getSession/getUser/active). */
function recordCalls(name, obj, calls) {
  var reads = { configured: 1, getSession: 1, getUser: 1, active: 1 };
  return new Proxy(obj, {
    get: function (t, k) {
      var v = t[k];
      if (typeof v !== "function" || reads[k]) return v;
      return function () { calls.push(name + "." + String(k)); return v.apply(t, arguments); };
    },
  });
}

var REAL_USER = {
  id: "u-real-1",
  email: "member@example.test",
  app_metadata: { provider: "email" },
  user_metadata: { display_name: "Jordan" },
};

var SEED_USER = {
  id: "u-seed-1",
  email: "seed-0001@seed.cognation.internal",
  app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0001" },
  user_metadata: {},
};

/* state.signedIn toggles the Supabase session; state.delay holds getUser. */
function world(state) {
  var order = [];
  var writes = state.writes || null;
  var listeners = {};
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
  var win = {
    document: doc,
    localStorage: memoryStorage("localStorage", writes),
    sessionStorage: memoryStorage("sessionStorage", writes),
    location: { hash: "", search: "", pathname: "/", href: "https://cognation.test/" },
    history: { replaceState: function () {} },
    addEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return state.authSession || null; } },
    CognationSeedOpsLog: { rows: [], write: function (ch, p) { this.rows.push({ channel: ch, payload: p }); } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return state.signedIn ? { access_token: "t" } : null; },
      getUser: function () {
        order.push("getUser");
        var u = state.signedIn ? JSON.parse(JSON.stringify(state.user || SEED_USER)) : null;
        if (state.delay) return new Promise(function (r) { state.release = function () { r(u); }; });
        return Promise.resolve(u);
      },
    },
    CognationSeedOpsPathways: { run: function () { return { ok: true, steps: [] }; }, runAll: function () { return []; } },
    CognationAccounts: {
      _p: {},
      saveProfileRecord: function (r) { order.push("write:saveProfileRecord"); this._p[r.id] = r; return true; },
      getProfileById: function (id) { return this._p[id] || null; },
    },
    CognationCommuneSwipe: {
      _m: {},
      getMemberProfile: function () { return this._m; },
      setMemberProfile: function (p) { order.push("write:setMemberProfile"); this._m = p; return p; },
      sampleDeck: function () { return []; },
      rebuild: function () {},
    },
    CognationSupabaseSocial: {
      active: function () { return !!state.signedIn; },
      createTowerPost: function () { order.push("write:createTowerPost"); return Promise.resolve({ id: "p1" }); },
    },
  };
  if (state.calls) {
    win.CognationSupabase = recordCalls("CognationSupabase", win.CognationSupabase, state.calls);
    win.CognationSupabaseSocial = recordCalls("CognationSupabaseSocial", win.CognationSupabaseSocial, state.calls);
  }
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    location: win.location, history: win.history, console: console, CustomEvent: win.CustomEvent,
    Promise: Promise, setTimeout: function () { return 0; }, clearTimeout: function () {},
  });
  ["js/seedops-schema.js", "js/seedops-tower-posts.js", "js/seedops-ops-trigger.js", "js/seedops-commune-alive.js"].forEach(
    function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); }
  );
  function fire(name) { doc.dispatchEvent(new win.CustomEvent(name)); }
  return { win: win, order: order, fire: fire };
}

test("ops-trigger: in-page session-ended disarms the panel", async function () {
  var state = { signedIn: true };
  var w = world(state);
  var trig = w.win.CognationSeedOpsTrigger;
  await trig.awaitAuthUser();
  assert.strictEqual(trig.isArmed(), true, "seed armed while signed in");
  state.signedIn = false;
  w.fire("cognation:session-ended");
  assert.strictEqual(trig.isArmed(), false, "cached seed user dropped on session-ended");
  assert.strictEqual(trig.resolveOperator(), null);
  await tick();
  assert.strictEqual(trig.isArmed(), false, "still disarmed after re-sync");
});

test("ops-trigger: session-started re-arms after getUser", async function () {
  var state = { signedIn: false };
  var w = world(state);
  var trig = w.win.CognationSeedOpsTrigger;
  await tick();
  assert.strictEqual(trig.isArmed(), false);
  state.signedIn = true;
  w.fire("cognation:session-started");
  await tick();
  assert.strictEqual(trig.isArmed(), true);
});

test("commune-alive: session-ended clears the cached user, no bootstrap", async function () {
  var state = { signedIn: true };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.ok(alive.knownAuthUser(), "user cached while signed in");
  state.signedIn = false;
  w.order.length = 0;
  w.fire("cognation:session-ended");
  assert.strictEqual(alive.knownAuthUser(), null);
  await tick();
  assert.strictEqual(w.order.filter(function (x) { return /^write:/.test(x); }).length, 0, w.order.join(","));
});

test("commune-alive: session-started re-bootstraps after getUser", async function () {
  var state = { signedIn: false };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  w.win.sessionStorage.setItem("cognation.seedops.communeAlive.v1", JSON.stringify({ ok: true }));
  state.signedIn = true;
  w.order.length = 0;
  w.fire("cognation:session-started");
  assert.strictEqual(w.win.sessionStorage.getItem("cognation.seedops.communeAlive.v1"), null, "BOOT_FLAG cleared");
  await tick();
  var g = w.order.indexOf("getUser");
  var firstWrite = w.order.findIndex(function (x) { return /^write:/.test(x); });
  assert.ok(g >= 0 && firstWrite > g, "bootstrap after getUser: " + w.order.join(","));
  assert.ok(alive.knownAuthUser());
});

test("commune-alive: getUser resolving after session-ended cannot restore the old user", async function () {
  var state = { signedIn: true, delay: true };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  var p = alive.awaitAuthUser();
  var release = state.release;
  state.signedIn = false;
  w.fire("cognation:session-ended");
  release();
  await p;
  assert.strictEqual(alive.knownAuthUser(), null);
});

test("tower-posts: signed out logs a no_session post_one_skipped", async function () {
  var state = { signedIn: false };
  var w = world(state);
  var posts = w.win.CognationSeedOpsTowerPosts;
  var r = posts.postOne("seed-0001");
  assert.ok(r.ok, "local/demo path unchanged: " + JSON.stringify(r));
  await tick();
  var skips = w.win.CognationSeedOpsLog.rows.filter(function (row) {
    return row.channel === "tower-posts" && row.payload.action === "post_one_skipped";
  });
  assert.strictEqual(skips.length, 1, JSON.stringify(w.win.CognationSeedOpsLog.rows));
  assert.strictEqual(skips[0].payload.error, "no_session");
  assert.strictEqual(w.order.indexOf("write:createTowerPost"), -1);
  /* A wave logs once per auth cycle, not once per seed. */
  posts.postWave({ offset: 0, limit: 5 });
  await tick();
  assert.strictEqual(w.win.CognationSeedOpsLog.rows.filter(function (row) {
    return row.payload.action === "post_one_skipped";
  }).length, 1);
});

test("tower-posts: session-ended drops the cached user", async function () {
  var state = { signedIn: true };
  var w = world(state);
  var posts = w.win.CognationSeedOpsTowerPosts;
  await posts.awaitAuthUser();
  assert.ok(posts.knownAuthUser());
  state.signedIn = false;
  w.fire("cognation:session-ended");
  assert.strictEqual(posts.knownAuthUser(), null);
});

test("commune-alive: a real user's session-started makes 0 writes, even with force", async function () {
  var state = {
    signedIn: true,
    user: REAL_USER,
    authSession: { username: "jordan", profileHandle: "jordan" },
    writes: [],
    calls: [],
  };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  var trig = w.win.CognationSeedOpsTrigger;
  await tick();
  state.writes.length = 0;
  state.calls.length = 0;
  w.order.length = 0;

  w.fire("cognation:session-started");
  await tick();
  var r1 = await alive.bootstrapAfterAuth({ force: true });
  var r2 = alive.bootstrap({ force: true });
  await tick();

  assert.strictEqual(trig.isArmed(), false, "no armed ops trigger");
  assert.ok(alive.knownAuthUser(), "real user resolved via getUser");
  assert.strictEqual(alive.isSeedOrOpsSession(), false);
  assert.strictEqual(r1.skipped, true, JSON.stringify(r1));
  assert.strictEqual(r1.error, "not_seed_or_ops");
  assert.strictEqual(r2.skipped, true, "direct bootstrap({force:true}) fails closed: " + JSON.stringify(r2));
  assert.deepStrictEqual(state.writes, [], "storage writes");
  assert.deepStrictEqual(w.order.filter(function (x) { return /^write:/.test(x); }), [], "profile/account writes");
  assert.deepStrictEqual(state.calls, [], "Supabase calls");
  assert.deepStrictEqual(w.win.CognationAccounts._p, {}, "no seed profiles materialized");
});

/* Real user (non-seed, non-ops) turns on See dating: ensureDatingContent in
   seedops-dating-hydrate.js must not write seed dating profiles anywhere. */
function datingWorld(opts) {
  opts = opts || {};
  var user = opts.user || REAL_USER;
  var authSession = opts.authSession || { username: "jordan", profileHandle: "jordan" };
  var writes = [];
  var calls = [];
  var saved = [];
  var listeners = {};
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
  var seeDating = false;
  var member = { age: 31, city: "Chicago" };
  var sb = {
    configured: function () { return true; },
    getSession: function () { return { access_token: "t" }; },
    getUser: function () { return Promise.resolve(JSON.parse(JSON.stringify(user))); },
    rest: function (table, opts) {
      if (table === "profiles") {
        return Promise.resolve([
          { id: "srv-6", seed_fleet_id: "seed-0006", display_name: "Andre", bio: "Farmer-market regular.", account_kind: "seed" },
          { id: "srv-7", seed_fleet_id: "seed-0007", display_name: "Bea", bio: "Early runs.", account_kind: "seed" },
        ]);
      }
      return Promise.resolve([]);
    },
    updateUser: function () { return Promise.resolve({}); },
  };
  var win = {
    document: doc,
    localStorage: memoryStorage("localStorage", writes),
    sessionStorage: memoryStorage("sessionStorage", writes),
    location: { hash: "", search: "", pathname: "/", href: "https://cognation.test/" },
    history: { replaceState: function () {} },
    addEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return authSession; } },
    CognationDatingFlag: { enabled: function () { return true; } },
    CognationSeedOpsLog: { rows: [], write: function (ch, p) { this.rows.push({ channel: ch, payload: p }); } },
    CognationSupabase: recordCalls("CognationSupabase", sb, calls),
    CognationAccounts: {
      _p: {},
      saveProfileRecord: function (r) { saved.push(r && r.id); this._p[r.id] = r; return true; },
      getProfileById: function (id) { return this._p[id] || null; },
    },
    CognationCommuneSwipe: {
      getMemberProfile: function () { return member; },
      setMemberProfile: function (p) { member = p || {}; return member; },
      getSeeDating: function () { return seeDating; },
      setSeeDating: function (on) { seeDating = !!on; },
      getMemberAge: function () { return parseInt(member.age, 10) || null; },
      setDatingBirthAge: function () {},
      sampleDeck: function () { return []; },
      rebuild: function () {},
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    location: win.location, history: win.history, console: console, CustomEvent: win.CustomEvent,
    Promise: Promise, setTimeout: function () { return 0; }, clearTimeout: function () {},
    encodeURIComponent: encodeURIComponent, JSON: JSON,
  });
  ["js/seedops-schema.js", "js/seedops-commune-alive.js", "js/seedops-dating-hydrate.js"].forEach(function (rel) {
    vm.runInContext(src(rel), ctx, { filename: rel });
  });
  return { win: win, writes: writes, calls: calls, saved: saved,
    fire: function (name, detail) { doc.dispatchEvent(new win.CustomEvent(name, { detail: detail })); } };
}

function settle() { return tick().then(tick).then(tick).then(tick); }

test("dating-hydrate: a real user's See dating toggle writes 0 seed dating profiles", async function () {
  var w = datingWorld();
  var hyd = w.win.CognationSeedOpsDatingHydrate;
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), false, "real user, not seed/ops");
  w.saved.length = 0;
  w.writes.length = 0;
  w.calls.length = 0;

  /* Toggle path: commune-swipe fires see-dating-changed; listener calls ensureDatingContent. */
  w.win.CognationCommuneSwipe.setSeeDating(true);
  w.fire("cognation:see-dating-changed", { seeDating: true });
  await settle();
  /* And directly, plus the materialize call it makes. */
  var out = await hyd.ensureDatingContent({ minCount: 1 });
  var mat = alive.materializeDatingSample(48);
  await settle();

  assert.strictEqual(mat.skipped, true, "materializeDatingSample fails closed: " + JSON.stringify(mat));
  assert.deepStrictEqual(w.saved, [], "no accounts-store writes of seed profiles");
  assert.deepStrictEqual(w.win.CognationAccounts._p, {}, "accounts store untouched");
  assert.deepStrictEqual(
    w.writes.filter(function (k) { return /cognation\.(profiles|seedops\.fleet)/.test(k); }),
    [],
    "no seed profile/fleet storage writes"
  );
  assert.deepStrictEqual(
    w.calls.filter(function (c) { return c !== "CognationSupabase.rest"; }),
    [],
    "no Supabase writes"
  );
  assert.ok(out, "ensureDatingContent resolved");
});

test("dating-hydrate: seed sessions still materialize and merge seed dating profiles", async function () {
  var w = datingWorld({ user: SEED_USER, authSession: { username: "seed-0001", seedFleetId: "seed-0001" } });
  var hyd = w.win.CognationSeedOpsDatingHydrate;
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), true);
  var mat = alive.materializeDatingSample(6);
  assert.ok(mat.ok && mat.count === 6, JSON.stringify(mat));
  w.win.CognationAccounts._p = {};
  w.saved.length = 0;
  await hyd.ensureDatingContent({ minCount: 1 });
  await settle();
  assert.ok(w.saved.indexOf("prof-seed-0006") !== -1, "seed bios merged for seeds: " + w.saved.join(","));
  var boot = alive.bootstrap({ force: true, count: 3 });
  assert.ok(boot.ok && boot.materialized === 3, "seed bootstrap (pathways force path) works: " + JSON.stringify(boot));
});
