/**
 * SeedOps unit checks (schema + friend gate + pathways + ops trigger).
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

console.log("seedops.test.js: ok");
