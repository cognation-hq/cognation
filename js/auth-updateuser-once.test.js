/**
 * One page load (session-started + profile load + Tower/Commune renders that
 * fire cognation:member-profile-updated) sends PUT /auth/v1/user at most once,
 * and not at all when the server metadata already matches.
 * Run: node js/auth-updateuser-once.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var code = fs.readFileSync(path.join(__dirname, "..", "js", "seedops-dating-hydrate.js"), "utf8");

function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}

/* One page load against a shared fake auth server. Resolves with PUT count. */
function pageLoad(server, session, local) {
  var listeners = {};
  var puts = [];
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
  };
  function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }
  var ls = store(local);
  var win = {
    document: doc,
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve({ user_metadata: JSON.parse(JSON.stringify(server.meta)) }); },
      updateUser: function (data) {
        puts.push(JSON.parse(JSON.stringify(data)));
        Object.assign(server.meta, data);   /* GoTrue merges data into user_metadata */
        return Promise.resolve({ user_metadata: server.meta });
      },
      rest: function () { return Promise.resolve([]); },
    },
  };
  /* Same contract as commune-swipe.js setMemberProfile/setSeeDating:
     setMemberProfile always emits member-profile-updated, even when unchanged. */
  var see = ls.getItem("cognation.commune.seeDating.v1") === "1";
  win.CognationCommuneSwipe = {
    getMemberProfile: function () { return JSON.parse(ls.getItem("cognation.member.profile.v1") || "{}"); },
    setMemberProfile: function (p) {
      ls.setItem("cognation.member.profile.v1", JSON.stringify(p || {}));
      doc.dispatchEvent(new CustomEvent("cognation:member-profile-updated", { detail: p }));
      return p;
    },
    getSeeDating: function () { return see; },
    setSeeDating: function (on) {
      var prev = see; see = !!on;
      ls.setItem("cognation.commune.seeDating.v1", see ? "1" : "0");
      if (prev !== see) doc.dispatchEvent(new CustomEvent("cognation:see-dating-changed", { detail: { seeDating: see } }));
    },
    getMemberAge: function () { return parseInt(this.getMemberProfile().age, 10) || null; },
    rebuild: function () {},
  };
  win.window = win;
  vm.runInNewContext(code, {
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, CustomEvent: CustomEvent,
    encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
  });
  function rerender() {   /* Tower / Commune renders and other modules re-saving the member profile */
    win.CognationCommuneSwipe.setMemberProfile(win.CognationCommuneSwipe.getMemberProfile());
  }
  setTimeout(function () { doc.dispatchEvent(new CustomEvent("cognation:session-started")); }, 50);
  setTimeout(rerender, 120);
  setTimeout(rerender, 450);
  setTimeout(function () { doc.dispatchEvent(new CustomEvent("cognation:auth-changed")); }, 700);
  setTimeout(rerender, 900);
  setTimeout(rerender, 1700);
  return new Promise(function (resolve) { setTimeout(function () { resolve(puts); }, 3000); });
}

var SEED = { username: "seed-0001", seedFleetId: "seed-0001", activeProfileId: "prof-seed-0001", accountKind: "seed" };
var REAL = { username: "member-login", activeProfileId: "prof-real", source: "supabase", supabaseUserId: "u-real" };

var seedServer = { meta: {} };   /* nothing saved server-side yet */
pageLoad(seedServer, SEED, null).then(function (puts) {
  assert.ok(puts.length <= 1, "fresh seed page load: at most one PUT /auth/v1/user (got " + puts.length + ")");
  assert.strictEqual(puts.length, 1, "seed defaults are written once");
  assert.strictEqual(puts[0].see_dating, true);
  assert.strictEqual(puts[0].member_age, 28);
  /* Reload: server now matches local -> zero PUTs. */
  return pageLoad(seedServer, SEED, null);
}).then(function (puts) {
  assert.strictEqual(puts.length, 0, "reload with unchanged metadata: no PUT (got " + puts.length + ")");
  /* Real member whose metadata already matches what the browser has. */
  var meta = { see_dating: false, member_age: 34, member_city: "Springfield", member_state: "IL", member_country: "United States", member_interests: ["jobs"] };
  var local = {
    "cognation.member.profile.v1": JSON.stringify({ age: 34, city: "Springfield", locality: "Springfield", state: "IL", country: "United States", interests: ["jobs"] }),
    "cognation.commune.seeDating.v1": "0",
  };
  return pageLoad({ meta: meta }, REAL, local);
}).then(function (puts) {
  assert.strictEqual(puts.length, 0, "real member, unchanged metadata: no PUT (got " + puts.length + ")");
  /* A real change (age edited) is written exactly once. */
  var meta = { see_dating: false, member_age: 34, member_city: "Springfield", member_state: "IL", member_country: "United States", member_interests: ["jobs"] };
  var local = {
    "cognation.member.profile.v1": JSON.stringify({ age: 35, city: "Springfield", locality: "Springfield", state: "IL", country: "United States", interests: ["jobs"] }),
    "cognation.commune.seeDating.v1": "0",
  };
  var srv = { meta: meta };
  return pageLoad(srv, REAL, local).then(function (puts) {
    /* hydrate applies server age (34) over local, so local now matches: no write. */
    assert.ok(puts.length <= 1, "at most one PUT (got " + puts.length + ")");
    console.log("auth-updateuser-once.test.js: ok");
  });
}).catch(function (err) { console.error(err); process.exit(1); });
