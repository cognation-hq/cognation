/**
 * Personal inline music link (bindMusicOwnerControls): a change goes up as the
 * layout row's _public copy through savePublic, under the not-loaded guard
 * (#343), same as Save profile; a cleared link stays cleared (#345 mark); a
 * profile with no link keeps the stored one.
 * Stub Supabase only: every write is logged, none leaves.
 * Run: node --test js/inline-music-public.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

var TOWER = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var SYNC = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
var A = "33333333-3333-4333-8333-333333333333";
var OLD_MUSIC = "https://www.youtube.com/watch?v=OLDOLDOLD01";
var NEW_MUSIC = "https://www.youtube.com/watch?v=NEWNEWNEW02";

function fnSource(src, name) {
  var start = src.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(start, i + 1);
}

test("inline music commit: _public from the edited profile, before the store save, clear marked", function () {
  var fn = fnSource(TOWER, "commitMusicUrl");
  var pub = fn.indexOf("CognationTowerLayoutSync.savePublic(cur)");
  var mark = fn.indexOf("if (!next) cur._musicCleared = true;");
  var save = fn.indexOf("TowerProfileStore.save(cur)");
  assert.ok(pub > 0, "savePublic gets the edited profile");
  assert.ok(pub < save, "row copy first (same order as Pro YouTube and removing a social widget)");
  assert.ok(mark > 0 && mark < save, "an explicit clear is marked for the local copy");
  assert.ok(fn.indexOf("savePublic(TowerProfileStore.get())") < 0, "no savePublic of a re-read profile");
});

function harness() {
  var writes = [], reads = [], timers = [];
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
          writes.push({ table: table, method: opts.method, body: JSON.parse(JSON.stringify(opts.body)) });
          return Promise.resolve(null);
        }
        return new Promise(function (resolve) { reads.push(resolve); });
      },
    },
  };
  win.window = win;
  vm.runInNewContext(SYNC, win);
  return { sync: win.CognationTowerLayoutSync, writes: writes, reads: reads,
    flush: function () { timers.splice(0).forEach(function (fn) { if (fn) fn(); }); } };
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function row() { return [{ layout: { _full: 1, _public: { musicUrl: OLD_MUSIC, socialLinks: {} } } }]; }

test("loaded page: an inline edit sends one POST with the new _public.musicUrl", async function () {
  var h = harness();
  h.sync.apply({ _profileId: A, _remote: true, musicUrl: OLD_MUSIC });
  h.reads[0](row());
  await tick();
  h.sync.savePublic({ _profileId: A, _remote: true, musicUrl: NEW_MUSIC, socialLinks: {} });
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 1);
  assert.strictEqual(h.writes[0].body.layout._public.musicUrl, NEW_MUSIC);
});

test("not-loaded window: an inline edit writes nothing", async function () {
  var h = harness();
  h.sync.apply({ _profileId: A, _remote: true, musicUrl: OLD_MUSIC });
  h.sync.savePublic({ _profileId: A, _remote: true, musicUrl: NEW_MUSIC, socialLinks: {} });
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 0);
});
