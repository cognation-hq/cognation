/**
 * Tower layout on the server (Oct 22): added widgets (Quote / emoji stickers),
 * friend and badge pin spots and widget on/off save to
 * tower_widget_layouts.layout._widgets for a signed-in owner, load in a fresh
 * browser, and win over the localStorage cache. No SQL (existing jsonb column).
 * Run: node js/tower-layout-widgets.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var SRC = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function J(x) { return JSON.parse(JSON.stringify(x)); } /* vm realm → plain */
var OWNER = "11111111-1111-4111-8111-111111111111";

/* One "browser": its own module state, a fake server shared across browsers. */
function browser(server, opts) {
  opts = opts || {};
  var b = { calls: [], timers: [], events: [] };
  var win = {
    setTimeout: function (fn) { b.timers.push(fn); return b.timers.length; },
    clearTimeout: function (h) { if (h) b.timers[h - 1] = null; },
    CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
    document: { dispatchEvent: function (e) { b.events.push(e.type); } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return opts.signedOut ? null : { access_token: "t" }; },
      rest: function (table, o) {
        b.calls.push({ table: table, opts: o });
        if (!o.method) {
          var id = /profile_id=eq\.([^&]+)/.exec(o.query)[1];
          return Promise.resolve(server[id] ? [{ layout: JSON.parse(JSON.stringify(server[id])) }] : []);
        }
        server[o.body.profile_id] = JSON.parse(JSON.stringify(o.body.layout));
        return Promise.resolve(null);
      },
    },
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  b.sync = win.CognationTowerLayoutSync;
  b.flush = function () { var t = b.timers.slice(); b.timers.forEach(function (_, i) { b.timers[i] = null; }); t.forEach(function (fn) { if (fn) fn(); }); };
  b.posts = function () { return b.calls.filter(function (c) { return c.opts.method === "POST"; }); };
  b.load = async function (p) {
    b.sync.apply(p);
    await new Promise(function (r) { setImmediate(r); });
    b.sync.apply(p);
    return p;
  };
  return b;
}

