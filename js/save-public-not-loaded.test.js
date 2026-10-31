/**
 * savePublic never overwrites an unread layout row (same rule as
 * saveWidgetsIfChanged: "Not loaded yet: never overwrite a row we have not read").
 * Run: node --test js/save-public-not-loaded.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

var SRC = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
var A = "11111111-1111-4111-8111-111111111111";
var B = "22222222-2222-4222-8222-222222222222";

/* Stub Supabase: layout reads wait until the test resolves them; writes are counted. */
function harness() {
  var writes = [];
  var reads = [];
  var timers = [];
  var win = {
    setTimeout: function (fn) { timers.push(fn); return timers.length; },
    clearTimeout: function (t) { if (t) timers[t - 1] = null; },
    CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
    document: { dispatchEvent: function () {} },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "stub" }; },
      rest: function (table, opts) {
        if (opts.method) {
          writes.push({ table: table, method: opts.method, body: opts.body });
          return Promise.resolve(null);
        }
        var id = /profile_id=eq\.([^&]+)/.exec(opts.query)[1];
        return new Promise(function (resolve) { reads.push({ id: id, resolve: resolve }); });
      },
    },
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return {
    sync: win.CognationTowerLayoutSync,
    writes: writes,
    reads: reads,
    flush: function () { var t = timers.splice(0); t.forEach(function (fn) { if (fn) fn(); }); },
    layoutWrites: function () { return writes.filter(function (w) { return w.table === "tower_widget_layouts"; }).length; },
  };
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }

function owner(id) {
  return {
    _profileId: id,
    widgetLayout: { music: { x: 0, y: 0, z: 1, tilt: 0 } },
    socialLinks: { x: "https://x.com/stub" },
  };
}

test("Save before the layout row is read does not write tower_widget_layouts", async function () {
  var h = harness();
  var p = owner(A);
  h.sync.apply(p); /* profile loaded; layout read for A starts and stays pending */
  assert.strictEqual(h.reads.length, 1);
  h.sync.savePublic(p);
  h.flush();
  await tick();
  assert.strictEqual(h.layoutWrites(), 0, "no upsert of a row we have not read");
});

test("after the read resolves, a Save writes once and keeps the row's positions", async function () {
  var h = harness();
  var p = owner(A);
  h.sync.apply(p);
  h.sync.savePublic(p); /* too early: nothing */
  h.flush();
  h.reads[0].resolve([{ layout: { identity: { x: 40, y: 50, z: 2, tilt: 3 } } }]);
  await tick();
  h.flush();
  assert.strictEqual(h.layoutWrites(), 0);
  assert.strictEqual(h.sync.savePublic(p), true);
  h.flush();
  await tick();
  assert.strictEqual(h.layoutWrites(), 1);
  var body = h.writes[0].body;
  assert.strictEqual(body.profile_id, A);
  assert.strictEqual(body.layout.identity.x, 40, "row positions kept");
  assert.strictEqual(body.layout._public.socialLinks.x, "https://x.com/stub");
});

test("a read that found no row still lets Save write (unchanged)", async function () {
  var h = harness();
  var p = owner(A);
  h.sync.apply(p);
  h.reads[0].resolve([]);
  await tick();
  assert.strictEqual(h.sync.savePublic(p), true);
  h.flush();
  await tick();
  assert.strictEqual(h.layoutWrites(), 1);
});

test("a read for user A does not let user B write an unread row", async function () {
  var h = harness();
  var a = owner(A);
  h.sync.apply(a);
  h.reads[0].resolve([{ layout: { identity: { x: 40, y: 50, z: 2, tilt: 3 } } }]);
  await tick();
  /* Sign-out, user B signs in on the same page: B's layout read is still pending. */
  var b = owner(B);
  h.sync.apply(b);
  h.sync.savePublic(b);
  h.flush();
  await tick();
  assert.strictEqual(h.layoutWrites(), 0, "A's read is not B's read");
  assert.ok(h.reads.some(function (r) { return r.id === B; }), "B's row is read first");
});
