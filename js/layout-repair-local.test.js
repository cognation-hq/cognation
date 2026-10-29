/**
 * Tower layout repairs stay local until the owner drags, resizes, adds /
 * removes a widget or saves. Rendering a Tower whose layout needs repair
 * (overlap fix, one-time compaction, factory-tilt cleanup) makes 0 writes to
 * tower_widget_layouts: own Tower, someone else's, a seed, signed out. An owner
 * drag end makes exactly one write, and it carries the repaired layout.
 * Stubbed session and client only; nothing leaves the process.
 * Run: node --test js/layout-repair-local.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

var OWNER_USER = "11111111-1111-4111-8111-111111111111";
var OWNER_PROFILE = "22222222-2222-4222-8222-222222222222";
var OTHER_PROFILE = "33333333-3333-4333-8333-333333333333";
var SEED_PROFILE = "44444444-4444-4444-8444-444444444444";

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    _data: data,
  };
}

/* Test-only hook: expose the two render-time repair passes. Same code, no edits. */
var HOOK_AT = "  window.CognationTowerProfileStore = TowerProfileStore;";
function towerSource() {
  var t = src("js/tower.js");
  assert.ok(t.indexOf(HOOK_AT) > 0, "hook anchor present");
  return t.replace(
    HOOK_AT,
    HOOK_AT + "\n  window.__repairHook = { repairLayoutOverlaps: repairLayoutOverlaps, settleArrivalTilts: settleArrivalTilts };"
  );
}

/* signedIn: false = signed out (no session, no token). */
function boot(signedIn, savedRows) {
  var storage = memoryStorage();
  var writes = [];
  var listeners = {};
  var documentStub = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; } } },
    addEventListener: function (type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () {
      return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } };
    },
  };
  var session = signedIn
    ? { source: "supabase", supabaseUserId: OWNER_USER, activeProfileId: OWNER_PROFILE, username: "owner" }
    : null;
  var client = {
    configured: function () { return true; },
    getSession: function () { return signedIn ? { access_token: "stub-token" } : null; },
    rest: function (table, opts) {
      var method = (opts && opts.method) || "GET";
      if (method !== "GET") {
        writes.push({ table: table, method: method, body: JSON.parse(JSON.stringify((opts && opts.body) || null)) });
        return Promise.resolve(null);
      }
      if (table === "tower_widget_layouts") {
        var m = /profile_id=eq\.([^&]+)/.exec((opts && opts.query) || "");
        var id = m ? decodeURIComponent(m[1]) : "";
        var row = savedRows && savedRows[id];
        return Promise.resolve(row ? [{ layout: JSON.parse(JSON.stringify(row)) }] : []);
      }
      return Promise.resolve([]);
    },
    rpc: function () { return Promise.resolve(null); },
  };
  var win = {
    document: documentStub,
    localStorage: storage,
    sessionStorage: memoryStorage(),
    location: { hash: "", href: "https://cognation.test/", search: "", pathname: "/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationAuth: { getSession: function () { return session; } },
    CognationSupabase: client,
  };
  win.window = win;
  var context = vm.createContext({
    window: win,
    document: documentStub,
    localStorage: storage,
    sessionStorage: win.sessionStorage,
    location: win.location,
    console: console,
    CustomEvent: win.CustomEvent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  });
  vm.runInContext(src("js/accounts.js"), context);
  vm.runInContext(src("js/tower-layout-sync.js"), context);
  vm.runInContext(towerSource(), context);
  return { win: win, writes: writes, storage: storage };
}

/* A desktop stage (1068px) with real-looking offsets: YouTube covers
   Followers, Followers covers Calendar (live check r143, browser B). */
function fakeStage(boxes) {
  var stage = {
    clientWidth: 1068,
    clientHeight: 900,
    style: {},
    classList: { contains: function () { return false; } },
  };
  var els = boxes.map(function (b) {
    var attrs = { "data-tower-widget": b.id };
    return {
      parentNode: stage,
      hidden: false,
      classList: { contains: function () { return false; } },
      offsetLeft: b.x, offsetTop: b.y, offsetWidth: b.w, offsetHeight: b.h,
      style: { setProperty: function (k, v) { this[k] = v; } },
      getAttribute: function (n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null; },
      setAttribute: function (n, v) { attrs[n] = String(v); },
      attrs: attrs,
    };
  });
  stage.querySelectorAll = function () { return els; };
  stage.querySelector = function (sel) {
    var m = /data-tower-widget="([^"]+)"/.exec(sel);
    return (m && els.filter(function (e) { return e.attrs["data-tower-widget"] === m[1]; })[0]) || null;
  };
  stage.els = els;
  return stage;
}

