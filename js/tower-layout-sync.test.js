/**
 * Tower widget layout DB sync.
 * Run: node js/tower-layout-sync.test.js
 */
"use strict";
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

var calls = [];
var rows = {};
var timers = [];
var events = [];
var win = {
  setTimeout: function (fn) { timers.push(fn); return timers.length; },
  clearTimeout: function () {},
  CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
  document: { dispatchEvent: function (e) { events.push(e.type); } },
  CognationSupabase: {
    configured: function () { return true; },
    rest: function (table, opts) {
      calls.push({ table: table, opts: opts });
      if (!opts.method) {
        var id = /profile_id=eq\.([^&]+)/.exec(opts.query)[1];
        return Promise.resolve(rows[id] ? [{ layout: rows[id] }] : []);
      }
      rows[opts.body.profile_id] = opts.body.layout;
      return Promise.resolve(null);
    },
  },
};
win.window = win;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8"), win);
var sync = win.CognationTowerLayoutSync;
var A = "11111111-1111-4111-8111-111111111111";
var B = "22222222-2222-4222-8222-222222222222";
rows[A] = { identity: { x: 40, y: 50, z: 2, tilt: 3 } };

(async function () {
  /* No cache yet: page keeps its own layout, a fetch starts. */
  var p = { _profileId: A, widgetLayout: { identity: { x: 0, y: 0, z: 1, tilt: 0 } } };
  sync.apply(p);
  assert.strictEqual(p.widgetLayout.identity.x, 0);
  await new Promise(function (r) { setImmediate(r); });
  assert.deepStrictEqual(events, ["cognation:remote-profile-loaded"], "repaint after a DB row loads");
  /* DB row wins over the local/spawn layout. */
  sync.apply(p);
  assert.strictEqual(p.widgetLayout.identity.x, 40);
  assert.strictEqual(p.widgetLayout.identity.tilt, 3);

  /* No row: default spawn layout stays, no repaint. */
  var q = { _profileId: B, widgetLayout: { music: { x: 5, y: 6, z: 1, tilt: 0 } } };
  sync.apply(q);
  await new Promise(function (r) { setImmediate(r); });
  sync.apply(q);
  assert.strictEqual(q.widgetLayout.music.x, 5);
  assert.strictEqual(events.length, 1);

  /* Owner save (e.g. a localStorage-only layout) upserts into the DB. */
  q.widgetLayout.music.x = 99;
  q.widgetLayout.bad = "nope";
  assert.strictEqual(sync.save(q), true);
  timers.forEach(function (fn) { fn(); });
  var post = calls.filter(function (c) { return c.opts.method === "POST"; })[0];
  assert.ok(post, "upsert sent");
  assert.strictEqual(post.opts.query, "on_conflict=profile_id");
  assert.ok(/merge-duplicates/.test(post.opts.prefer));
  assert.strictEqual(post.opts.body.layout.music.x, 99);
  assert.ok(!("bad" in post.opts.body.layout), "junk entries dropped");

  /* Non-uuid (demo/offline) profiles never touch the DB. */
  assert.strictEqual(sync.save({ id: "alexa-thomas", widgetLayout: { a: { x: 1 } } }), false);

  /* Migration: idempotent and owner-only RLS. */
  var sql = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/20261014_tower_widget_layouts.sql"), "utf8");
  assert.ok(/create table if not exists public\.tower_widget_layouts/.test(sql));
  assert.ok((sql.match(/drop policy if exists/g) || []).length === 4);
  assert.ok((sql.match(/p\.user_id = auth\.uid\(\)/g) || []).length >= 4);

  /* tower.js wires both paths; index loads the module before tower.js. */
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  assert.ok(/CognationTowerLayoutSync\.apply\(p\)/.test(tower));
  assert.ok(/CognationTowerLayoutSync\.save\(data\)/.test(tower));
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.indexOf("js/tower-layout-sync.js") < html.indexOf('js/tower.js"'));
  console.log("tower-layout-sync tests passed");
})().catch(function (e) { console.error(e); process.exit(1); });
