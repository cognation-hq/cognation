/**
 * Sign-out leak (SeedOps live check 2026-10-21): signing out in the same tab left
 * the last member's server posts in the signed-out SIGNAL Feed, and the signed-out
 * SeedOps content did not come back until a new tab (sessionStorage hydrate flag).
 * Now:
 *   - tower.js: on cognation:session-ended the Tower store drops cached member
 *     posts (server posts that are not seed/ops); signed out, list() never returns
 *     them, even from a store written before this fix (reload).
 *   - seedops-tower-hydrate.js: the hydrate flag is per viewer, so the signed-out
 *     viewer hydrates again in the same tab (immediately and after reload).
 *   - supabase-social.js: the in-memory feed is emptied on sign-out.
 * Real tower.js + seedops-tower-hydrate.js (+ helpers) in one vm window.
 * Run: node js/signout-feed-cache.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var TOWER_KEY = "cognation.tower.posts.v3";
var FLAG = "cognation.seedops.towerHydrate.v1";

function memoryStorage(seed) {
  var d = Object.assign({}, seed || {});
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, _d: d };
}
var MEMBER = { source: "supabase", supabaseUserId: "user-dana", activeProfileId: "p-dana", username: "dana" };
var SEED_ROW = { id: "p-seed-1", user_id: "u-seed-1", handle: "jess", display_name: "Jess", bio: "", account_kind: "seed", seed_fleet_id: "seed-0001", kind: "personal" };
var SEED_POST_ROW = { id: "tp-seed-1", author_profile_id: "p-seed-1", body: "Morning walk by the river.", created_at: "2026-10-21T12:00:00.000Z", visibility: "public", attachments: [], rating: "G" };

function boot(opts) {
  var listeners = {};
  var events = [];
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener: function () {},
    dispatchEvent: function (ev) { events.push(ev); (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var storage = opts.localStorage || memoryStorage();
  var session = memoryStorage(opts.sessionSeed);
  var calls = [];
  var win = {
    document: doc, localStorage: storage, sessionStorage: session, location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return win.__session || null; } },
    CognationSupabaseSocial: { active: function () { return !!win.__session; } },
    CognationSupabase: { configured: function () { return true; }, rest: function (table, o) {
      calls.push(table);
      if (table === "profiles") return Promise.resolve([SEED_ROW]);
      if (table === "tower_posts") return Promise.resolve([SEED_POST_ROW]);
      return Promise.resolve([]);
    }, rpc: function () { return Promise.resolve([]); } },
  };
  win.__session = opts.signedIn ? MEMBER : null;
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: session, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise, Date: Date, JSON: JSON, Math: Math,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js", "js/seedops-tower-hydrate.js"]
    .forEach(function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); });
  return { win: win, storage: storage, session: session, calls: calls, events: events,
    signOut: function () { win.__session = null; doc.dispatchEvent(new win.CustomEvent("cognation:session-ended")); } };
}
function ids(list) { return Array.prototype.map.call(list || [], function (p) { return p.id; }).sort().join(","); }
function flush() { return new Promise(function (r) { setImmediate(r); }).then(function () { return new Promise(function (r) { setImmediate(r); }); }); }

var memberPosts = [
  { id: "tp-dana-1", _remote: true, authorProfileId: "p-dana", authorName: "Dana", handle: "dana", accountKind: "real", body: "Private: back from the clinic.", createdAt: "2026-10-21T13:00:00.000Z", rating: "G" },
  { id: "tp-dana-2", _remote: true, authorProfileId: "p-dana", authorName: "Dana", handle: "dana", body: "Dinner at mine Friday.", createdAt: "2026-10-21T13:30:00.000Z", rating: "G" },
];
var seedServer = { id: "tp-seed-0", _remote: true, isSeed: true, accountKind: "seed", seedFleetId: "seed-0002", authorName: "Sam", body: "Coffee?", createdAt: "2026-10-21T11:00:00.000Z", rating: "G", visibility: "public" };
/* PM ruling on #209 (2026-10-21): a seed's / ops account's friends-only post is not part of the signed-out set. */
var seedFriendsOnly = { id: "tp-seed-fo", _remote: true, isSeed: true, accountKind: "seed", seedFleetId: "seed-0004", authorName: "Rae", body: "Friends only: moving house.", createdAt: "2026-10-21T11:30:00.000Z", rating: "G", visibility: "friends" };
var opsFriendsOnly = { id: "tp-ops-fo", _remote: true, isOpsBot: true, accountKind: "ops", authorName: "Ops", body: "Ops friends-only note.", createdAt: "2026-10-21T11:40:00.000Z", rating: "G", visibility: "friends" };
var seedNoVis = { id: "tp-seed-nv", _remote: true, isSeed: true, accountKind: "seed", seedFleetId: "seed-0005", authorName: "Kai", body: "No visibility stored.", createdAt: "2026-10-21T11:50:00.000Z", rating: "G" };
var opsPublic = { id: "tp-ops-pub", _remote: true, isOpsBot: true, accountKind: "ops", authorName: "Ops", body: "Ops public note.", createdAt: "2026-10-21T11:45:00.000Z", rating: "G", visibility: "public" };
var template = { id: "seedops-tower-seed-0003-1", seedopsTower: true, isSeed: true, accountKind: "seed", seedFleetId: "seed-0003", authorName: "Lee", body: "Rain again.", createdAt: "2026-10-21T10:00:00.000Z", rating: "G" };