var BOXES = [
  { id: "avatar", x: 16, y: 32, w: 121, h: 175 },
  { id: "identity", x: 149, y: 32, w: 294, h: 119 },
  { id: "youtube", x: 16, y: 247, w: 314, h: 215 },
  { id: "followers", x: 16, y: 374, w: 526, h: 131 },
  { id: "calendar", x: 457, y: 393, w: 526, h: 342 },
];
var SPAWN = { avatar: true, identity: true, youtube: true, followers: true, calendar: true };

/* Saved row that needs every repair: overlaps, no _compacted mark, a factory tilt. */
function needsRepairLayout() {
  return {
    avatar: { x: 1.5, y: 3.5, z: 2, tilt: -2, yPx: 32, dragged: true },
    identity: { x: 14, y: 3.5, z: 2, tilt: 0, yPx: 32, dragged: true },
    youtube: { x: 1.5, y: 27, z: 2, tilt: 0, yPx: 247, dragged: true },
    followers: { x: 1.5, y: 41, z: 2, tilt: 0, yPx: 374, dragged: true },
    calendar: { x: 42.8, y: 43, z: 2, tilt: 0, yPx: 393, dragged: true },
  };
}

function profile(id, extra) {
  var p = {
    _profileId: id,
    _remote: true,
    displayName: "Tower",
    handle: "tower",
    widgetLayout: needsRepairLayout(),
    quoteStickers: [],
    emojiStickers: [],
    friendPinLayout: {},
    badgePinLayout: {},
    publicWidgets: {},
    badgeVisibility: {},
  };
  Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
  return p;
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* What a render does: read the saved row (the layout sync loads it), settle
   factory tilts, then the end-of-layout overlap repair. */
async function renderTower(env, p) {
  var sync = env.win.CognationTowerLayoutSync;
  sync.apply(p);
  await wait(5);
  sync.apply(p);
  var hook = env.win.__repairHook;
  var settled = hook.settleArrivalTilts(p);
  var stage = fakeStage(BOXES);
  var repaired = hook.repairLayoutOverlaps(stage, p, p.widgetLayout, SPAWN);
  await wait(700); /* past the 600ms upload debounce */
  return { settled: settled, repaired: repaired, stage: stage };
}

function layoutWrites(env) {
  return env.writes.filter(function (w) { return w.table === "tower_widget_layouts"; });
}

test("own Tower: render repairs the layout on screen but writes nothing", async function () {
  var rows = {};
  rows[OWNER_PROFILE] = needsRepairLayout();
  var env = boot(true, rows);
  var p = profile(OWNER_PROFILE);
  var r = await renderTower(env, p);
  assert.strictEqual(r.settled, true, "factory tilt was cleaned");
  assert.strictEqual(r.repaired, true, "overlap repair ran");
  var followers = r.stage.els.filter(function (e) { return e.attrs["data-tower-widget"] === "followers"; })[0];
  assert.ok(followers.attrs["data-sticker-y"], "repaired spot painted on the stage");
  assert.strictEqual(p.widgetLayout.avatar.tilt, 0, "tilt fixed in memory");
  assert.strictEqual(p.widgetLayout._compacted, 1, "one-time pass marked in memory");
  assert.strictEqual(env.writes.length, 0, "no server write of any kind from a render repair");
  /* Kept for the session: the next read of the row sees the repair. */
  var again = profile(OWNER_PROFILE);
  env.win.CognationTowerLayoutSync.apply(again);
  assert.strictEqual(again.widgetLayout._compacted, 1, "repair kept in memory for the next read");
  assert.strictEqual(again.widgetLayout.avatar.tilt, 0, "tilt repair kept in memory");
  assert.strictEqual(
    env.storage.getItem("cognation.scrapbookLayout.v1"),
    null,
    "signed-in repair does not write the local copy (next load repairs again from the same row)"
  );
});

test("own Tower: an owner drag end after a render repair writes exactly once, with the repair", async function () {
  var rows = {};
  rows[OWNER_PROFILE] = needsRepairLayout();
  var env = boot(true, rows);
  var p = profile(OWNER_PROFILE);
  await renderTower(env, p);
  var store = env.win.CognationTowerProfileStore;
  var hook = env.win.__repairHook;
  /* Drop handler: read the profile, move the dragged widget, save, then the post-drop repair. */
  var dragged = profile(OWNER_PROFILE);
  env.win.CognationTowerLayoutSync.apply(dragged);
  dragged.widgetLayout.calendar = { x: 49.6, y: 80, z: 3, tilt: 0, yPx: 760, dragged: true };
  assert.strictEqual(store.save(dragged, { geometry: true }), true, "owner drag end saves");
  /* The stage after the drop: Calendar where it landed, Followers in its repaired row. */
  var afterDrop = BOXES.map(function (b) {
    if (b.id === "calendar") return { id: b.id, x: 530, y: 760, w: b.w, h: b.h };
    if (b.id === "followers") return { id: b.id, x: 16, y: 474, w: b.w, h: b.h };
    return b;
  });
  hook.repairLayoutOverlaps(fakeStage(afterDrop), dragged, dragged.widgetLayout, SPAWN, { ownerAction: true });
  await wait(700);
  var w = layoutWrites(env);
  assert.strictEqual(w.length, 1, "one write for one drag end");
  assert.strictEqual(w[0].method, "POST");
  assert.strictEqual(w[0].body.profile_id, OWNER_PROFILE);
  assert.strictEqual(w[0].body.layout.calendar.x, 49.6, "the drop is in the write");
  assert.strictEqual(w[0].body.layout._compacted, 1, "the staged repair goes up with the drop");
  assert.strictEqual(w[0].body.layout.avatar.tilt, 0, "the tilt cleanup goes up with the drop");
});

test("someone else's Tower and a seed viewed by a real user: render writes nothing", async function () {
  var rows = {};
  rows[OTHER_PROFILE] = needsRepairLayout();
  rows[SEED_PROFILE] = needsRepairLayout();
  var env = boot(true, rows);
  await renderTower(env, profile(OTHER_PROFILE));
  await renderTower(env, profile(SEED_PROFILE, { _seed: true, handle: "seed-ana-0005" }));
  await renderTower(env, profile(OTHER_PROFILE, { _directoryFriend: true }));
  assert.strictEqual(env.writes.length, 0, "no write while viewing another Tower");
  var cached = env.win.CognationTowerLayoutSync._cache[OTHER_PROFILE];
  assert.ok(!cached._compacted, "another Tower's row is not even staged");
});

test("signed out: render writes nothing", async function () {
  var env = boot(false, {});
  await renderTower(env, profile(OWNER_PROFILE));
  assert.strictEqual(env.writes.length, 0, "signed-out render makes no write");
});

test("repair-mode saves never upload or PATCH, even for the owner", async function () {
  var rows = {};
  rows[OWNER_PROFILE] = needsRepairLayout();
  var env = boot(true, rows);
  var store = env.win.CognationTowerProfileStore;
  var p = profile(OWNER_PROFILE);
  env.win.CognationTowerLayoutSync.apply(p);
  await wait(5);
  env.win.CognationTowerLayoutSync.apply(p);
  p.friendPinLayout = { "friend-a": { x: 10, y: 10 } };
  p.quoteStickers = [{ id: "q1", text: "hi", x: 1, y: 1 }];
  assert.strictEqual(store.save(p, { repair: true }), true);
  assert.strictEqual(store.save(p, { geometry: true, repair: true }), true);
  await wait(700);
  assert.strictEqual(env.writes.length, 0, "repair saves stay local");
});

test("wiring: every render-time repair save is in repair mode; owner actions are not", function () {
  var tower = src("js/tower.js");
  var social = src("js/supabase-social.js");
  assert.ok(/settleArrivalTilts\(p\)[\s\S]{0,2200}TowerProfileStore\.save\(p, \{ geometry: true, repair: true \}\)/.test(tower), "tilt cleanup");
  assert.ok(/ensureFriendPinPositions\(p, selected\)\) \{\s*\/\*[^*]*\*\/\s*TowerProfileStore\.save\(p, \{ repair: true \}\)/.test(tower), "friend pin seat on render");
  assert.ok(/this\.save\(p, \{ repair: true \}\)/.test(tower), "read-time migration in get()");
  assert.ok(/store\.save\(tower, \{ repair: true \}\)/.test(social), "friend roster hydrate");
  assert.ok(/repairLayoutOverlaps\(stage, p, layout, spawnIds\);/.test(tower), "render pass: no owner flag");
  assert.ok(/repairLayoutOverlaps\(stage, p, getWidgetLayout\(p\), spawnIdsR, \{ ownerAction: true \}\)/.test(tower), "resize end");
  assert.ok(/repairLayoutOverlaps\(stage, pr, getWidgetLayout\(pr\), spawnIdsDrop, \{ ownerAction: true \}\)/.test(tower), "drop");
});

test("own Tower before its row loads: a render repair writes nothing, not even the local copy", async function () {
  var env = boot(true, {});
  var p = profile(OWNER_PROFILE);
  var hook = env.win.__repairHook;
  assert.strictEqual(hook.settleArrivalTilts(p), true);
  assert.strictEqual(hook.repairLayoutOverlaps(fakeStage(BOXES), p, p.widgetLayout, SPAWN), true);
  await wait(700);
  assert.strictEqual(env.writes.length, 0, "no server write");
  assert.strictEqual(env.storage.getItem("cognation.scrapbookLayout.v1"), null, "no local layout copy");
});
