/**
 * Tower post reactions survive a remote reload.
 * Run: node js/tower-post-reactions.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");

function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}

function loadSocial(rest) {
  var saved = null;
  var saves = 0;
  var documentStub = {
    readyState: "complete",
    addEventListener: function () {},
    dispatchEvent: function () { return true; },
  };
  var session = {
    source: "supabase",
    supabaseUserId: "user-1",
    activeProfileId: "profile-1",
    username: "alex",
  };
  var windowStub = {
    document: documentStub,
    localStorage: mem(),
    addEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    CognationAuth: {
      getSession: function () { return session; },
      whenReady: { then: function () {} },
    },
    CognationSupabase: {
      configured: function () { return true; },
      rest: rest,
    },
    CognationTowerStore: {
      setRemotePosts: function (posts) {
        saves += 1;
        saved = posts;
        return posts;
      },
    },
  };
  windowStub.window = windowStub;
  vm.runInNewContext(src("js/supabase-social.js"), {
    window: windowStub,
    document: documentStub,
    localStorage: windowStub.localStorage,
    location: { hash: "" },
    console: console,
    CustomEvent: windowStub.CustomEvent,
    Promise: Promise,
    encodeURIComponent: encodeURIComponent,
  });
  return {
    api: windowStub.CognationSupabaseSocial,
    saved: function () { return saved; },
    saves: function () { return saves; },
  };
}

var remotePost = {
  id: "post-1",
  author_profile_id: "author-9",
  body: "hello from tower",
  visibility: "public",
  attachments: [],
  created_at: "2026-10-04T15:00:00.000Z",
  author: {
    id: "author-9",
    user_id: "user-9",
    kind: "personal",
    handle: "sam",
    display_name: "Sam",
    bio: "",
  },
  reactions: [
    { face: "❤️", profile_id: "profile-2" },
    { face: "🔥", profile_id: "profile-1" },
  ],
};

var calls = [];
var failWrite = false;
function rest(table, options) {
  options = options || {};
  calls.push({ table: table, method: options.method || "GET", options: options });
  if (table === "tower_post_reactions" && failWrite) {
    return Promise.reject(new Error("write failed"));
  }
  if (table === "tower_post_reactions") return Promise.resolve([]);
  if (table === "tower_posts") return Promise.resolve([remotePost]);
  return Promise.resolve([]);
}

var social = loadSocial(rest);
var sql = src("supabase/migrations/20261004_tower_post_reactions.sql");
assert.ok(sql.indexOf("create table public.tower_post_reactions") !== -1, "migration creates the table");
assert.ok(sql.indexOf("tower_posts.visibility = 'public'") !== -1, "read follows post visibility");

social.api.refreshFeed().then(function (posts) {
  assert.strictEqual(posts.length, 1);
  assert.ok(posts[0].reactions && posts[0].reactions["❤️"], "remote reactions are not dropped");
  assert.strictEqual(JSON.stringify(posts[0].reactions["❤️"]), JSON.stringify(["profile-2"]));
  assert.strictEqual(JSON.stringify(posts[0].reactions["🔥"]), JSON.stringify(["profile-1"]));
  assert.ok(Object.keys(posts[0].reactions).length > 0, "mapped reaction list is not empty");
  var feedCall = calls.filter(function (c) { return c.table === "tower_posts"; })[0];
  assert.ok(feedCall.options.query.indexOf("tower_post_reactions") !== -1, "feed selects reaction rows");
  var before = social.saves();
  failWrite = true;
  return social.api.togglePostReaction("post-1", "👍");
}).then(function (failed) {
  assert.strictEqual(failed.ok, false, "failed write reports failure");
  assert.ok(!social.saved()[0].reactions["👍"], "failed write does not look saved");
  assert.strictEqual(social.saves(), 1, "failed write does not refresh the cache");
  failWrite = false;
  return social.api.togglePostReaction("post-1", "👍");
}).then(function (added) {
  assert.strictEqual(added.ok, true);
  var write = calls.filter(function (c) {
    return c.table === "tower_post_reactions" && c.method === "POST";
  }).pop();
  assert.ok(write, "toggle inserts a reaction row");
  assert.strictEqual(write.options.body.profile_id, "profile-1", "actor is the profile id");
  assert.notStrictEqual(write.options.body.profile_id, "alex");
  assert.strictEqual(JSON.stringify(social.saved()[0].reactions["👍"]), JSON.stringify(["profile-1"]));
  return social.api.togglePostReaction("post-1", "👍");
}).then(function (removed) {
  assert.strictEqual(removed.ok, true);
  var del = calls.filter(function (c) {
    return c.table === "tower_post_reactions" && c.method === "DELETE";
  }).pop();
  assert.ok(del, "second toggle deletes the reaction row");
  assert.ok(del.options.query.indexOf("profile_id=eq.profile-1") !== -1);
  assert.ok(!social.saved()[0].reactions["👍"], "removed face is gone in memory");
  return localMode();
}).then(function () {
  console.log("tower-post-reactions.test.js: ok");
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});

function bootTower(storage, socialApi) {
  var documentStub = {
    readyState: "loading",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () {
      return { style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } };
    },
  };
  var windowStub = {
    document: documentStub,
    localStorage: storage,
    sessionStorage: mem(),
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationSupabaseSocial: socialApi,
  };
  windowStub.window = windowStub;
  vm.runInContext(src("js/tower.js"), vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: storage,
    sessionStorage: windowStub.sessionStorage,
    location: windowStub.location,
    console: console,
    CustomEvent: windowStub.CustomEvent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    JSON: JSON,
    Promise: Promise,
  }));
  return windowStub;
}

function localMode() {
  var storage = mem();
  storage.setItem("cognation.session.v2", JSON.stringify({ username: "alex", activeProfileId: "profile-1" }));
  storage.setItem("cognation.tower.posts.v3", JSON.stringify({
    version: 1,
    posts: [{ id: "local-1", body: "note", createdAt: "2026-10-01T00:00:00.000Z", likes: 0, reactions: {} }],
  }));
  var remoteCalls = [];
  var win = bootTower(storage, {
    active: function () { return false; },
    togglePostReaction: function () {
      remoteCalls.push("nope");
      return Promise.resolve({ ok: true });
    },
  });
  var local = win.CognationTowerStore.toggleReaction("local-1", "❤️");
  assert.strictEqual(local.ok, true, "local demo still saves");
  assert.strictEqual(remoteCalls.length, 0, "local demo does not write remotely");
  assert.strictEqual(JSON.stringify(local.post.reactions["❤️"]), JSON.stringify(["alex"]));
  var stored = JSON.parse(storage.getItem("cognation.tower.posts.v3"));
  assert.strictEqual(JSON.stringify(stored.posts[0].reactions["❤️"]), JSON.stringify(["alex"]), "local save still uses the store");

  var remoteStorage = mem();
  remoteStorage.setItem("cognation.session.v2", JSON.stringify({
    source: "supabase", username: "alex", activeProfileId: "profile-1",
  }));
  remoteStorage.setItem("cognation.tower.posts.v3", JSON.stringify({
    version: 2,
    remote: true,
    posts: [{ id: "post-1", body: "remote", createdAt: "2026-10-04T15:00:00.000Z", likes: 0, reactions: {}, _remote: true }],
  }));
  var writes = [];
  var deferred;
  var gate = new Promise(function (resolve) { deferred = resolve; });
  var remoteWin = bootTower(remoteStorage, {
    active: function () { return true; },
    togglePostReaction: function (postId, face) {
      writes.push({ postId: postId, face: face });
      return gate.then(function () { return { ok: false, error: "Could not save reaction." }; });
    },
  });
  var pending = remoteWin.CognationTowerStore.toggleReaction("post-1", "😂");
  assert.strictEqual(typeof pending.then, "function", "remote toggle is a promise");
  assert.strictEqual(writes.length, 1, "remote toggle is a remote write");
  assert.strictEqual(writes[0].postId, "post-1");
  var cached = JSON.parse(remoteStorage.getItem("cognation.tower.posts.v3"));
  assert.strictEqual(JSON.stringify(cached.posts[0].reactions), "{}", "remote toggle does not only write localStorage");
  deferred();
  return pending.then(function (out) {
    assert.strictEqual(out.ok, false);
    var still = JSON.parse(remoteStorage.getItem("cognation.tower.posts.v3"));
    assert.strictEqual(JSON.stringify(still.posts[0].reactions), "{}", "failed remote write is not stored locally");
  });
}
