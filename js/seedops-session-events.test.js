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

/* Built at runtime from parts: no literal addresses in tests (HH rule). */
function seedAddr(fleet) { return fleet + "@" + ["seed", "cognation", "internal"].join("."); }
function memberAddr(local) { return local + "@" + ["example", "test"].join("."); }

var REAL_USER = {
  id: "u-real-1",
  email: memberAddr("member"),
  app_metadata: { provider: "email" },
  user_metadata: { display_name: "Jordan" },
};

var SEED_USER = {
  id: "u-seed-1",
  email: seedAddr("seed-0001"),
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
  var member = opts.member || { age: 31, city: "Chicago" };
  var birthAges = [];
  var birthRow = opts.birthRow || null;
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
      if (table === "user_birth" && birthRow) return Promise.resolve([birthRow]);
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
      setDatingBirthAge: function (a) { birthAges.push(a); },
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
  return { win: win, writes: writes, calls: calls, saved: saved, birthAges: birthAges,
    member: function () { return member; }, seeDating: function () { return seeDating; },
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
  var w = datingWorld({ user: SEED_USER, authSession: { username: seedAddr("seed-0001"), seedFleetId: "seed-0001" } });
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

/* --- Trust markers: only metadata, an armed ops trigger, or the seed / ops
   auth domain mark a seed or ops session. A bare "seed-" / "ops-" username or
   profileHandle (session.username is a member's own email) does not. --- */
function opsAddr(fleet) { return fleet + "@" + ["ops", "cognation", "internal"].join("."); }

var REAL_PREFIX_SESSIONS = [
  { label: "bare handle ops-team", session: { username: "ops-team", profileHandle: "ops-team" }, email: memberAddr("jordan") },
  { label: "bare handle seed-fan", session: { username: "seed-fan", profileHandle: "seed-fan" }, email: memberAddr("jordan") },
  { label: "email-like seed-fan", session: { username: memberAddr("seed-fan"), profileHandle: "seed-fan" }, email: memberAddr("seed-fan") },
  { label: "email-like ops-team", session: { username: memberAddr("ops-team"), profileHandle: "ops-team" }, email: memberAddr("ops-team") },
  { label: "email-like seed-0001", session: { username: memberAddr("seed-0001") }, email: memberAddr("seed-0001") },
];

function realUserWith(email) {
  return Object.assign({}, REAL_USER, { email: email });
}

REAL_PREFIX_SESSIONS.forEach(function (c) {
  test("trust markers: real user (" + c.label + ") bootstrap makes 0 seed writes", async function () {
    var state = { signedIn: true, user: realUserWith(c.email), authSession: c.session, writes: [], calls: [] };
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
    var mat = alive.materializeDatingSample(12);
    await tick();

    assert.strictEqual(trig.isArmed(), false, "ops trigger not armed");
    assert.strictEqual(alive.isSeedOrOpsSession(), false, "not a seed/ops session");
    assert.strictEqual(r1.skipped, true, JSON.stringify(r1));
    assert.strictEqual(r2.skipped, true, JSON.stringify(r2));
    assert.strictEqual(mat.skipped, true, JSON.stringify(mat));
    assert.deepStrictEqual(state.writes, [], "storage writes");
    assert.deepStrictEqual(w.order.filter(function (x) { return /^write:/.test(x); }), [], "profile/account writes");
    assert.deepStrictEqual(state.calls, [], "Supabase calls");
    assert.deepStrictEqual(w.win.CognationAccounts._p, {}, "no seed profiles materialized");
  });

  test("trust markers: real user (" + c.label + ") See dating writes 0 seed profiles", async function () {
    var w = datingWorld({ user: realUserWith(c.email), authSession: c.session });
    var hyd = w.win.CognationSeedOpsDatingHydrate;
    var alive = w.win.CognationSeedOpsCommuneAlive;
    await alive.awaitAuthUser();
    assert.strictEqual(alive.isSeedOrOpsSession(), false, "not a seed/ops session");
    w.saved.length = 0;
    w.writes.length = 0;
    w.calls.length = 0;

    w.win.CognationCommuneSwipe.setSeeDating(true);
    w.fire("cognation:see-dating-changed", { seeDating: true });
    await settle();
    await hyd.ensureDatingContent({ minCount: 1, forceBios: true });
    var mat = alive.materializeDatingSample(48);
    await settle();

    assert.strictEqual(mat.skipped, true, JSON.stringify(mat));
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
  });
});

test("trust markers: a seed with only app_metadata still bootstraps", async function () {
  var metaOnly = {
    id: "u-seed-2",
    app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0002" },
    user_metadata: {},
  };
  var state = { signedIn: true, user: metaOnly, authSession: { username: "fleet_0a1b2c3d4e5f" } };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), true);
  var boot = alive.bootstrap({ force: true, count: 3 });
  assert.ok(boot.ok && boot.materialized === 3, JSON.stringify(boot));
});

