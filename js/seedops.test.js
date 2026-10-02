/**
 * SeedOps unit checks (schema + friend gate). Run: node js/seedops.test.js
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
        };
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

console.log("seedops.test.js: ok");
