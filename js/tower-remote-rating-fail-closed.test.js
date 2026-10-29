/**
 * Server (remote) Tower posts used to skip the client rating check (the server
 * gates by rating). But sign-out keeps cached public seed/ops posts, so a post
 * fetched in an adult session stayed on the device for the next viewer, and the
 * server shows PG-13 to unknown ages. Now every server post the viewer did not
 * write must also pass the client rating check (G/PG for signed-out, pending and
 * no-birth-row viewers); NR, unknown and missing-turned-PG-13 ratings fail
 * closed; authors still see their own posts; unknown photo ratings are hidden.
 * Real age-floor-keywords.js, auto-rate.js and tower.js in one vm.
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
function src(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
var TOWER_KEY = "cognation.tower.posts.v3";
var PNG = "data:image/png;base64,iVBORw0KGgo=";

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}

function boot() {
  var calls = [];
  var state = { session: null, pending: false, birth: 0, mine: [] };
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {}, toggle: function () {} } },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { setAttribute: function () {}, appendChild: function () {}, style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} } }; },
  };
  var storage = memoryStorage();
  function record(kind) { return function () { calls.push({ kind: kind, args: Array.prototype.slice.call(arguments) }); return Promise.resolve([]); }; }
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", search: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return state.session; } },
    CognationSupabase: { configured: function () { return true; }, rpc: record("rpc"), rest: record("rest") },
    CognationSupabaseSocial: {
      active: function () { return !!state.session; },
      getMyProfiles: function () { return state.mine; },
    },
    CognationCommuneSwipe: {
      viewerAgePending: function () { return state.pending; },
      getDatingBirthAge: function () { return state.birth; },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise, Date: Date, JSON: JSON, Math: Math,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: record("fetch"),
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/tower.js"].forEach(function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); });
  var Tower = win.CognationTowerStore;
  return {
    calls: calls,
    signIn: function (userId, profileId, birth, pending) {
      state.session = { source: "supabase", supabaseUserId: userId, activeProfileId: profileId };
      state.mine = [{ id: profileId, kind: "personal", handle: profileId }];
      state.birth = birth || 0; state.pending = !!pending;
    },
    signOut: function () { state.session = null; state.mine = []; state.birth = 0; state.pending = false; Tower.clearMemberCache(); },
    cache: function (posts) { storage.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: posts })); },
    tower: function () { return Tower.list().filter(win.CognationTowerPostVisibleToViewer).map(function (p) { return p.id; }).sort(); },
    news: function () { return Tower.newsList().filter(function (p) { return p._remote; }).map(function (p) { return p.id; }).sort(); },
    photos: win.CognationFeedPhotos,
  };
}

function seedPost(id, rating, extra) {
  /* What supabase-social mapPost writes for a public seed post. */
  return Object.assign({ id: id, _remote: true, authorProfileId: "p-seed-15", authorName: "Rowan", handle: "rowan", accountKind: "seed", isSeed: true,
    seedFleetId: "seed-0015", body: "Band practice after school today.", createdAt: "2026-10-29T14:00:00.000Z", attachments: [], likes: 0, reactions: {},
    visibility: "public", rating: rating }, extra || {});
}
var CACHED = [seedPost("g", "G"), seedPost("pg13", "PG-13"), seedPost("r", "R"), seedPost("ma", "MA"), seedPost("nr", "NR"), seedPost("unknown", "X")];