var results = [];
function check(label, fn) { results.push([label, fn]); }

/* 1. Same tab: signed in with the member's Feed cached, then sign out. */
check("sign-out in the same tab clears the member's posts from the store and the Feed", function () {
  var t = boot({ signedIn: true, sessionSeed: {} });
  t.win.CognationTowerStore.setRemotePosts(memberPosts.concat([seedServer]));
  assert.strictEqual(ids(t.win.CognationTowerStore.list()), "tp-dana-1,tp-dana-2,tp-seed-0", "signed in: member Feed shows");
  t.signOut();
  assert.strictEqual(ids(t.win.CognationTowerStore.list()), "tp-seed-0", "signed out: only SeedOps posts");
  var raw = String(t.storage.getItem(TOWER_KEY) || "");
  assert.ok(raw.indexOf("tp-dana-") < 0 && raw.indexOf("clinic") < 0, "member posts gone from localStorage");
  assert.ok(t.events.some(function (e) { return e.type === "cognation:tower-updated" && e.detail && e.detail.remote; }), "Feed / Times redraw event fired");
});

/* 2. Reload after sign-out with a store written before this fix: list() hides member posts. */
check("reload with a stale member cache: signed-out list() hides member posts", function () {
  var ls = memoryStorage(); ls.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: memberPosts.concat([seedServer, template]) }));
  var t = boot({ signedIn: false, localStorage: ls });
  assert.strictEqual(ids(t.win.CognationTowerStore.list()), "seedops-tower-seed-0003-1,tp-seed-0");
});

/* 3. Signed-in list unchanged (member posts show, local templates still dropped). */
check("signed in: list() unchanged", function () {
  var ls = memoryStorage(); ls.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: memberPosts.concat([seedServer, template]) }));
  var t = boot({ signedIn: true, localStorage: ls });
  assert.strictEqual(ids(t.win.CognationTowerStore.list()), "tp-dana-1,tp-dana-2,tp-seed-0");
});

/* 4. Hydrate flag left by the member's session does not block the signed-out viewer. */
var async = [];
async.push(["signed-out reload with the member's hydrate flag: SeedOps hydrate runs again", function () {
  var flag = {}; flag[FLAG] = JSON.stringify({ ok: true, merged: 40, at: "2026-10-21T13:00:00.000Z", viewer: "member:user-dana" });
  var legacy = {}; legacy[FLAG] = JSON.stringify({ ok: true, merged: 40, at: "2026-10-21T13:00:00.000Z" });
  var a = boot({ signedIn: false, sessionSeed: flag });
  var b = boot({ signedIn: false, sessionSeed: legacy });
  return Promise.all([a.win.CognationSeedOpsTowerHydrate.hydrate({ fillEmpty: false }), b.win.CognationSeedOpsTowerHydrate.hydrate({ fillEmpty: false })]).then(function (r) {
    assert.notStrictEqual(r[0].cached, true, "member flag is not reused signed out");
    assert.notStrictEqual(r[1].cached, true, "flag without a viewer (written before this fix) is not reused");
    assert.ok(a.calls.indexOf("profiles") >= 0, "seed profiles fetched");
    assert.strictEqual(JSON.parse(a.session.getItem(FLAG)).viewer, "signed-out", "flag now records the signed-out viewer");
    assert.ok(ids(a.win.CognationTowerStore.list()).indexOf("tp-seed-1") >= 0, "seed server post back in the signed-out Feed");
  });
}]);
async.push(["same viewer reuses the flag (no refetch on every signed-out load)", function () {
  var flag = {}; flag[FLAG] = JSON.stringify({ ok: true, merged: 40, viewer: "signed-out" });
  var t = boot({ signedIn: false, sessionSeed: flag });
  return t.win.CognationSeedOpsTowerHydrate.hydrate({}).then(function (r) {
    assert.strictEqual(r.cached, true);
    assert.strictEqual(t.calls.length, 0);
  });
}]);
async.push(["sign-out in the same tab re-hydrates immediately", function () {
  var flag = {}; flag[FLAG] = JSON.stringify({ ok: true, merged: 40, viewer: "member:user-dana" });
  var t = boot({ signedIn: true, sessionSeed: flag });
  t.win.CognationTowerStore.setRemotePosts(memberPosts);
  t.signOut();
  return flush().then(flush).then(function () {
    assert.ok(t.calls.indexOf("profiles") >= 0, "hydrate ran on sign-out");
    var list = ids(t.win.CognationTowerStore.list());
    assert.ok(list.indexOf("tp-seed-1") >= 0 && list.indexOf("tp-dana") < 0, "signed-out Feed: seed post back, member posts gone (" + list + ")");
  });
}]);

