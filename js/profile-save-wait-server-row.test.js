/**
 * Tower profile save must not PATCH profiles until the active profile's server
 * row is cached, must send only the fields that differ from that row, and must
 * never write a stale local profile (another account's) to the server.
 * Run: node js/profile-save-wait-server-row.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

/* Server rows (no email column involved anywhere). */
var SERVER = {
  "p-aisha": { id: "p-aisha", user_id: "u-aisha", kind: "personal", handle: "aisha", display_name: "Aisha", bio: "Hi from Aisha" },
  "p-ada": { id: "p-ada", user_id: "u-ada", kind: "personal", handle: "ada", display_name: "Ada", bio: "Ada here" },
};

function boot(storage, session) {
  var listeners = {};
  var patches = [];
  var held = [];            /* profile GETs wait here until release() */
  var documentStub = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () {
      return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } };
    },
  };
  var win = {
    document: documentStub, localStorage: storage, sessionStorage: memoryStorage(),
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationAuth: { getSession: function () { return session.current; }, setActiveProfile: function () {} },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, opts) {
        opts = opts || {};
        var method = opts.method || "GET";
        if (table === "profiles" && method === "PATCH") {
          patches.push({ query: opts.query, body: JSON.parse(JSON.stringify(opts.body)) });
          var id = decodeURIComponent((opts.query.match(/id=eq\.([^&]+)/) || [])[1] || "");
          var row = Object.assign({}, SERVER[id], opts.body);
          return Promise.resolve([row]);
        }
        if (table === "profiles") {
          var q = String(opts.query || "");
          return new Promise(function (resolve) {
            held.push(function () {
              var uid = (q.match(/user_id=eq\.([^&]+)/) || [])[1];
              var rows = Object.keys(SERVER).map(function (k) { return SERVER[k]; });
              resolve(uid ? rows.filter(function (r) { return r.user_id === decodeURIComponent(uid); }) : rows);
            });
          });
        }
        return Promise.resolve([]);
      },
      rpc: function () { return Promise.resolve([]); },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: documentStub, localStorage: storage, sessionStorage: win.sessionStorage,
    location: win.location, console: console, CustomEvent: win.CustomEvent, URL: URL,
    setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, encodeURIComponent: encodeURIComponent,
  });
  vm.runInContext(src("js/accounts.js"), ctx);
  vm.runInContext(src("js/supabase-social.js"), ctx);
  vm.runInContext(src("js/tower.js"), ctx);
  return {
    win: win, patches: patches,
    store: win.CognationTowerProfileStore,
    sessionStarted: function () { documentStub.dispatchEvent(new win.CustomEvent("cognation:session-started")); },
    release: function () { held.splice(0).forEach(function (fn) { fn(); }); return tick().then(tick); },
  };
}
/* What renderBadgePins / renderFriendPins do after seeding a missing pin position. */
function placePin(t) {
  var p = t.store.get();
  p.friendPinLayout = Object.assign({}, p.friendPinLayout, { "friend-x": { x: 10, y: 20 } });
  t.store.save(p);
}

var storage = memoryStorage();
/* Stale local profile with a valid handle, left by another account on this browser. */
storage.setItem("cognation.tower.profile.v1", JSON.stringify({ displayName: "Previous Person", handle: "previous_person", slogan: "stale bio" }));
var session = { current: { source: "supabase", supabaseUserId: "u-aisha", activeProfileId: "p-aisha", username: "aisha-login" } };
storage.setItem("cognation.session.v2", JSON.stringify(session.current));
var t = boot(storage, session);
assert.ok(t.store, "TowerProfileStore exported");

/* (1) session-started, server row not cached yet: pin placement must not PATCH. */
t.sessionStarted();
assert.ok(!t.win.CognationSupabaseSocial.getProfile("p-aisha"), "fixture: row not cached yet");
placePin(t);
placePin(t);
assert.strictEqual(t.patches.length, 0, "(1) no PATCH before the server row loads, despite a stale local profile");

t.release().then(function () {
  assert.ok(t.win.CognationSupabaseSocial.getProfile("p-aisha"), "row cached after load");
  /* (2) unchanged profile after load: no PATCH. */
  placePin(t);
  assert.strictEqual(t.patches.length, 0, "(2) unchanged profile sends no PATCH");

  /* (3) edit only the bio: PATCH carries only bio. */
  var p = t.store.get();
  assert.strictEqual(p.displayName, "Aisha", "remote row is the source after load");
  p.slogan = "New bio from Aisha";
  t.store.save(p);
  assert.strictEqual(t.patches.length, 1, "(3) one PATCH for the bio edit");
  assert.deepStrictEqual(Object.keys(t.patches[0].body), ["bio"], "(3) PATCH body has only bio");
  assert.strictEqual(t.patches[0].body.bio, "New bio from Aisha");
  assert.ok(/id=eq\.p-aisha/.test(t.patches[0].query), "(3) targets the active profile");
  return tick();
}).then(function () {
  /* Clearing the name is a real edit: 'Member' fallback applies only then. */
  var p = t.store.get();
  p.displayName = "   ";
  t.store.save(p);
  assert.strictEqual(t.patches.length, 2);
  assert.deepStrictEqual(Object.keys(t.patches[1].body), ["display_name"]);
  assert.strictEqual(t.patches[1].body.display_name, "Member", "cleared name falls back to Member");
  return tick();
}).then(function () {
  /* (4) Switch account on the same browser: Ada signs in; Aisha's data is still local. */
  var before = t.patches.length;
  var s2 = memoryStorage();
  ["cognation.tower.profile.v1"].forEach(function (k) { if (storage.getItem(k)) s2.setItem(k, storage.getItem(k)); });
  s2.setItem("cognation.tower.profile.v1", JSON.stringify({ displayName: "Aisha", handle: "aisha", slogan: "Hi from Aisha" }));
  var session2 = { current: { source: "supabase", supabaseUserId: "u-ada", activeProfileId: "p-ada", username: "ada-login" } };
  s2.setItem("cognation.session.v2", JSON.stringify(session2.current));
  var t2 = boot(s2, session2);
  t2.sessionStarted();
  placePin(t2);
  assert.strictEqual(t2.patches.length, 0, "(4) no write from the previous account's local profile");
  return t2.release().then(function () {
    placePin(t2);
    assert.strictEqual(t2.patches.length, 0, "(4) Ada unchanged after load: no PATCH");
    var p = t2.store.get();
    assert.strictEqual(p.displayName, "Ada", "(4) Ada's own row is shown");
    t2.patches.forEach(function (x) {
      assert.ok(JSON.stringify(x.body).indexOf("Aisha") === -1, "(4) never writes Aisha's name");
    });
    assert.strictEqual(t.patches.length, before, "first browser session untouched");
    console.log("profile-save-wait-server-row.test.js: ok");
  });
}).catch(function (err) { console.error(err); process.exit(1); });
