/**
 * Session end clears the in-memory Feed store and every cached server post
 * (SeedOps live check: after an in-page sign-out a PG-13 seed post with no
 * server rating stayed in TowerStore.feedPlate behind the login screen, and
 * was still held while the next account's age was pending).
 *
 * Real age-floor-keywords, auto-rate, accounts, seedops-schema,
 * supabase-social, tower.js and seedops-tower-hydrate in one vm window, with a
 * fake read-only Supabase client and a CommuneSwipe age stub.
 * Expect:
 *   1. An adult signs out: the Tower store, feedPlate, newsList, the SeedOps
 *      overlay and supabase-social's in-memory feed hold no server post.
 *   2. A teen switches in from the adult (after sign-out, or straight to a
 *      different user id): while the teen's age is pending nothing above G/PG
 *      is held anywhere; once the age loads the PG-13 posts are read again.
 *   3. None of it writes to the network (reads only, no RPC).
 * Run: node --test js/session-end-feed-store.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function src(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
var TOWER_KEY = "cognation.tower.posts.v3";
var OVERLAY_KEY = "cognation.seedops.tower.posts.v1";

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, _d: d };
}
function flush() {
  var p = Promise.resolve();
  for (var i = 0; i < 12; i++) p = p.then(function () { return new Promise(function (r) { setImmediate(r); }); });
  return p;
}

/* Ids are built here so no account detail sits in the file. */
function account(name, age) {
  return { session: { source: "supabase", supabaseUserId: "u-" + name, username: name, activeProfileId: "p-" + name }, age: age };
}
var ADULT = account("adult", 30);
var TEEN = account("teen", 15);

var SEED_AUTHOR = { id: "p-seed-1", user_id: "u-seed-1", kind: "personal", handle: "jess", display_name: "Jess", bio: "", account_kind: "seed", seed_fleet_id: "seed-0001" };
var MEMBER_AUTHOR = { id: "p-adult", user_id: "u-adult", kind: "personal", handle: "adultname", display_name: "Adult", bio: "", account_kind: "personal" };
function row(id, author, rating, visibility, body) {
  return { id: id, author_profile_id: author.id, author: author, body: body, visibility: visibility, attachments: [], created_at: "2026-10-28T12:00:00.000Z", rating: rating, reactions: [] };
}
/* tp-seed-nr: public seed post with no server rating (reads PG-13, like the live 05a484aa). */
var ROWS = [
  row("tp-seed-nr", SEED_AUTHOR, null, "public", "Late night drive."),
  row("tp-seed-g", SEED_AUTHOR, "G", "public", "Morning walk by the river."),
  row("tp-seed-pg13", SEED_AUTHOR, "PG-13", "public", "Scary movie night."),
  row("tp-adult-r", MEMBER_AUTHOR, "R", "friends", "Adult only note."),
  row("tp-adult-pg", MEMBER_AUTHOR, "PG", "friends", "Dinner Friday."),
];

