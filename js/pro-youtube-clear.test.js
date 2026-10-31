/**
 * Pro YouTube cleared on a fully loaded page stays cleared (a removal stays
 * gone). Clearing the Pro YouTube link used to come back right away: the
 * same-browser copy (writeScrapbookLayout) kept the old link for a remote
 * profile, and the layout row copy (savePublic after a fresh get()) was sent
 * after get() had painted the old link back from both copies.
 * Stub Supabase only: every write is logged, none leaves.
 * Run: node --test js/pro-youtube-clear.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

var TOWER = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var SYNC = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
var A = "11111111-1111-4111-8111-111111111111";
var OLD_MUSIC = "https://www.youtube.com/watch?v=OLDOLDOLD01";

function fnSource(src, name) {
  var start = src.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(start, i + 1);
}

/* writeScrapbookLayout with an in-memory localStorage. */
function scrapbook(initial) {
  var store = { "cognation.scrapbookLayout.v1": JSON.stringify(initial || {}) };
  var ls = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
  };
  var write = new Function("localStorage",
    'var SCRAPBOOK_LAYOUT_KEY = "cognation.scrapbookLayout.v1";\n' +
    "function scrapbookLayoutKeys(p) { return [p._profileId]; }\n" +
    "function readScrapbookLayouts() { return JSON.parse(localStorage.getItem(SCRAPBOOK_LAYOUT_KEY) || '{}'); }\n" +
    "function readSavedScrapbook(p) { return readScrapbookLayouts()[p._profileId] || null; }\n" +
    fnSource(TOWER, "writeScrapbookLayout") + "\nreturn writeScrapbookLayout;")(ls);
  return {
    write: write,
    saved: function () { return JSON.parse(store["cognation.scrapbookLayout.v1"])[A]; },
  };
}

test("same-browser copy: an owner clear of Pro YouTube stores no link", function () {
  var sb = scrapbook({ [A]: { musicUrl: OLD_MUSIC } });
  sb.write({ _profileId: A, _remote: true, musicUrl: "" }, { keepLayout: true, musicCleared: true });
  assert.strictEqual(sb.saved().musicUrl, "", "cleared link is not kept in the local copy");
});

test("same-browser copy: a remote profile with no link still keeps the stored one", function () {
  var sb = scrapbook({ [A]: { musicUrl: OLD_MUSIC } });
  sb.write({ _profileId: A, _remote: true }, { keepLayout: true });
  assert.strictEqual(sb.saved().musicUrl, OLD_MUSIC, "no clear, no loss");
});

test("TowerProfileStore.save hands the clear to the local copy", function () {
  var save = TOWER.slice(TOWER.indexOf("    save: function (data, opts) {"));
  save = save.slice(0, save.indexOf("writeScrapbookLayout(data") + 200);
  assert.ok(/writeScrapbookLayout\(data, \{ keepLayout: !opts\.geometry, musicCleared: !!opts\.musicCleared \}\)/.test(save));
});

test("Pro YouTube commit: row copy is written from the edited profile, before the store save", function () {
  var fn = fnSource(TOWER, "bindProYoutubeUrl");
  var pub = fn.indexOf("CognationTowerLayoutSync.savePublic(cur)");
  var save = fn.indexOf("TowerProfileStore.save(cur, { musicCleared: !next })");
  assert.ok(pub > 0, "savePublic gets the edited profile, not a fresh get()");
  assert.ok(save > 0, "the store save marks an explicit clear");
  assert.ok(pub < save, "row copy first (same order as removing a social widget)");
  assert.ok(fn.indexOf("savePublic(TowerProfileStore.get())") < 0, "no savePublic of a re-read profile");
});

/* Layout-sync with a stub Supabase: every write logged, none leaves. */
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

test("loaded page: clear, then the next read keeps it cleared and the POST has no old link", async function () {
  var h = harness();
  h.sync.apply({ _profileId: A, musicUrl: OLD_MUSIC });
  h.reads[0]([{ layout: { _full: 1, _public: { musicUrl: OLD_MUSIC, socialLinks: {} } } }]);
  await tick();
  h.sync.savePublic({ _profileId: A, musicUrl: "", socialLinks: {} });
  var p = h.sync.apply({ _profileId: A, _remote: true }); /* the next get() */
  assert.strictEqual(p.musicUrl || "", "", "stays cleared");
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 1);
  assert.ok(JSON.stringify(h.writes[0].body).indexOf("OLDOLDOLD01") < 0, "POST body has no old link");
});
