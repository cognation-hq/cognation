/**
 * #350 (B) LIVE NO at 390: shared browser, live sign-in configured. A member
 * (stamped record in cognation.profiles.v1) signs out. The same handle also has
 * an unstamped SeedOps fleet record. Opening #tower-profile-{handle} signed out
 * painted the member's local copy onto the page in 2 of 6 fresh contexts:
 *  - stamped record first in profiles.v1: the page resolves to the member's
 *    server id, and restoreSavedTowerFields -> accountTowerBlob ->
 *    getProfileById returned the stamped record (no localRecordShown), so its
 *    music width, top friends, calendar and going-live painted; the
 *    scrapbook merge added the member's id-keyed layout.
 *  - fleet record first: the page resolves to the fleet id, but the scrapbook
 *    merge read the handle-keyed entry the member's own saves wrote
 *    (writeScrapbookLayout writes under id AND handle), so the member's layout
 *    and music width still painted.
 * Now accountTowerBlob, the shared calendar / going-live readers and the
 * scrapbook merge apply the same localRecordShown rule as the #348-#351 readers.
 * A scrapbook entry (no owner stamp of its own) is skipped when its key is the id
 * or handle of a local record that rule hides.
 * Unchanged: sign-in off (local preview) and demo sessions; the signed-in
 * member's own copy; unstamped fleet records signed out. No storage writes.
 * Real js/accounts.js + function source from js/tower.js in a vm. No network,
 * no DB.
 * Run: node --test js/tower-signed-out-cache-guard.test.js
 */