(async function () {
  /* 1. Caps and junk. */
  var b0 = browser({});
  var many = [];
  for (var i = 0; i < 15; i++) many.push({ id: "quote-" + i, text: "q" + i, x: i, y: i });
  many.push({ id: "bad id with spaces", text: "x" });
  var w = b0.sync._cleanWidgets({
    quoteStickers: [{ id: "quote-long", text: new Array(600).join("a"), x: 1, y: 2 }].concat(many),
    emojiStickers: [{ id: "fire", glyph: "🔥", size: 64 }, { id: "<b>" }],
    friendPinLayout: { f1: { x: 10, y: 20 }, f2: { x: "nope" } },
    publicWidgets: { music: false, calendar: true, "x y": false },
    badgeVisibility: { "founder-cap": false },
  });
  assert.strictEqual(w.quoteStickers.length, 12, "12 quotes at most");
  assert.strictEqual(w.quoteStickers[0].text.length, 400, "quote text capped at 400");
  assert.ok(w.quoteStickers.every(function (q) { return q.id !== "bad id with spaces"; }), "bad ids dropped");
  assert.deepStrictEqual(J(w.emojiStickers.map(function (e) { return e.id; })), ["fire"]);
  assert.deepStrictEqual(J(Object.keys(w.friendPinLayout)), ["f1"]);
  assert.deepStrictEqual(J(w.publicWidgets), { music: false, calendar: true });
  assert.deepStrictEqual(J(w.badgeVisibility), { "founder-cap": false });

  /* 2. Browser 1, signed-in owner, no row yet: add a Quote and drag it. */
  var server = {};
  var b1 = browser(server);
  var p1 = await b1.load({ _profileId: OWNER, widgetLayout: null, quoteStickers: [] });
  assert.strictEqual(b1.posts().length, 0, "opening the Tower never posts");
  p1.quoteStickers = [{ id: "quote-a", text: "SeedOps still-here check", x: 40, y: 30, z: 10, tilt: 0 }];
  assert.strictEqual(b1.sync.saveWidgetsIfChanged(p1), true, "add uploads");
  p1.quoteStickers[0].x = 52.5;
  p1.quoteStickers[0].y = 61.25;
  assert.strictEqual(b1.sync.save(p1), true, "drag end uploads with no built-in positions");
  b1.flush();
  var posts = b1.posts();
  assert.strictEqual(posts.length, 1, "debounced: add + drag go up as one write");
  assert.strictEqual(posts[0].opts.body.profile_id, OWNER, "only the owner's own row");
  assert.deepStrictEqual(J(server[OWNER]._widgets.quoteStickers[0]), { id: "quote-a", text: "SeedOps still-here check", x: 52.5, y: 61.25, z: 10, tilt: 0 });
  assert.strictEqual(b1.sync.saveWidgetsIfChanged(p1), false, "no change, no write");

  /* 3. Fresh browser with no localStorage cache: loads the Quote from the row. */
  var b2 = browser(server);
  var fresh = { _profileId: OWNER, widgetLayout: null, quoteStickers: [], emojiStickers: [] };
  await b2.load(fresh);
  assert.strictEqual(fresh.quoteStickers.length, 1, "fresh browser shows the Quote");
  assert.strictEqual(fresh.quoteStickers[0].x, 52.5, "at the dragged spot (x)");
  assert.strictEqual(fresh.quoteStickers[0].y, 61.25, "at the dragged spot (y)");
  assert.strictEqual(b2.posts().length, 0, "loading never posts");

  /* 4. The server row wins over an older localStorage cache. */
  var b3 = browser(server);
  var cached = {
    _profileId: OWNER,
    quoteStickers: [{ id: "quote-old", text: "stale local", x: 1, y: 1 }],
    publicWidgets: { music: true, calendar: true },
  };
  server[OWNER]._widgets.publicWidgets = { music: false };
  await b3.load(cached);
  assert.deepStrictEqual(J(cached.quoteStickers.map(function (q) { return q.id; })), ["quote-a"], "server quotes replace the cache");
  assert.strictEqual(cached.publicWidgets.music, false, "server switch wins");
  assert.strictEqual(cached.publicWidgets.calendar, true, "switches the row doesn't name stay");

  /* 5. Remove / switch off upload; positions come from the row, never the spawn grid. */
  server[OWNER].calendar = { x: 70, y: 10, z: 3, tilt: 0, dragged: true };
  var b4 = browser(server);
  var p4 = await b4.load({ _profileId: OWNER, widgetLayout: { calendar: { x: 5, y: 5, z: 1, tilt: 0 } } });
  p4.widgetLayout.calendar = { x: 1, y: 1, z: 1, tilt: 0 }; /* spawn grid, not a drag */
  p4.quoteStickers = [];
  p4.publicWidgets.badges = false;
  assert.strictEqual(b4.sync.saveWidgetsIfChanged(p4), true);
  b4.flush();
  assert.deepStrictEqual(J(server[OWNER]._widgets.quoteStickers), [], "removal saved");
  assert.strictEqual(server[OWNER]._widgets.publicWidgets.badges, false, "switch saved");
  assert.strictEqual(server[OWNER].calendar.x, 70, "a widget-only save keeps the row's positions");

  /* 6. Signed out: never writes. */
  var b5 = browser(server, { signedOut: true });
  var p5 = await b5.load({ _profileId: OWNER });
  p5.quoteStickers = [{ id: "quote-z", text: "nope", x: 1, y: 1 }];
  assert.strictEqual(b5.sync.saveWidgetsIfChanged(p5), false);
  assert.strictEqual(b5.sync.save(p5), false);
  b5.flush();
  assert.strictEqual(b5.posts().length, 0, "signed-out pages never write");

  /* 7. Row not read yet: a change never overwrites it blind. */
  var b6 = browser(server);
  var p6 = { _profileId: OWNER, quoteStickers: [] };
  b6.sync.apply(p6); /* fetch started, not back */
  p6.quoteStickers = [{ id: "quote-y", text: "early", x: 1, y: 1 }];
  assert.strictEqual(b6.sync.saveWidgetsIfChanged(p6), false, "no write before the row is read");

  /* 7b. Page-filled defaults are not edits: an "on" switch the row doesn't
     name, or Pro dropping the music key, never uploads on open. */
  var b7 = browser({});
  var p7 = await b7.load({ _profileId: OWNER, publicWidgets: { music: true, calendar: true } });
  delete p7.publicWidgets.music;
  p7.publicWidgets.envelope = true;
  assert.strictEqual(b7.sync.saveWidgetsIfChanged(p7), false, "defaults filled in on open never upload");
  p7.publicWidgets.calendar = false;
  assert.strictEqual(b7.sync.saveWidgetsIfChanged(p7), true, "switching a widget off uploads");

  /* 8. tower.js: owner-only, signed-in only, and the cache is applied before the row. */
  var saveFn = tower.slice(tower.indexOf("    save: function (data, opts) {"), tower.indexOf("      var towerBlob = {};"));
  assert.ok(saveFn.indexOf("if (!isTowerOwner(data)) return false;") >= 0 &&
    saveFn.indexOf("if (!isTowerOwner(data)) return false;") < saveFn.indexOf("CognationTowerLayoutSync.save(data)"), "owner check comes before any upload");
  assert.ok(/CognationTowerLayoutSync && liveSignedInForTower\(\)/.test(saveFn), "signed-in only");
  var merge = tower.slice(tower.indexOf("  function mergeScrapbookLayout(p) {"), tower.indexOf("  function mergeLocalScrapbookLayout(p) {"));
  assert.ok(merge.indexOf("mergeLocalScrapbookLayout(p)") < merge.indexOf("CognationTowerLayoutSync.apply(p)"), "localStorage first, then the server row wins");
  assert.ok(!fs.readdirSync(path.join(__dirname, "..", "supabase", "migrations")).some(function (f) { return /widgets?_layout.*2026102[2-9]|tower_layout_widgets/.test(f); }), "no new SQL");
  console.log("tower-layout-widgets tests passed");
})().catch(function (e) { console.error(e); process.exit(1); });