function boot() {
  var listeners = {};
  var calls = [];
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var storage = memoryStorage();
  var session = memoryStorage();
  var age = { value: null, pending: false };
  var win = {
    document: doc, localStorage: storage, sessionStorage: session, location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return win.__session || null; } },
    CognationCommuneSwipe: {
      viewerAgePending: function () { return !!win.__session && age.pending; },
      getDatingBirthAge: function () { return win.__session && !age.pending ? age.value : null; },
    },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, o) {
        o = o || {};
        calls.push({ kind: "rest", table: table, method: String(o.method || "GET").toUpperCase(), body: o.body });
        if (table === "profiles") {
          var own = /user_id=eq\.([^&]+)/.exec(String(o.query || ""));
          if (own) return Promise.resolve(own[1] === MEMBER_AUTHOR.user_id ? [MEMBER_AUTHOR] : []);
          return Promise.resolve([SEED_AUTHOR, MEMBER_AUTHOR]);
        }
        if (table === "tower_posts") return Promise.resolve(JSON.parse(JSON.stringify(ROWS)));
        return Promise.resolve([]);
      },
      rpc: function (name) { calls.push({ kind: "rpc", name: name }); return Promise.resolve([]); },
    },
    fetch: function (url, init) { calls.push({ kind: "fetch", method: String((init && init.method) || "GET").toUpperCase() }); return Promise.resolve({ ok: true, json: function () { return Promise.resolve([]); } }); },
  };
  win.__session = null;
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: session, location: win.location, fetch: win.fetch,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise, Date: Date, JSON: JSON, Math: Math,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/accounts.js", "js/seedops-schema.js", "js/supabase-social.js", "js/tower.js", "js/seedops-tower-hydrate.js"]
    .forEach(function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); });
  function fire(name) { doc.dispatchEvent(new win.CustomEvent(name)); }
  return {
    win: win, storage: storage, calls: calls, age: age, fire: fire,
    signIn: function (acct, pending) {
      win.__session = acct.session;
      age.value = acct.age; age.pending = !!pending;
      fire("cognation:session-started");
      if (!pending) fire("cognation:viewer-age-changed");
    },
    birthLoaded: function () { age.pending = false; fire("cognation:viewer-age-changed"); },
    signOut: function () { win.__session = null; age.value = null; age.pending = false; fire("cognation:session-ended"); },
  };
}

function parsed(t, key) { try { return JSON.parse(t.storage.getItem(key) || "null"); } catch (e) { return null; } }
function storePosts(t) { var d = parsed(t, TOWER_KEY); return (d && d.posts) || []; }
function overlayPosts(t) { var d = parsed(t, OVERLAY_KEY); return (d && d.posts) || []; }
function socialFeed(t) { var s = t.win.CognationSupabaseSocial; return s && typeof s.feedSnapshot === "function" ? s.feedSnapshot() : null; }
function remoteOnly(list) { return (list || []).filter(function (p) { return p && p._remote; }); }
function ids(list) { return (list || []).map(function (p) { return p.id; }).sort().join(","); }
/* Rating as tower.js reads it: server rating, a missing one reads PG-13. */
function ratingOf(p) { return p.rating || (p._remote ? "PG-13" : "G"); }
function aboveGPG(list) { return (list || []).filter(function (p) { return p && p._remote && ["G", "PG"].indexOf(ratingOf(p)) < 0; }); }
/* Every place a server post copy is held. */
function everyHeld(t) {
  var store = t.win.CognationTowerStore;
  return {
    towerStore: storePosts(t),
    feedPlate: store.feedPlate(),
    newsList: store.newsList(),
    overlay: overlayPosts(t),
    socialFeed: socialFeed(t) || [],
  };
}

function adultLoaded() {
  var t = boot();
  t.signIn(ADULT, false);
  return flush().then(function () {
    var held = storePosts(t);
    assert.ok(ids(held).indexOf("tp-seed-nr") >= 0 && ids(held).indexOf("tp-adult-r") >= 0, "adult: server Feed loaded (" + ids(held) + ")");
    var mem = socialFeed(t);
    if (mem) assert.ok(mem.length >= 5, "adult: in-memory feed loaded");
    return t;
  });
}

