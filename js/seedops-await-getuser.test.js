/**
 * SeedOps scripts await auth.getUser (a Promise) before acting.
 * ops-trigger, commune-alive and tower-posts: getUser runs before the first
 * write, and nothing is written when getUser gives no user or fails.
 * Run: node --test js/seedops-await-getuser.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function memoryStorage() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}

var SEED_USER = {
  id: "u-seed-1",
  email: "seed-0001@seed.cognation.internal",
  app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0001" },
  user_metadata: {},
};

/* opts.user: value getUser resolves; opts.reject: getUser rejects. */
function world(opts) {
  opts = opts || {};
  var order = [];
  var doc = {
    readyState: "complete",
    addEventListener: function () {},
    dispatchEvent: function () { return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
  var win = {
    document: doc,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    location: { hash: "", search: "", pathname: "/", href: "https://cognation.test/" },
    history: { replaceState: function () {} },
    addEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return opts.session || null; } },
    CognationSeedOpsLog: { rows: [], write: function (ch, p) { this.rows.push({ channel: ch, payload: p }); } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () {
        order.push("getUser");
        if (opts.reject) return Promise.reject(new Error("401"));
        return Promise.resolve(opts.user === undefined ? null : JSON.parse(JSON.stringify(opts.user))).then(function (u) {
          order.push("getUser:resolved");
          return u;
        });
      },
    },
    CognationSeedOpsPathways: {
      run: function (p) { order.push("write:pathway:" + p); return { ok: true, steps: [] }; },
      runAll: function () { order.push("write:pathway:all"); return [{ ok: true }]; },
    },
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
      active: function () { return true; },
      createTowerPost: function () { order.push("write:createTowerPost"); return Promise.resolve({ id: "p1" }); },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    location: win.location, history: win.history, console: console, CustomEvent: win.CustomEvent,
    Promise: Promise, setTimeout: function () { return 0; }, clearTimeout: function () {},
  });
  ["js/seedops-schema.js", "js/seedops-tower-posts.js", "js/seedops-ops-trigger.js", "js/seedops-commune-alive.js"].forEach(
    function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); }
  );
  /* Boot fires the read-only awaits; start each test from a clean order log. */
  order.length = 0;
  return { win: win, order: order };
}

function firstWrite(order) {
  for (var i = 0; i < order.length; i++) if (/^write:/.test(order[i])) return i;
  return -1;
}
/* getUser resolved before the first write (and a write happened). */
function awaitedBeforeWrite(order) {
  var g = order.indexOf("getUser:resolved");
  var w = firstWrite(order);
  return g >= 0 && w > g;
}
function skipLogged(win, channel) {
  return win.CognationSeedOpsLog.rows.some(function (r) {
    return r.channel === channel && r.payload && r.payload.ok === false && /no_auth_user|get_user_failed/.test(r.payload.error || "");
  });
}

/* --- ops-trigger --- */
test("ops-trigger: awaits getUser before running a pathway", async function () {
  var w = world({ user: SEED_USER, session: { username: "seed-0001" } });
  var r = await w.win.CognationSeedOpsTrigger.runAfterAuth("circle", "seed-0002");
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(awaitedBeforeWrite(w.order), "pathway runs after getUser resolves: " + w.order.join(","));
});

test("ops-trigger: no user -> skips with a log, nothing run", async function () {
  var w = world({ user: null, session: { username: "seed-0001" } });
  var r = await w.win.CognationSeedOpsTrigger.runAfterAuth("circle", "seed-0002");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "no_auth_user");
  assert.strictEqual(firstWrite(w.order), -1, w.order.join(","));
  assert.ok(skipLogged(w.win, "ops-trigger"));
});

test("ops-trigger: getUser error -> skips, nothing run", async function () {
  var w = world({ reject: true, session: { username: "seed-0001" } });
  var r = await w.win.CognationSeedOpsTrigger.runAfterAuth("__all__", "seed-0002");
  assert.strictEqual(r.error, "get_user_failed");
  assert.strictEqual(firstWrite(w.order), -1);
  assert.ok(skipLogged(w.win, "ops-trigger"));
});

test("ops-trigger: resolved seed metadata arms (never reads the pending Promise)", async function () {
  var w = world({ user: SEED_USER, session: null });
  assert.strictEqual(w.win.CognationSeedOpsTrigger.isArmed(), false, "not armed before getUser resolves");
  await w.win.CognationSeedOpsTrigger.awaitAuthUser();
  assert.strictEqual(w.win.CognationSeedOpsTrigger.isArmed(), true);
});

