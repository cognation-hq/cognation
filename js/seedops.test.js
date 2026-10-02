/**
 * SeedOps unit checks (schema + friend gate + pathways + ops trigger + tower posts).
 * Run: node js/seedops.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function load(rel, windowStub) {
  var context = vm.createContext({
    window: windowStub,
    document: {
      addEventListener: function () {},
      dispatchEvent: function () {},
      readyState: "complete",
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () {
        return {
          className: "",
          setAttribute: function () {},
          appendChild: function () {},
          querySelector: function () { return null; },
          remove: function () {},
          addEventListener: function () {},
          style: {},
          removeAttribute: function () {},
        };
      },
      body: {
        appendChild: function () {},
      },
    },
    sessionStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    location: { hash: "", search: "", pathname: "/", href: "http://localhost/" },
    history: { replaceState: function () {} },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = (init && init.detail) || {};
    },
  });
  context.window = windowStub;
  context.window.document = context.document;
  context.window.sessionStorage = context.sessionStorage;
  context.window.localStorage = context.localStorage;
  context.window.location = context.location;
  context.window.history = context.history;
  context.window.addEventListener = function () {};
  context.document.body = context.document.body;
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), context);
  return context.window;
}

var win = { CognationAccounts: null };
load("js/seedops-schema.js", win);
assert.strictEqual(win.CognationSeedOps.FLEET_SIZE, 1000);
var s0 = win.CognationSeedOps.buildSeedRecord(0);
assert.ok(s0.isSeed);
assert.strictEqual(s0.accountKind, "seed");
assert.ok(!/\d/.test(s0.displayName), "displayName must be plain first name");
assert.ok(!/\s/.test(s0.displayName), "displayName must be a single first name");
var fleet = win.CognationSeedOps.listSeedAccounts({ limit: 1000 });
assert.strictEqual(fleet.length, 1000);

load("js/seedops-friend-gate.js", win);
var gate = win.CognationSeedOpsFriendGate;
assert.ok(!gate.canFriend({ accountKind: "real" }, { accountKind: "seed" }).ok);
assert.ok(!gate.canFriend({ accountKind: "real" }, { accountKind: "ops" }).ok);
assert.ok(gate.canFriend({ accountKind: "real" }, { accountKind: "real" }).ok);
assert.ok(gate.canFriend({ accountKind: "seed" }, { accountKind: "seed" }).ok);
assert.ok(gate.canFriend({ accountKind: "seed" }, { accountKind: "ops" }).ok);

load("js/seedops-log.js", win);
load("js/seedops-news-log.js", win);
win.CognationSeedOpsNewsLog.onTowerPostsForNews(
  [{ id: "t1", authorName: "Maya", isSeed: true, seedFleetId: "seed-0042", likes: 2 }],
  "local"
);
assert.ok(win.CognationSeedOpsLog.list("news").length >= 1);

load("js/seedops-pathways.js", win);
var run = win.CognationSeedOpsPathways.run("circle", "seed-0001");
assert.strictEqual(run.pathway, "circle");
assert.ok(run.steps.length > 0);

/* --- #4 Tower seed posts --- */
win.CognationTowerStore = {
  _data: { version: 1, posts: [] },
  load: function () { return this._data; },
  save: function (data) { this._data = data; return true; },
  list: function () { return (this._data.posts || []).slice(); },
  add: function () { return { ok: false, error: "unused" }; },
};
load("js/seedops-tower-posts.js", win);
var towerPosts = win.CognationSeedOpsTowerPosts;
assert.strictEqual(towerPosts.WAVE1_MAX, 100);
assert.strictEqual(towerPosts.DEMO_CAP, 250);
var body = towerPosts.composeBody(win.CognationSeedOps.buildSeedRecord(0));
assert.ok(body.indexOf("Ada") !== -1, "body should use first name");
assert.ok(!/\d/.test(body.replace(/seedops/gi, "")), "visible body should stay first-name-safe");
assert.ok(!/instagram|reel|story highlight|follower count/i.test(body), "no Instagram copycat framing");

var one = towerPosts.postOne("seed-0001");
assert.ok(one.ok, "postOne seed-0001 should succeed");
assert.strictEqual(one.post.seedFleetId, "seed-0001");
assert.strictEqual(one.post.authorName, "Ada");
assert.ok(one.post.isSeed && one.post.seeded);
assert.ok(win.CognationSeedOpsLog.list("tower-posts").length >= 1);
assert.ok(win.CognationSeedOpsLog.list("news").length >= 1, "News path should log seeded post");

var wave = towerPosts.postWave({ offset: 0, limit: 100 });
assert.ok(wave.ok);
assert.strictEqual(wave.posted, 100);
assert.strictEqual(wave.limit, 100);

var clamped = towerPosts.clampWave({ offset: 200, limit: 100 });
assert.ok(clamped.ok);
assert.strictEqual(clamped.limit, 50, "wave must hard-stop at demo cap 250");
var past = towerPosts.postOne("seed-0251");
assert.ok(!past.ok);
assert.strictEqual(past.error, "past_demo_cap");
var refusedWave = towerPosts.clampWave({ offset: 250, limit: 10 });
assert.ok(!refusedWave.ok);

