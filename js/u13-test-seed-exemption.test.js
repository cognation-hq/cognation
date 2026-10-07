/**
 * Sage (seed-0248) is the under-13 test viewer. isU13TestViewer() needs all
 * three of: account_kind 'seed' (profiles row or app_metadata), seed_fleet_id
 * 'seed-0248', user_metadata.test_role 'u13-viewer'. It is false on any missing
 * data and only ever restricts: no age-28 default, no prefs PUT, no under-18
 * raise, and she is left out of member lists and the Tower feed.
 * Run: node js/u13-test-seed-exemption.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
var helper = require("./seedops-u13-test-viewer.js");

/* ---------- isU13TestViewer ---------- */
var USER = { id: "u-sage", app_metadata: {}, user_metadata: { test_role: "u13-viewer" } };
var ROW = { id: "p-sage", user_id: "u-sage", account_kind: "seed", seed_fleet_id: "seed-0248" };
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function check(user, profile) { return helper.isU13TestViewer({ user: user, profile: profile }); }

assert.strictEqual(check(USER, ROW), true, "all three -> true");
var viaApp = clone(ROW); delete viaApp.account_kind;
var appUser = clone(USER); appUser.app_metadata.account_kind = "seed";
assert.strictEqual(check(appUser, viaApp), true, "account_kind from app_metadata -> true");

var r;
r = clone(ROW); r.account_kind = "real"; assert.strictEqual(check(USER, r), false, "account_kind real -> false");
r = clone(ROW); delete r.account_kind; assert.strictEqual(check(USER, r), false, "account_kind missing -> false");
r = clone(ROW); r.seed_fleet_id = "seed-0247"; assert.strictEqual(check(USER, r), false, "other fleet id -> false");
r = clone(ROW); r.seed_fleet_id = null; assert.strictEqual(check(USER, r), false, "fleet id missing -> false");
var u = clone(USER); delete u.user_metadata.test_role; assert.strictEqual(check(u, ROW), false, "test_role missing -> false");
u = clone(USER); u.user_metadata.test_role = "viewer"; assert.strictEqual(check(u, ROW), false, "other test_role -> false");
u = clone(USER); delete u.user_metadata; assert.strictEqual(check(u, ROW), false, "user_metadata missing -> false");
assert.strictEqual(check(null, ROW), false, "no user -> false");
assert.strictEqual(check(USER, null), false, "no profile row -> false");
r = clone(ROW); r.user_id = "u-other"; assert.strictEqual(check(USER, r), false, "row for another user -> false");
assert.strictEqual(helper.isU13TestViewer(), false, "nothing loaded -> false");
assert.strictEqual(helper.isU13TestViewer({}), false, "empty input -> false");

/* ---------- list filter ---------- */
assert.strictEqual(helper.LIST_FILTER, "or=(seed_fleet_id.is.null,seed_fleet_id.neq.seed-0248)");
["js/seedops-tower-hydrate.js", "js/supabase-social.js", "js/seedops-dating-hydrate.js"].forEach(function (rel) {
  var src = read(rel);
  assert.ok(src.indexOf("LIST_FILTER") !== -1, rel + " uses the shared or= filter");
  assert.ok(!/seed_fleet_id=neq\./.test(src), rel + " must not use plain neq (drops null rows)");
});
assert.ok(/author:profiles![^(]+\([^)]*seed_fleet_id/.test(read("js/supabase-social.js")), "feed embeds the author's fleet id");
assert.ok(read("js/people-search.js").indexOf("isSageRow") !== -1, "people search drops Sage");
assert.ok(read("js/seedops-pathways.js").indexOf("isU13TestViewer") !== -1, "pathways skips the under-18 raise for Sage");
var html = read("index.html");
var at = function (s) { return html.indexOf('<script src="' + s + '"'); };
assert.ok(at("js/seedops-u13-test-viewer.js") > at("js/supabase-client.js"), "helper loads after the Supabase client");
["js/seedops-pathways.js", "js/supabase-social.js", "js/people-search.js", "js/seedops-commune-alive.js",
 "js/seedops-dating-hydrate.js", "js/seedops-tower-hydrate.js"].forEach(function (s) {
  assert.ok(at("js/seedops-u13-test-viewer.js") < at(s), "helper loads before " + s);
});

/* ---------- page loads ---------- */
function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

function world(opts) {
  var listeners = {};
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
  };
  var ls = store(opts.local);
  var calls = { puts: [], queries: [] };
  var win = {
    document: doc,
    CognationAuth: { getSession: function () { return opts.session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve(clone(opts.user)); },
      updateUser: function (data) { calls.puts.push(clone(data)); Object.assign(opts.user.user_metadata, data); return Promise.resolve(opts.user); },
      rest: function (table, o) {
        calls.queries.push(table + "?" + ((o && o.query) || ""));
        if (table === "profiles" && /user_id=eq\./.test(o.query)) return Promise.resolve(opts.row ? [clone(opts.row)] : []);
        return Promise.resolve([]);
      },
    },
  };
  var see = false;
  win.CognationCommuneSwipe = {
    getMemberProfile: function () { return JSON.parse(ls.getItem("cognation.member.profile.v1") || "{}"); },
    setMemberProfile: function (p) {
      ls.setItem("cognation.member.profile.v1", JSON.stringify(p || {}));
      doc.dispatchEvent(new CustomEvent("cognation:member-profile-updated", { detail: p }));
      return p;
    },
    getSeeDating: function () { return see; },
    setSeeDating: function (on) { see = !!on; },
    getMemberAge: function () { return parseInt(this.getMemberProfile().age, 10) || null; },
    rebuild: function () {},
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: console,
    setTimeout: function (fn, ms) { return setTimeout(fn, (ms || 0) / 10); }, clearTimeout: clearTimeout,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
  });
  function load(rel) { vm.runInContext(read(rel), ctx, { filename: rel }); }
  load("js/seedops-u13-test-viewer.js");
  return { win: win, doc: doc, ls: ls, calls: calls, load: load };
}

