/**
 * Seed Tower hydrate keeps the server rating (tower_posts.rating).
 *
 * The hydrate selects rating and maps it like supabase-social
 * (row.rating || "PG-13"). Its merge into CognationTowerStore never lets a
 * copy without a server rating replace a rated one, in either load order.
 * Without this, tower.js postRating fell back to the client AutoRate guess (G).
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var code = fs.readFileSync(path.join(__dirname, "seedops-tower-hydrate.js"), "utf8");
var OVERLAY = "cognation.seedops.tower.posts.v1";

function memStorage() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
  };
}

/* server.posts: rows as stored; server.migrated: the rating column exists.
   Like PostgREST, a row carries rating only when the select asks for it, and
   asking for it before the migration is a missing-column error. */
function world() {
  var server = { migrated: true, posts: [] };
  var store = { data: null, setCalls: 0 };
  var records = {};
  var win = {
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, opts) {
        var q = String((opts && opts.query) || "");
        if (table === "profiles") {
          return Promise.resolve([
            { id: "srv-1", user_id: "u-1", handle: "ada", display_name: "Ada", bio: "", account_kind: "seed", seed_fleet_id: "seed-0001", kind: "personal" },
          ]);
        }
        if (table === "tower_posts") {
          var wantsRating = /[,=]rating(,|&|$)/.test(q);
          if (wantsRating && !server.migrated) {
            return Promise.reject({ code: "42703", message: "column tower_posts.rating does not exist" });
          }
          return Promise.resolve(server.posts.map(function (p) {
            var row = {
              id: p.id, author_profile_id: "srv-1", body: p.body || "hello", visibility: "public",
              attachments: [], created_at: p.created_at || "2026-10-28T12:00:00Z",
              author: { id: "srv-1", user_id: "u-1", kind: "personal", handle: "ada", display_name: "Ada", account_kind: "seed", seed_fleet_id: "seed-0001" },
            };
            if (wantsRating) row.rating = p.rating == null ? null : p.rating;
            return row;
          }));
        }
        return Promise.resolve([]);
      },
    },
    CognationSeedOps: {
      getByFleetId: function (fleet) { return { id: "local-" + fleet, displayName: "Ada" }; },
    },
    CognationAccounts: {
      getProfileById: function (id) { return records[id] ? JSON.parse(JSON.stringify(records[id])) : null; },
      saveProfileRecord: function (rec) { records[rec.id] = JSON.parse(JSON.stringify(rec)); },
    },
    CognationTowerStore: {
      load: function () { return store.data ? JSON.parse(JSON.stringify(store.data)) : null; },
      setRemotePosts: function (posts) {
        store.setCalls += 1;
        store.data = { version: 2, remote: true, posts: JSON.parse(JSON.stringify(posts)) };
        return store.data.posts;
      },
    },
    addEventListener: function () {},
  };
  var ls = memStorage();
  var ctx = vm.createContext({
    window: win,
    document: { readyState: "loading", addEventListener: function () {}, dispatchEvent: function () {} },
    localStorage: ls,
    sessionStorage: memStorage(),
    CustomEvent: function () {},
    console: console,
    setTimeout: setTimeout,
  });
  vm.runInContext(code, ctx);
  var api = win.CognationSeedOpsTowerHydrate;
  return {
    server: server,
    store: store,
    hydrate: function () { return api.hydrate({ force: true, fillEmpty: false }); },
    /* What supabase-social.replaceTowerFeed writes: its mapPost sets
       rating: row.rating || "PG-13". */
    socialFeed: function (posts) { win.CognationTowerStore.setRemotePosts(posts); },
    stored: function (id) {
      var d = store.data;
      return (d && d.posts || []).filter(function (p) { return p && p.id === id; })[0] || null;
    },
    overlay: function (id) {
      var doc = JSON.parse(ls.getItem(OVERLAY) || "{\"posts\":[]}");
      return doc.posts.filter(function (p) { return p && p.id === id; })[0] || null;
    },
  };
}

function rated(id, rating) {
  return { id: id, _remote: true, isSeed: true, seedFleetId: "seed-0001", body: "hello", visibility: "public", createdAt: "2026-10-28T12:00:00Z", rating: rating };
}

test("tower hydrate: posts keep the server PG-13 or R after hydrate", async function () {
  var w = world();
  w.server.posts = [{ id: "p-r", rating: "R" }, { id: "p-pg13", rating: "PG-13" }, { id: "p-null", rating: null }];
  var out = await w.hydrate();
  assert.equal(out.posts, 3);
  assert.equal(w.stored("p-r").rating, "R");
  assert.equal(w.stored("p-pg13").rating, "PG-13");
  assert.equal(w.stored("p-null").rating, "PG-13", "no server value maps to PG-13, as supabase-social does");
  assert.equal(w.overlay("p-r").rating, "R", "overlay copy carries the rating too");
});

test("tower hydrate: a rated store copy is kept when an unrated copy arrives later", async function () {
  var w = world();
  /* supabase-social's rated copy lands first. */
  w.socialFeed([rated("p-1", "R")]);
  /* Then hydrate loads the same post without a server rating (before the migration). */
  w.server.migrated = false;
  w.server.posts = [{ id: "p-1" }];
  var out = await w.hydrate();
  assert.equal(out.posts, 1, "hydrate still loads posts before the migration");
  assert.equal(w.stored("p-1").rating, "R", "unrated copy must not replace the rated one");
});

test("tower hydrate: an unrated copy first, then the rated copy, ends rated (and stays rated)", async function () {
  var w = world();
  w.server.migrated = false;
  w.server.posts = [{ id: "p-2" }];
  await w.hydrate();
  /* The rated copy arrives next: from hydrate once the column exists... */
  w.server.migrated = true;
  w.server.posts = [{ id: "p-2", rating: "R" }];
  await w.hydrate();
  assert.equal(w.stored("p-2").rating, "R", "rated hydrate copy replaces the unrated one");
  assert.equal(w.overlay("p-2").rating, "R", "overlay copy updated to the server rating");
  /* ...and an unrated copy after that still cannot undo it. */
  w.server.migrated = false;
  w.server.posts = [{ id: "p-2" }];
  await w.hydrate();
  assert.equal(w.stored("p-2").rating, "R");
  assert.equal(w.overlay("p-2").rating, "R");
});

test("tower hydrate: a server rating still wins over an older rated copy", async function () {
  var w = world();
  w.socialFeed([rated("p-3", "R")]);
  w.server.posts = [{ id: "p-3", rating: "PG-13" }];
  await w.hydrate();
  assert.equal(w.stored("p-3").rating, "PG-13", "server re-rate is taken");
});