test("ops-trigger: real user stays unarmed after getUser", async function () {
  var w = world({ user: { id: "u-real", email: "x@example.test", app_metadata: {}, user_metadata: {} }, session: { username: "dana" } });
  var r = await w.win.CognationSeedOpsTrigger.runAfterAuth("tower", "seed-0001");
  assert.strictEqual(r.error, "not_armed");
  assert.strictEqual(firstWrite(w.order), -1);
});

/* --- commune-alive --- */
test("commune-alive: awaits getUser before the first bootstrap write", async function () {
  var w = world({ user: SEED_USER, session: { username: "seed-0001" } });
  var r = await w.win.CognationSeedOpsCommuneAlive.bootstrapAfterAuth({ force: true, count: 3 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(awaitedBeforeWrite(w.order), w.order.join(","));
});

test("commune-alive: no user -> skips with a log, nothing written", async function () {
  var w = world({ user: null, session: { username: "seed-0001" } });
  var r = await w.win.CognationSeedOpsCommuneAlive.bootstrapAfterAuth({ force: true, count: 3 });
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(r.error, "no_auth_user");
  assert.strictEqual(firstWrite(w.order), -1, w.order.join(","));
  assert.ok(skipLogged(w.win, "commune-alive"));
});

test("commune-alive: getUser error -> skips, nothing written", async function () {
  var w = world({ reject: true, session: { username: "seed-0001" } });
  var r = await w.win.CognationSeedOpsCommuneAlive.bootstrapAfterAuth({ force: true, count: 3 });
  assert.strictEqual(r.error, "get_user_failed");
  assert.strictEqual(firstWrite(w.order), -1);
});

test("commune-alive: real user -> no bootstrap writes", async function () {
  var w = world({ user: { id: "u-real", email: "x@example.test", app_metadata: {}, user_metadata: {} }, session: { username: "dana" } });
  var r = await w.win.CognationSeedOpsCommuneAlive.bootstrapAfterAuth({ count: 3 });
  assert.strictEqual(r.error, "not_seed_or_ops");
  assert.strictEqual(firstWrite(w.order), -1);
});

/* --- tower-posts (live client write) --- */
test("tower-posts: awaits getUser before the live Tower write", async function () {
  var w = world({ user: SEED_USER, session: { username: "seed-0001" } });
  var r = w.win.CognationSeedOpsTowerPosts.postOne("seed-0001");
  assert.ok(r.pending, JSON.stringify(r));
  assert.strictEqual(firstWrite(w.order), -1, "no write before getUser resolves");
  var settled = await r.promise;
  assert.ok(settled.ok, JSON.stringify(settled));
  assert.ok(awaitedBeforeWrite(w.order), w.order.join(","));
  assert.strictEqual(w.order.filter(function (x) { return x === "write:createTowerPost"; }).length, 1);
});

test("tower-posts: no user -> live write skipped with a log", async function () {
  var w = world({ user: null, session: { username: "seed-0001" } });
  var settled = await w.win.CognationSeedOpsTowerPosts.postOne("seed-0001").promise;
  assert.strictEqual(settled.ok, false);
  assert.strictEqual(settled.error, "no_auth_user");
  assert.strictEqual(w.order.indexOf("write:createTowerPost"), -1);
  assert.ok(skipLogged(w.win, "tower-posts"));
});

test("tower-posts: getUser error -> live write skipped", async function () {
  var w = world({ reject: true, session: { username: "seed-0001" } });
  var settled = await w.win.CognationSeedOpsTowerPosts.postOne("seed-0001").promise;
  assert.strictEqual(settled.error, "get_user_failed");
  assert.strictEqual(w.order.indexOf("write:createTowerPost"), -1);
});

test("tower-posts: auth user is another seed -> live write skipped", async function () {
  var other = JSON.parse(JSON.stringify(SEED_USER));
  other.app_metadata.seed_fleet_id = "seed-0002";
  var w = world({ user: other, session: { username: "seed-0001" } });
  var settled = await w.win.CognationSeedOpsTowerPosts.postOne("seed-0001").promise;
  assert.strictEqual(settled.error, "auth_user_not_seed");
  assert.strictEqual(w.order.indexOf("write:createTowerPost"), -1);
});