var SAGE_SESSION = { username: "seed-0248", seedFleetId: "seed-0248", accountKind: "seed", source: "supabase",
  supabaseUserId: "u-sage", activeProfileId: "p-sage" };
function sageWorld(over) {
  return world(Object.assign({
    session: SAGE_SESSION,
    user: { id: "u-sage", app_metadata: {}, user_metadata: { test_role: "u13-viewer", member_age: 11 } },
    row: ROW,
  }, over || {}));
}

function settle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function rerenders(w, n) {
  for (var i = 1; i <= n; i++) setTimeout(function () {
    var s = w.win.CognationCommuneSwipe; s.setMemberProfile(s.getMemberProfile());
  }, i * 30);
}

function testSageNoAdultDefaultsNoPut() {
  var w = sageWorld();
  w.load("js/seedops-dating-hydrate.js");
  setTimeout(function () { w.doc.dispatchEvent(new CustomEvent("cognation:session-started")); }, 5);
  rerenders(w, 10);
  return settle(700).then(function () {
    assert.strictEqual(w.calls.puts.length, 0, "Sage: no PUT /auth/v1/user (got " + w.calls.puts.length + ")");
    assert.strictEqual(w.win.CognationCommuneSwipe.getMemberAge(), 11, "Sage keeps age 11, not the age-28 default");
    assert.strictEqual(w.win.CognationU13TestViewer.isU13TestViewer(), true);
    var bios = w.calls.queries.filter(function (q) { return /account_kind=eq\.seed/.test(q); });
    assert.ok(bios.length > 0, "seed bios list was fetched");
    bios.forEach(function (q) {
      assert.ok(q.indexOf("&or=(seed_fleet_id.is.null,seed_fleet_id.neq.seed-0248)") !== -1, "seed list query carries the or= filter: " + q);
    });
  });
}

function testSeedWithoutTestRoleStillGetsDefaults() {
  /* Same fleet id, but no test_role: not the test viewer -> normal seed defaults + one PUT. */
  var w = sageWorld({ user: { id: "u-sage", app_metadata: {}, user_metadata: {} } });
  w.load("js/seedops-dating-hydrate.js");
  setTimeout(function () { w.doc.dispatchEvent(new CustomEvent("cognation:session-started")); }, 5);
  rerenders(w, 6);
  return settle(700).then(function () {
    assert.strictEqual(w.win.CognationCommuneSwipe.getMemberAge(), 28, "non-test seed still gets age 28");
    assert.strictEqual(w.calls.puts.length, 1, "non-test seed still saves defaults once");
  });
}