test("trust markers: a seed known only by a seed-domain session still passes", async function () {
  var bare = { id: "u-seed-3", app_metadata: { provider: "email" }, user_metadata: {} };
  var state = { signedIn: true, user: bare, authSession: { username: seedAddr("seed-0003") } };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), true);
  var boot = alive.bootstrap({ force: true, count: 3 });
  assert.ok(boot.ok && boot.materialized === 3, JSON.stringify(boot));
  var op = w.win.CognationSeedOpsTrigger.resolveOperator();
  assert.ok(op && op.isSeed && op.seedFleetId === "seed-0003", JSON.stringify(op));
});

test("trust markers: a seed known only by its auth email on the seed domain still passes", async function () {
  var bare = { id: "u-seed-4", email: seedAddr("seed-0004"), app_metadata: { provider: "email" }, user_metadata: {} };
  var state = { signedIn: true, user: bare, authSession: { username: "fleet_0a1b2c3d4e5f" } };
  var w = world(state);
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), true);
  var op = w.win.CognationSeedOpsTrigger.resolveOperator();
  assert.ok(op && op.isSeed && op.seedFleetId === "seed-0004", JSON.stringify(op));
});

test("trust markers: an ops bot on the ops domain arms the trigger; an unknown ops local part does not", async function () {
  var bare = { id: "u-ops-1", app_metadata: { provider: "email" }, user_metadata: {} };
  var w = world({ signedIn: true, user: bare, authSession: { username: opsAddr("ops-mod") } });
  await w.win.CognationSeedOpsCommuneAlive.awaitAuthUser();
  var op = w.win.CognationSeedOpsTrigger.resolveOperator();
  assert.ok(op && op.isOpsBot && op.seedFleetId === "ops-mod", JSON.stringify(op));
  assert.strictEqual(w.win.CognationSeedOpsCommuneAlive.isSeedOrOpsSession(), true);

  var w2 = world({ signedIn: true, user: bare, authSession: { username: opsAddr("ops-team") } });
  await w2.win.CognationSeedOpsCommuneAlive.awaitAuthUser();
  assert.strictEqual(w2.win.CognationSeedOpsTrigger.isArmed(), false, "unknown ops local part does not arm");
});

/* --- Only server-set markers count: app_metadata (account_kind, seed_fleet_id,
   seedops), the armed ops trigger, or the seed / ops auth domain. A member can
   write their own user_metadata, so user_metadata account_kind / seed_fleet_id /
   seedops never mark a seed or ops session. --- */
function selfSetMember() {
  return {
    id: "u-self-1",
    email: memberAddr("jordan"),
    app_metadata: { provider: "email" },
    user_metadata: { display_name: "Jordan", account_kind: "seed", seed_fleet_id: "seed-0005", seedops: true },
  };
}
var SELF_SET_SESSION = { username: memberAddr("jordan"), profileHandle: "jordan", accountKind: "real" };

test("user_metadata markers: a member self-setting account_kind seed / seed_fleet_id / seedops gets 0 seed writes", async function () {
  var state = { signedIn: true, user: selfSetMember(), authSession: SELF_SET_SESSION, writes: [], calls: [] };
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
  var mat = alive.materializeDatingSample(12);
  await tick();

  assert.strictEqual(trig.isArmed(), false, "ops trigger not armed");
  assert.strictEqual(trig.resolveOperator(), null, "no operator");
  assert.strictEqual(alive.isSeedOrOpsSession(), false, "not a seed/ops session");
  assert.strictEqual(r1.skipped, true, JSON.stringify(r1));
  assert.strictEqual(r2.skipped, true, JSON.stringify(r2));
  assert.strictEqual(mat.skipped, true, JSON.stringify(mat));
  assert.deepStrictEqual(state.writes, [], "storage writes");
  assert.deepStrictEqual(w.order.filter(function (x) { return /^write:/.test(x); }), [], "profile/account writes");
  assert.deepStrictEqual(state.calls, [], "Supabase calls");
  assert.deepStrictEqual(w.win.CognationAccounts._p, {}, "no seed profiles materialized");
  assert.strictEqual(w.win.CognationCommuneSwipe._m.age, undefined, "no demo age 22 on the member");
});

