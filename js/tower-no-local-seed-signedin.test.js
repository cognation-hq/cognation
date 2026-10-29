/**
 * Local SeedOps template posts (seedops-tower-posts buildPost, written by
 * seedops-tower-hydrate fillEmptyShells into cognation.tower.posts.v3 while signed
 * out) never reach a SIGNED-IN feed: TOWER Feed and the Times both read
 * TowerStore.list()/newsList(). Signed-out fill is unchanged.
 * Real tower.js, accounts.js, auto-rate.js, seedops-schema.js,
 * seedops-tower-posts.js and seedops-tower-hydrate.js in a vm.
 * Run: node js/tower-no-local-seed-signedin.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var TOWER_KEY = "cognation.tower.posts.v3";

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function boot() {
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var storage = memoryStorage();
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return win.__session || null; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, Promise: Promise,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, /* boot timers stay off; the test drives hydrate */
  });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js",
    "js/seedops-tower-posts.js", "js/seedops-tower-hydrate.js"].forEach(function (rel) { vm.runInContext(src(rel), ctx, { filename: rel }); });
  return { win: win, storage: storage };
}
function isTemplate(p) { return !!(p && (p.seedopsTower || /^seedops-tower-seed-/.test(String(p.id || "")))); }
function signedOutFill(win) {
  var ok = 0;
  for (var n = 1; n <= 40; n++) {
    var r = win.CognationSeedOpsTowerPosts.postOne("seed-" + ("000" + n).slice(-4), { news: false });
    if (r && r.ok) ok++;
  }
  return ok;
}
function signIn(win) {
  win.__session = { source: "supabase", supabaseUserId: "user-real-1", activeProfileId: "srv-real-1", username: "dana" };
  win.CognationSupabaseSocial = { active: function () { return true; } };
  win.CognationSupabase = {
    configured: function () { return true; },
    rest: function (table) {
      if (table === "profiles") {
        return Promise.resolve([{ id: "srv-seed-1", user_id: "u-seed-1", kind: "personal", handle: "sasha-0001", display_name: "Sasha", bio: "", account_kind: "seed", seed_fleet_id: "seed-0001" }]);
      }
      if (table === "tower_posts") {
        /* rated G: this viewer's age is not known here (no user_birth), so the store holds G/PG server posts only */
        return Promise.resolve([{ id: "srv-post-1", author_profile_id: "srv-seed-1", body: "Server seed post from Sasha.", visibility: "public", attachments: [], created_at: "2026-10-20T20:00:00.000Z", rating: "G",
          author: { id: "srv-seed-1", user_id: "u-seed-1", kind: "personal", handle: "sasha-0001", display_name: "Sasha", account_kind: "seed", seed_fleet_id: "seed-0001" } }]);
      }
      return Promise.resolve([]);
    },
  };
}

var checks = [];

/* 1. Signed out: the 40-post fill still lands in the local store and shows (unchanged). */
(function () {
  var b = boot();
  assert.strictEqual(signedOutFill(b.win), 40, "signed-out fill writes 40 posts");
  var list = b.win.CognationTowerStore.list();
  assert.strictEqual(list.filter(isTemplate).length, 40, "signed out: TOWER Feed list still has the 40 template posts");
  assert.ok(JSON.parse(b.storage.getItem(TOWER_KEY)).posts.filter(isTemplate).length === 40, "signed out: local store kept (nothing deleted)");
})();