test("R, MA, NR and unknown public seed posts cached in an adult session are not shown after sign-out", function () {
  var w = boot();
  w.signIn("u-adult", "p-adult", 30);
  w.cache(CACHED);
  assert.deepEqual(w.tower(), ["g", "pg13", "r"], "fixture: the adult sees G, PG-13 and R (MA needs the server opt-in)");
  w.signOut();
  assert.deepEqual(w.tower(), ["g"], "signed-out viewer: Tower shows G/PG only");
  assert.deepEqual(w.news(), ["g"], "signed-out viewer: News shows G/PG only");
  w.signIn("u-pending", "p-pending", 0, true);
  assert.deepEqual(w.tower(), ["g"], "pending-age viewer: Tower shows G/PG only");
  assert.deepEqual(w.news(), ["g"], "pending-age viewer: News shows G/PG only");
  w.signIn("u-nobirth", "p-nobirth", 0, false);
  assert.deepEqual(w.tower(), ["g"], "signed in, no user_birth row: Tower shows G/PG only");
  assert.deepEqual(w.news(), ["g"], "signed in, no user_birth row: News shows G/PG only");
  w.signIn("u-13", "p-13", 13, false);
  assert.deepEqual(w.tower(), ["g", "pg13"], "13-year-old: no R, MA, NR or unknown");
  assert.deepEqual(w.news(), ["g", "pg13"], "13-year-old News: no R, MA, NR or unknown");
});

test("a PG-13 server post is hidden from a signed-out viewer and shown to a 13-year-old with a birth row", function () {
  var w = boot();
  w.cache([seedPost("pg13", "PG-13")]);
  assert.deepEqual(w.tower(), [], "signed out: the server may allow PG-13 (unknown age = 13), the client does not");
  assert.deepEqual(w.news(), []);
  w.signIn("u-13", "p-13", 13, false);
  assert.deepEqual(w.tower(), ["pg13"]);
  assert.deepEqual(w.news(), ["pg13"]);
});

test("a server post with no rating reads PG-13: never G/PG, so hidden from a signed-out viewer", function () {
  var w = boot();
  var unrated = seedPost("unrated", undefined);
  delete unrated.rating;
  w.cache([unrated, seedPost("nr", "NR")]);
  assert.deepEqual(w.tower(), []);
  w.signIn("u-adult", "p-adult", 30);
  assert.deepEqual(w.tower(), ["unrated"], "adult sees the PG-13 fallback; NR stays hidden");
});

test("the author still sees their own NR post; another adult does not", function () {
  var w = boot();
  var own = seedPost("own-nr", "NR", { authorProfileId: "p-seed-15" });
  w.signIn("u-seed-15", "p-seed-15", 16);
  w.cache([own]);
  assert.deepEqual(w.tower(), ["own-nr"], "author sees own NR post in Tower");
  assert.deepEqual(w.news(), ["own-nr"], "author sees own NR post in News");
  w.signIn("u-adult", "p-adult", 30);
  assert.deepEqual(w.tower(), [], "another adult: NR hidden");
  assert.deepEqual(w.news(), []);
});

test("an unknown photo rating is hidden, known ratings unchanged", function () {
  var w = boot();
  w.signIn("u-adult", "p-adult", 30);
  function shown(a) { return w.photos.html([Object.assign({ kind: "photo", dataUrl: PNG }, a)]).indexOf("<img") >= 0; }
  assert.equal(shown({ rating: "X" }), false, "unknown rating string: hidden even from an adult");
  assert.equal(shown({ rating: "unrated" }), false);
  assert.equal(w.photos.minAge({ rating: "X" }) >= 999, true);
  assert.equal(shown({ rating: "PG" }), true, "PG photo still shown");
  assert.equal(shown({ rating: "R" }), true, "R photo still shown to an adult");
  assert.equal(shown({}), true, "no rating: unchanged (open to whoever sees the post)");
  assert.equal(w.photos.minAge({ rating: "13+" }), 13, "13+ reads as 13");
});

test("no network writes", function () {
  var w = boot();
  w.signIn("u-adult", "p-adult", 30);
  w.cache(CACHED);
  w.tower(); w.news(); w.signOut(); w.tower(); w.news();
  var writes = w.calls.filter(function (c) {
    if (c.kind === "fetch") return true;
    var o = c.args[1] || {};
    return c.kind === "rpc" || (o.method && String(o.method).toUpperCase() !== "GET");
  });
  assert.deepEqual(writes, []);
});