test("user_metadata markers: a self-set seed_fleet_id makes no live Tower post as that seed", async function () {
  var state = { signedIn: true, user: selfSetMember(), authSession: SELF_SET_SESSION };
  var w = world(state);
  var posts = w.win.CognationSeedOpsTowerPosts;
  await posts.awaitAuthUser();
  w.order.length = 0;
  var r = posts.postOne("seed-0005");
  await tick();
  await tick();
  assert.strictEqual(w.order.indexOf("write:createTowerPost"), -1, "no live createTowerPost: " + JSON.stringify(r));
});

test("user_metadata markers: a self-set teen keeps teen limits (dating off, real birth age, no demo age)", async function () {
  var now = new Date();
  var birthRow = { birth_year: now.getFullYear() - 15, birth_month: 1 };
  var teenAge = now.getFullYear() - birthRow.birth_year - (now.getMonth() + 1 < 1 ? 1 : 0);
  var w = datingWorld({ user: selfSetMember(), authSession: SELF_SET_SESSION, member: { city: "Chicago" }, birthRow: birthRow });
  var hyd = w.win.CognationSeedOpsDatingHydrate;
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), false, "not a seed/ops session");
  w.saved.length = 0;

  w.fire("cognation:session-started");
  await settle();
  await hyd.hydrate({ force: true });
  await hyd.ensureDatingContent({ minCount: 1, forceBios: true });
  await settle();

  assert.strictEqual(w.seeDating(), false, "See dating not switched on by seed defaults");
  assert.ok(!(parseInt(w.member().age, 10) > 0), "no demo age on the member: " + JSON.stringify(w.member()));
  assert.ok(w.birthAges.length > 0, "dating age set from user_birth");
  assert.strictEqual(w.birthAges[w.birthAges.length - 1], teenAge, "dating age is the real birth age");
  assert.ok(teenAge < 18);
  assert.deepStrictEqual(w.saved, [], "no seed bios merged");
});

test("user_metadata markers: a seed with app_metadata only (empty user_metadata) still passes every gate", async function () {
  var metaOnly = {
    id: "u-seed-8",
    app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0008" },
    user_metadata: {},
  };
  var w = world({ signedIn: true, user: metaOnly, authSession: { username: "fleet_0a1b2c3d4e5f" } });
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  await w.win.CognationSeedOpsTrigger.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), true);
  var op = w.win.CognationSeedOpsTrigger.resolveOperator();
  assert.ok(op && op.isSeed && op.seedFleetId === "seed-0008", JSON.stringify(op));
  var boot = alive.bootstrap({ force: true, count: 3 });
  assert.ok(boot.ok && boot.materialized === 3, JSON.stringify(boot));
});

test("user_metadata markers: a seed on the seed auth domain only (provider-only app_metadata) still passes", async function () {
  var stub = {
    id: "u-seed-9",
    email: seedAddr("seed-0009"),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { handle: "seed_0009", seed_fleet_id: "seed-0009" },
  };
  var w = world({ signedIn: true, user: stub, authSession: { username: seedAddr("seed-0009") } });
  var alive = w.win.CognationSeedOpsCommuneAlive;
  await alive.awaitAuthUser();
  assert.strictEqual(alive.isSeedOrOpsSession(), true);
  var op = w.win.CognationSeedOpsTrigger.resolveOperator();
  assert.ok(op && op.isSeed && op.seedFleetId === "seed-0009", JSON.stringify(op));
  var boot = alive.bootstrap({ force: true, count: 3 });
  assert.ok(boot.ok && boot.materialized === 3, JSON.stringify(boot));
});