var towerSrc = fs.readFileSync(path.join(root, "js/seedops-tower-posts.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(towerSrc)), "tower posts must not contain banned public-demo phrase");
assert.ok(towerSrc.indexOf("SEEDOPS_AUTH_PASSWORD") === -1, "no ops password in frontend");
assert.ok(towerSrc.indexOf("SERVICE_ROLE") === -1 && towerSrc.indexOf("service_role") === -1, "no service role in frontend");

/* --- #3 ops trigger --- */
win.CognationAuth = {
  getSession: function () {
    return {
      username: "ops-curator",
      activeProfileId: "prof-ops-curator",
    };
  },
};
win.CognationAccounts = {
  getProfileById: function (id) {
    if (id === "prof-ops-curator") {
      return win.CognationSeedOps.listOpsBots()[0];
    }
    if (id === "prof-real") {
      return { id: "prof-real", accountKind: "real", displayName: "Beta", handle: "beta" };
    }
    return null;
  },
};

load("js/seedops-ops-trigger.js", win);
var trigger = win.CognationSeedOpsTrigger;
assert.ok(trigger.isArmed(), "ops-curator session must arm");
assert.strictEqual(trigger.resolveOperator().seedFleetId, "ops-curator");
assert.ok(trigger.canActAs("seed-0001").ok, "ops may act-as Wave 1 seed for pathway context");
assert.ok(trigger.canActAs("ops-mod").ok, "ops may act-as another ops bot");
var refused = trigger.canActAs("beta-user");
assert.ok(!refused.ok, "real-user act-as must refuse");
assert.strictEqual(refused.error, "real_user_target_refused");

var kicked = trigger.triggerPathway("tower", "seed-0001");
assert.ok(kicked.ok, "pathway trigger should succeed");
assert.strictEqual(kicked.target, "seed-0001");
assert.ok(win.CognationSeedOpsLog.list("ops-trigger").length >= 1);

/* Real user must not arm */
win.CognationAuth.getSession = function () {
  return { username: "beta", activeProfileId: "prof-real" };
};
assert.ok(!trigger.isArmed(), "real user must not arm ops trigger");
var realKick = trigger.triggerPathway("tower", "seed-0001");
assert.ok(!realKick.ok);
assert.strictEqual(realKick.error, "not_armed");

/* Seed with seedops metadata may arm */
win.CognationAuth.getSession = function () {
  return { username: "seed-0001", activeProfileId: "prof-seed-0001" };
};
win.CognationAccounts.getProfileById = function (id) {
  if (id === "prof-seed-0001") return win.CognationSeedOps.buildSeedRecord(0);
  return null;
};
win.CognationSupabase = {
  getUser: function () {
    return {
      email: "seed-0001@seed.cognation.internal",
      app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0001" },
    };
  },
};
assert.ok(trigger.isArmed(), "seed with seedops metadata must arm");
var seedKick = trigger.triggerPathway("circle", "seed-0002");
assert.ok(seedKick.ok);
assert.strictEqual(seedKick.target, "seed-0002");

/* Caps constants locked */
assert.strictEqual(trigger.WAVE1_MAX, 100);
assert.strictEqual(trigger.DEMO_CAP, 250);
assert.strictEqual(JSON.stringify(trigger.OPS_FLEET_IDS), JSON.stringify(["ops-curator", "ops-mod", "ops-wire"]));

/* Public markup still loads the module; banned public-demo phrase must stay absent */
var src = fs.readFileSync(path.join(root, "js/seedops-ops-trigger.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(src)), "ops trigger must not contain banned public-demo phrase");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf("js/seedops-ops-trigger.js") !== -1, "index.html must load ops trigger");
assert.ok(html.indexOf("js/seedops-tower-posts.js") !== -1, "index.html must load tower posts");
assert.ok(
  html.indexOf("js/seedops-tower-posts.js") < html.indexOf("js/seedops-ops-trigger.js"),
  "tower posts must load before ops trigger"
);

/* Re-arm ops and confirm tower pathway seeds a post */
win.CognationAuth.getSession = function () {
  return { username: "ops-curator", activeProfileId: "prof-ops-curator" };
};
win.CognationAccounts.getProfileById = function (id) {
  if (id === "prof-ops-curator") return win.CognationSeedOps.listOpsBots()[0];
  return null;
};
win.CognationSupabase = null;
assert.ok(trigger.isArmed());
var towerKick = trigger.triggerPathway("tower", "seed-0003");
assert.ok(towerKick.ok);
assert.ok(towerKick.towerSeed && towerKick.towerSeed.ok, "tower pathway should seed a post");
assert.strictEqual(towerKick.towerSeed.post.seedFleetId, "seed-0003");
var viaTrigger = trigger.postOne("seed-0004");
assert.ok(viaTrigger.ok);
var viaWave = trigger.postWave({ offset: 0, limit: 2 });
assert.ok(viaWave.ok);
assert.strictEqual(viaWave.posted, 2);

console.log("seedops.test.js: ok");