/* 2. The leak: signed-out fill, then sign in; SeedOps hydrate merges the store into the signed-in feed. */
checks.push((function () {
  var b = boot();
  var w = b.win;
  signedOutFill(w);
  /* The signed-in member's own real local data in the same store. */
  var stored = JSON.parse(b.storage.getItem(TOWER_KEY));
  stored.posts.push({ id: "t-own-1", authorName: "Dana", authorProfileId: "srv-real-1", body: "My own note.", createdAt: "2026-10-20T19:00:00.000Z", rating: "G", likes: 3 });
  b.storage.setItem(TOWER_KEY, JSON.stringify(stored));
  signIn(w);
  return w.CognationSeedOpsTowerHydrate.hydrate({ force: true }).then(function () {
    var data = JSON.parse(b.storage.getItem(TOWER_KEY));
    assert.ok(data.remote, "hydrate wrote the signed-in (remote) feed");
    var list = w.CognationTowerStore.list();
    var ids = list.map(function (p) { return p.id; });
    assert.ok(ids.indexOf("srv-post-1") !== -1, "signed in: the real server seed post is in the feed");
    assert.strictEqual(list.filter(isTemplate).length, 0, "signed in: no local template seed posts in the TOWER Feed (" + list.filter(isTemplate).length + " leaked)");
    assert.strictEqual(w.CognationTowerStore.newsList().filter(isTemplate).length, 0, "signed in: no local template seed posts in the Times");
    assert.ok(ids.indexOf("t-own-1") !== -1, "signed in: the member's own local post still carries over");
    assert.strictEqual(data.posts.filter(isTemplate).length, 0, "signed-in store holds no template posts");
  });
})());

/* 2b. Signed out, hydrate also merges (when seeds have server posts): templates stay for signed-out visitors. */
checks.push((function () {
  var b = boot();
  var w = b.win;
  signedOutFill(w);
  signIn(w);
  delete w.CognationSupabaseSocial; w.__session = null; /* Supabase configured, nobody signed in */
  return w.CognationSeedOpsTowerHydrate.hydrate({ force: true }).then(function () {
    var list = w.CognationTowerStore.list();
    assert.ok(list.some(function (p) { return p.id === "srv-post-1"; }), "signed out: server seed post merged as before");
    assert.strictEqual(list.filter(isTemplate).length, 40, "signed out: all 40 template posts still show");
    assert.ok(JSON.parse(b.storage.getItem(TOWER_KEY)).posts.filter(isTemplate).length === 40, "signed out: template posts not deleted from storage");
  });
})());

/* 3. Any caller of setRemotePosts (supabase-social, SeedOps) cannot carry them in. */
(function () {
  var b = boot();
  var w = b.win;
  signIn(w);
  var tpl = w.CognationSeedOpsTowerPosts.buildPost("seed-0002", {});
  assert.ok(tpl && tpl.seedopsTower && !tpl._remote, "buildPost marks templates");
  w.CognationTowerStore.setRemotePosts([tpl, { id: "srv-post-2", _remote: true, authorName: "Lee", body: "Real.", createdAt: "2026-10-20T18:00:00.000Z", rating: "G" },
    { id: "srv-post-3", _remote: true, seedopsTower: true, isSeed: true, authorName: "Sasha", body: "Server copy.", createdAt: "2026-10-20T17:00:00.000Z", rating: "G" }]);
  var ids = w.CognationTowerStore.list().map(function (p) { return p.id; }).join(",");
  assert.strictEqual(ids, "srv-post-2,srv-post-3", "setRemotePosts drops local templates, keeps server posts (even seed ones)");
})();

/* 4. A signed-in store that already holds leaked copies (written before this fix) reads clean. */
(function () {
  var b = boot();
  var w = b.win;
  var tpl = w.CognationSeedOpsTowerPosts.buildPost("seed-0003", {});
  b.storage.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: [tpl, { id: "srv-post-4", _remote: true, authorName: "Lee", body: "Real.", createdAt: "2026-10-20T18:00:00.000Z", rating: "G" }] }));
  signIn(w);
  assert.strictEqual(w.CognationTowerStore.list().map(function (p) { return p.id; }).join(","), "srv-post-4", "already-leaked template hidden from the signed-in feed");
})();

/* 5. Signed out again in a browser whose store is still marked remote: the fill shows as before. */
(function () {
  var b = boot();
  var w = b.win;
  b.storage.setItem(TOWER_KEY, JSON.stringify({ version: 2, remote: true, posts: [] }));
  assert.strictEqual(signedOutFill(w), 40, "signed-out fill into a remote-marked store");
  assert.strictEqual(w.CognationTowerStore.list().filter(isTemplate).length, 40, "signed out: the 40 still show (no signed-out change)");
})();

Promise.all(checks).then(function () {
  console.log("tower-no-local-seed-signedin.test.js ok");
}, function (err) {
  console.error(err);
  process.exit(1);
});