test("1. after an adult signs out, the feed store and every remote cache are empty", function () {
  return adultLoaded().then(function (t) {
    t.signOut();
    var held = everyHeld(t);
    Object.keys(held).forEach(function (where) {
      assert.deepStrictEqual(ids(remoteOnly(held[where])), "", where + " still holds server posts: " + ids(remoteOnly(held[where])));
    });
    assert.ok(socialFeed(t), "supabase-social exposes its in-memory feed (read-only)");
    assert.strictEqual(socialFeed(t).length, 0, "supabase-social in-memory feed empty");
    assert.strictEqual(t.win.CognationTowerStore.list().length, 0, "Tower list empty");
    assert.ok(t.win.CognationTowerStore.feedPlate().every(function (p) { return !p._remote; }), "feedPlate holds no server post");
    assert.ok(String(t.storage.getItem(TOWER_KEY) || "").indexOf("tp-seed-nr") < 0, "unrated PG-13 seed post gone from the store");
    /* The signed-out SeedOps hydrate then reads public seed posts again: G/PG only. */
    return flush().then(function () {
      var after = everyHeld(t);
      Object.keys(after).forEach(function (where) {
        assert.strictEqual(ids(aboveGPG(after[where])), "", "signed out, " + where + " holds above G/PG: " + ids(aboveGPG(after[where])));
      });
      assert.ok(ids(storePosts(t)).indexOf("tp-seed-g") >= 0, "the signed-out G seed post comes back (signed-out sample Feed kept)");
    });
  });
});

test("2a. teen signs in after the adult signs out: nothing above G/PG held while the age is pending; PG-13 returns when it loads", function () {
  return adultLoaded().then(function (t) {
    t.signOut();
    return flush().then(function () {
      t.signIn(TEEN, true);
      var now = everyHeld(t);
      Object.keys(now).forEach(function (where) {
        assert.strictEqual(ids(aboveGPG(now[where])), "", "switch-in, " + where + " holds above G/PG: " + ids(aboveGPG(now[where])));
      });
      return flush();
    }).then(function () {
      assert.ok(t.age.pending, "still pending");
      var pending = everyHeld(t);
      Object.keys(pending).forEach(function (where) {
        assert.strictEqual(ids(aboveGPG(pending[where])), "", "pending window, " + where + " holds above G/PG: " + ids(aboveGPG(pending[where])));
      });
      assert.ok(ids(storePosts(t)).indexOf("tp-seed-g") >= 0, "G posts still load while pending");
      t.birthLoaded();
      return flush();
    }).then(function () {
      assert.ok(ids(storePosts(t)).indexOf("tp-seed-pg13") >= 0, "age loaded (15): PG-13 posts read again (" + ids(storePosts(t)) + ")");
    });
  });
});

test("2b. straight switch to a different user id (no sign-out event): the adult's posts go, pending holds G/PG only", function () {
  return adultLoaded().then(function (t) {
    t.signIn(TEEN, true);
    assert.strictEqual(ids(remoteOnly(storePosts(t))), "", "switch: the adult's server posts are gone before the teen's load");
    assert.ok(socialFeed(t) && socialFeed(t).length === 0, "switch: in-memory feed emptied");
    var now = everyHeld(t);
    Object.keys(now).forEach(function (where) {
      assert.strictEqual(ids(aboveGPG(now[where])), "", "switch, " + where + " holds above G/PG: " + ids(aboveGPG(now[where])));
    });
    return flush().then(function () {
      var pending = everyHeld(t);
      Object.keys(pending).forEach(function (where) {
        assert.strictEqual(ids(aboveGPG(pending[where])), "", "pending, " + where + " holds above G/PG: " + ids(aboveGPG(pending[where])));
      });
    });
  });
});

test("2c. same account signing in again keeps its Feed (no clear)", function () {
  return adultLoaded().then(function (t) {
    t.fire("cognation:auth-changed");
    assert.ok(ids(storePosts(t)).indexOf("tp-adult-r") >= 0, "same user: Feed kept");
  });
});

test("3. sign-out and account switch make no network writes", function () {
  return adultLoaded().then(function (t) {
    t.signOut();
    return flush().then(function () {
      t.signIn(TEEN, true);
      return flush();
    }).then(function () {
      t.birthLoaded();
      return flush();
    }).then(function () {
      var writes = t.calls.filter(function (c) {
        return c.kind === "rpc" || (c.kind !== "rpc" && (c.method !== "GET" || c.body != null));
      });
      assert.deepStrictEqual(writes, [], "network writes: " + JSON.stringify(writes));
      assert.ok(t.calls.length > 0, "reads happened");
    });
  });
});