"use strict";
var assert = require("assert");
var test = require("node:test");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function store() {
  var d = {};
  return { _d: d, getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }
var TOWER_SRC = read("js/tower.js");
function fnSrc(name, optional) {
  var start = TOWER_SRC.indexOf("function " + name + "(");
  if (start < 0) {
    assert.ok(optional, name + " found in tower.js");
    return "";
  }
  var end = TOWER_SRC.indexOf("\n  }\n", start);
  return TOWER_SRC.slice(start, end + 4);
}

var UID = "9b61f2ad-0000-4000-8000-000000000091";
var P416 = "416b26cf-0000-4000-8000-000000000091";
var FLEET = "prof-seed-0091";
var HANDLE = "seed-val-0091";

function stampedRec() {
  return { id: P416, kind: "personal", accountUsername: "val-member", handle: HANDLE, displayName: "VAL",
    ownerUserId: UID, musicYoutubeWidth: 555, phone: "5550100", friendIds: ["leak-friend-1"],
    calendarEvents: [{ id: "ev-member-leak", title: "MEMBER EVENT", start: "2026-11-02T10:00" }],
    goingLive: { when: "2026-11-02T20:00", what: "MEMBER LIVE" } };
}
function fleetRec() {
  return { id: FLEET, kind: "personal", accountUsername: "seed-val-0091", handle: HANDLE, displayName: "VAL",
    accountKind: "seed", isSeed: true, serverProfileId: P416, musicYoutubeWidth: 320,
    calendarEvents: [{ id: "ev-fleet", title: "FLEET EVENT", start: "2026-11-03T10:00" }] };
}
function memberLayout() {
  return { widgetLayout: { slogan: { x: 66, y: 10, z: 1, tilt: 0 } }, musicYoutubeWidth: 555,
    avatarDataUrl: "data:image/png;base64,TUVNQkVS", musicUrl: "https://www.youtube.com/watch?v=MEMBERMEMB1" };
}

/* order: "stamped-first" | "fleet-first"; mode: "live" | "off"; session: null | object */
function boot(opts) {
  var ls = store();
  var profiles = {};
  if (opts.order === "fleet-first") { profiles[FLEET] = fleetRec(); profiles[P416] = stampedRec(); }
  else { profiles[P416] = stampedRec(); profiles[FLEET] = fleetRec(); }
  ls.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  ls.setItem("cognation.accounts.v1", JSON.stringify({ accounts: [
    { username: "val-member", phone: "", profileIds: [P416] },
    { username: "seed-val-0091", phone: "", profileIds: [FLEET] }] }));
  var scrap = {};
  scrap[P416] = memberLayout();
  scrap[HANDLE] = memberLayout();
  if (opts.fleetLayout) scrap[FLEET] = { widgetLayout: { quote: { x: 12, y: 20, z: 1, tilt: 0 } } };
  ls.setItem("cognation.scrapbookLayout.v1", JSON.stringify(scrap));
  if (opts.session) ls.setItem("cognation.session.v2", JSON.stringify(opts.session));
  var doc = { addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var win = { localStorage: ls, document: doc,
    CognationSupabase: { configured: function () { return opts.mode === "live"; }, getSession: function () { return null; } } };
  win.window = win;
  var ctx = { window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, JSON: JSON, Date: Date,
    console: console, String: String, Object: Object, Array: Array, Math: Math, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt };
  vm.runInNewContext(read("js/accounts.js"), ctx);
  var harness =
    "var SCRAPBOOK_LAYOUT_KEY = 'cognation.scrapbookLayout.v1';\n" +
    "var GRID_NUDGE_KEY = '_gridNudge', GRID_SIZE_KEY = '_gridSize', GRID_TILT_KEY = '_gridTilt';\n" +
    "function cleanGridNudge() { return {}; }\n" +
    "function cleanGridSize() { return {}; }\n" +
    "function cleanGridTilt() { return {}; }\n" +
    "function coerceEventWhen(v) { return String(v || ''); }\n" +
    ["localRecordShown", "layoutCoord", "scrapbookLayoutKeys", "readScrapbookLayouts", "readSavedScrapbook",
      "accountTowerBlob", "accountProfilesFor", "normalizeGoingLive", "sharedCalendarEvents", "sharedGoingLive",
      "mergeLocalScrapbookLayout"].map(function (n) { return fnSrc(n); }).join("\n") + "\n" +
    /* Helpers the fix adds; absent on the base commit. */
    ["scrapbookKeyHidden", "readShownScrapbook", "accountProfilesShownFor"].map(function (n) { return fnSrc(n, true); }).join("\n") + "\n" +
    "this.__t = { accountTowerBlob: accountTowerBlob, mergeLocalScrapbookLayout: mergeLocalScrapbookLayout,\n" +
    "  sharedCalendarEvents: sharedCalendarEvents, sharedGoingLive: sharedGoingLive,\n" +
    "  savedLayoutFor: function (id) { return typeof scrapbookKeyHidden === 'function' && scrapbookKeyHidden(id) ? null : (readScrapbookLayouts()[id] || null); } };";
  vm.runInNewContext(harness, ctx);
  return { t: ctx.__t, ls: ls, snapshot: JSON.stringify(ls._d) };
}

function page(id) { return { _profileId: id, handle: HANDLE, widgetLayout: {}, musicYoutubeWidth: 320 }; }
function leaks(t, id) {
  var p = t.mergeLocalScrapbookLayout(page(id));
  var blob = t.accountTowerBlob(id);
  var cal = t.sharedCalendarEvents({ _profileId: id }).map(function (e) { return e.id; });
  var live = t.sharedGoingLive({ _profileId: id });
  var saved = t.savedLayoutFor(id);
  return {
    layoutSlogan: !!(p.widgetLayout && p.widgetLayout.slogan),
    musicWidth555: p.musicYoutubeWidth === 555,
    blobStamped: !!(blob && blob.musicYoutubeWidth === 555),
    calendarMember: cal.indexOf("ev-member-leak") >= 0,
    goingLiveMember: !!(live && live.what === "MEMBER LIVE"),
    savedAvatarMember: !!(saved && saved.avatarDataUrl === "data:image/png;base64,TUVNQkVS")
  };
}
var NONE = { layoutSlogan: false, musicWidth555: false, blobStamped: false, calendarMember: false, goingLiveMember: false, savedAvatarMember: false };

["stamped-first", "fleet-first"].forEach(function (order) {
  /* Base trace: stamped-first resolves to the member's server id (social cache), fleet-first to the fleet id. Cover both ids in both orders. */
  [P416, FLEET].forEach(function (id) {
    test("signed out, live sign-in, " + order + ", page " + (id === P416 ? "server id" : "fleet id") + ": no member leftover paints", function () {
      var b = boot({ order: order, mode: "live" });
      var got = leaks(b.t, id);
      if (id === FLEET) got.savedAvatarMember = false; /* no id-keyed member entry for the fleet id */
      assert.deepStrictEqual(got, NONE);
      assert.strictEqual(JSON.stringify(b.ls._d), b.snapshot, "no storage writes");
    });
  });

  test("signed out, live sign-in, " + order + ": the unstamped fleet record still shows", function () {
    var b = boot({ order: order, mode: "live", fleetLayout: true });
    var blob = b.t.accountTowerBlob(FLEET);
    assert.ok(blob, "fleet blob returned");
    assert.strictEqual(blob.musicYoutubeWidth, 320);
    var p = b.t.mergeLocalScrapbookLayout(page(FLEET));
    assert.ok(p.widgetLayout.quote && p.widgetLayout.quote.x === 12, "fleet id-keyed layout still merges");
    assert.ok(b.t.sharedCalendarEvents({ _profileId: FLEET }).some(function (e) { return e.id === "ev-fleet"; }));
  });

  test("signed in as the member, " + order + ": own copy paints as before", function () {
    var b = boot({ order: order, mode: "live", session: { source: "supabase", supabaseUserId: UID, activeProfileId: P416 } });
    var got = leaks(b.t, P416);
    assert.deepStrictEqual(got, { layoutSlogan: true, musicWidth555: true, blobStamped: true, calendarMember: true, goingLiveMember: true, savedAvatarMember: true });
  });

  [["sign-in off", { mode: "off" }], ["demo session", { mode: "live", session: { source: "demo", activeProfileId: P416 } }]].forEach(function (c) {
    test(c[0] + ", " + order + ": unchanged (every local record, as before)", function () {
      var b = boot(Object.assign({ order: order }, c[1]));
      var got = leaks(b.t, P416);
      assert.deepStrictEqual(got, { layoutSlogan: true, musicWidth555: true, blobStamped: true, calendarMember: true, goingLiveMember: true, savedAvatarMember: true });
      var f = b.t.mergeLocalScrapbookLayout(page(FLEET));
      assert.ok(f.widgetLayout.slogan, "handle-keyed entry still merges for the fleet id");
    });
  });
});

test("signed in as another member: the first member's stamped leftover stays out", function () {
  var b = boot({ order: "stamped-first", mode: "live", session: { source: "supabase", supabaseUserId: "other-0000-uid", activeProfileId: "p-other" } });
  var got = leaks(b.t, P416);
  assert.deepStrictEqual(got, NONE);
});