/* 6. Seed / ops friends-only posts never linger signed out (same tab, store + overlay). */
check("sign-out drops seed and ops friends-only posts; public seed/ops posts stay", function () {
  var t = boot({ signedIn: true, sessionSeed: {} });
  t.storage.setItem("cognation.seedops.tower.posts.v1", JSON.stringify({ version: 1, posts: [seedServer, seedFriendsOnly, template] }));
  t.win.CognationTowerStore.setRemotePosts(memberPosts.concat([seedServer, seedFriendsOnly, opsFriendsOnly, opsPublic, seedNoVis]));
  assert.ok(ids(t.win.CognationTowerStore.list()).indexOf("tp-seed-fo") >= 0, "signed in: the seed's friends-only post shows to a friend");
  t.signOut();
  assert.strictEqual(ids(t.win.CognationTowerStore.list()), "tp-ops-pub,tp-seed-0", "signed out: public seed/ops posts only");
  var raw = String(t.storage.getItem(TOWER_KEY) || "");
  assert.ok(raw.indexOf("tp-seed-fo") < 0 && raw.indexOf("moving house") < 0 && raw.indexOf("tp-ops-fo") < 0 && raw.indexOf("tp-seed-nv") < 0, "friends-only seed/ops posts gone from localStorage");
  var ov = JSON.parse(t.storage.getItem("cognation.seedops.tower.posts.v1"));
  assert.strictEqual(ids(ov.posts), "seedops-tower-seed-0003-1,tp-seed-0", "overlay keeps public seed rows + templates only");
});

/* 7. Reload with a stale store holding a seed friends-only post: hidden signed out. */
check("reload: signed-out list() hides seed/ops friends-only posts, keeps public seed posts + templates", function () {
  var ls = memoryStorage(); ls.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: memberPosts.concat([seedServer, seedFriendsOnly, opsFriendsOnly, seedNoVis, template]) }));
  var t = boot({ signedIn: false, localStorage: ls });
  assert.strictEqual(ids(t.win.CognationTowerStore.list()), "seedops-tower-seed-0003-1,tp-seed-0");
  var t2 = boot({ signedIn: true, localStorage: ls });
  assert.ok(ids(t2.win.CognationTowerStore.list()).indexOf("tp-seed-fo") >= 0, "signed in: unchanged (server already decided who sees it)");
});

/* 8. Normal signed-out load unchanged: 40 public seed server posts + templates all show. */
async.push(["normal signed-out load: all 40 public seed posts kept", function () {
  var t = boot({ signedIn: false, sessionSeed: {} });
  var rows = [];
  for (var i = 0; i < 40; i++) rows.push({ id: "tp-pub-" + i, _remote: true, seeded: true, isSeed: true, seedFleetId: "seed-" + String(i + 1).padStart(4, "0"), authorName: "S" + i, body: "post " + i, createdAt: "2026-10-21T0" + (i % 10) + ":00:00.000Z", rating: "G", visibility: "public" });
  t.win.CognationTowerStore.setRemotePosts(rows.concat([template]));
  assert.strictEqual(t.win.CognationTowerStore.list().length, 41, "40 seed posts + the local template");
  t.signOut();
  assert.strictEqual(t.win.CognationTowerStore.list().length, 41, "sign-out drops none of them");
  /* sign-out re-hydrates (anon read returns public rows): that seed post lands and shows */
  return flush().then(flush).then(function () {
    assert.ok(ids(t.win.CognationTowerStore.list()).indexOf("tp-seed-1") >= 0, "hydrated public seed post shows signed out");
  });
}]);

/* 5. supabase-social forgets the in-memory feed on sign-out. */
check("supabase-social empties its in-memory feed on sign-out", function () {
  var s = src("js/supabase-social.js");
  assert.ok(/addEventListener\("cognation:session-ended", function \(\) \{\s*if \(active\(\)\) return;\s*state\.feed = \[\];/.test(s));
});

var failed = 0;
results.forEach(function (r) {
  try { r[1](); console.log("  pass  " + r[0]); } catch (e) { failed++; console.log("  FAIL  " + r[0] + " :: " + e.message); }
});
async.reduce(function (p, r) {
  return p.then(function () { return r[1](); }).then(function () { console.log("  pass  " + r[0]); }, function (e) { failed++; console.log("  FAIL  " + r[0] + " :: " + e.message); });
}, Promise.resolve()).then(function () {
  if (failed) { console.error(failed + " failed"); process.exit(1); }
  console.log("signout-feed-cache.test.js ok");
});