function testCommuneAliveSkipsDefault() {
  var w = sageWorld({ user: { id: "u-sage", app_metadata: {}, user_metadata: { test_role: "u13-viewer" } } });
  return w.win.CognationU13TestViewer.ready().then(function (isSage) {
    assert.strictEqual(isSage, true);
    w.load("js/seedops-commune-alive.js");
    w.win.CognationSeedOpsCommuneAlive.ensureMemberProfile();
    assert.strictEqual(w.win.CognationCommuneSwipe.getMemberAge(), null, "commune-alive: no age-28 default for Sage");
    var other = world({ session: Object.assign({}, SAGE_SESSION, { supabaseUserId: "u-x" }), user: { id: "u-x", user_metadata: {} }, row: null });
    other.load("js/seedops-commune-alive.js");
    /* Signed in but not loaded yet: "not loaded" is not "not Sage", so no default yet. */
    other.win.CognationSeedOpsCommuneAlive.ensureMemberProfile();
    assert.strictEqual(other.win.CognationCommuneSwipe.getMemberAge(), null, "commune-alive: no default before the login data loads");
    return other.win.CognationU13TestViewer.ready().then(function () {
      other.win.CognationSeedOpsCommuneAlive.ensureMemberProfile();
      assert.strictEqual(other.win.CognationCommuneSwipe.getMemberAge(), 28, "commune-alive: default unchanged for others once loaded");
    });
  });
}

function testReadyFailsClosed() {
  var w = sageWorld({ row: null });
  return w.win.CognationU13TestViewer.ready().then(function (isSage) {
    assert.strictEqual(isSage, false, "no profile row -> false");
    var w2 = sageWorld();
    w2.win.CognationSupabase.getUser = function () { return Promise.reject(new Error("401")); };
    return w2.win.CognationU13TestViewer.ready();
  }).then(function (isSage) {
    assert.strictEqual(isSage, false, "getUser error -> false");
  });
}

function testTowerFeedDropsSage() {
  var queries = [];
  var doc = { readyState: "complete", addEventListener: function () {}, dispatchEvent: function () { return true; } };
  var saved = null;
  var win = {
    document: doc, localStorage: store(), addEventListener: function () {},
    CustomEvent: CustomEvent,
    CognationAuth: { getSession: function () { return { source: "supabase", supabaseUserId: "u-viewer", activeProfileId: "p-viewer" }; }, whenReady: { then: function () {} } },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, o) {
        queries.push(table + "?" + o.query);
        if (table === "tower_posts") {
          return Promise.resolve([
            { id: "post-sage", author_profile_id: "p-sage", body: "hi", visibility: "public", attachments: [], created_at: "2026-10-07T20:00:00Z",
              author: { id: "p-sage", user_id: "u-sage", kind: "personal", handle: "sage", display_name: "Sage", bio: "", seed_fleet_id: "seed-0248" }, reactions: [] },
            { id: "post-real", author_profile_id: "p-real", body: "hello", visibility: "public", attachments: [], created_at: "2026-10-07T19:00:00Z",
              author: { id: "p-real", user_id: "u-real", kind: "personal", handle: "sam", display_name: "Sam", bio: "", seed_fleet_id: null }, reactions: [] },
          ]);
        }
        return Promise.resolve([]);
      },
    },
    CognationTowerStore: { setRemotePosts: function (posts) { saved = posts; return posts; } },
  };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, location: { hash: "" }, console: console,
    CustomEvent: CustomEvent, Promise: Promise, encodeURIComponent: encodeURIComponent });
  vm.runInContext(read("js/seedops-u13-test-viewer.js"), ctx);
  vm.runInContext(read("js/supabase-social.js"), ctx);
  var api = win.CognationSupabaseSocial;
  return api.refreshFeed().then(function (posts) {
    assert.strictEqual(posts.length, 1, "Sage's post is left out of the Tower feed");
    assert.strictEqual(posts[0].id, "post-real", "real people with no fleet id stay in the feed");
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(api.getProfile("p-sage"), null, "Sage's author row is not cached for search");
    assert.strictEqual(api.memberResults("sage").length, 0, "Sage is not in member search");
    assert.strictEqual(api.memberResults("sam").length, 1, "others still are");
  });
}

testSageNoAdultDefaultsNoPut()
  .then(testTowerFeedDropsSage)
  .then(testSeedWithoutTestRoleStillGetsDefaults)
  .then(testCommuneAliveSkipsDefault)
  .then(testReadyFailsClosed)
  .then(function () { console.log("u13-test-seed-exemption.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
