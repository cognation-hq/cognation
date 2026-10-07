/**
 * Shared device: two people sign in on the same browser. Local caches from the
 * previous user must not leak into the next user's session, and nothing is
 * written to the account just because a value is missing.
 * (a) Tower profile: cognation.tower.profile.v1 is used only when its owner is
 *     the signed-in user; otherwise a muted placeholder until the server row.
 *     Your own profile never shows Add friend.
 * (b) viewerAge(): another user's cognation.member.profile.v1 is ignored
 *     (unknown = under-13).
 * (c) seedops-dating-hydrate.js: a missing see_dating is the default (off),
 *     not a change, so 0 account writes.
 * Run: node js/shared-device-local-cache.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    _d: d,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }
function makeDoc() {
  var listeners = {};
  return {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
}

var MEMBER = "cognation.member.profile.v1";
var SESSION_KEY = "cognation.session.v2";
var LUNA = { username: "member-luna", activeProfileId: "p-luna", source: "supabase", supabaseUserId: "u-luna" };
var ALEX = { username: "member-alex", activeProfileId: "p-alex", source: "supabase", supabaseUserId: "u-alex" };

/* ---------- (b) viewerAge ---------- */

function helperFor(session, local) {
  var ls = store(local);
  var win = { localStorage: ls, CognationAuth: { getSession: function () { return session; } } };
  win.window = win;
  vm.runInNewContext(read("js/age-floor-keywords.js"), { window: win, JSON: JSON, String: String, parseInt: parseInt, isNaN: isNaN });
  return win.CognationAgeFloor;
}

function testViewerAgeSameUserOnly() {
  var lunaBlob = JSON.stringify({ age: 34, ownerUserId: "u-luna" });
  var h = helperFor(ALEX, { [MEMBER]: lunaBlob });
  assert.strictEqual(h.viewerAge(), 0, "another user's leftover age is ignored");
  assert.strictEqual(h.viewerIsUnder13(), true, "falls back to unknown = under-13");
  h = helperFor(ALEX, { [MEMBER]: JSON.stringify({ age: 34 }) });
  assert.strictEqual(h.viewerAge(), 0, "an ownerless blob does not count for a signed-in user");
  h = helperFor(LUNA, { [MEMBER]: lunaBlob });
  assert.strictEqual(h.viewerAge(), 34, "the same user's own age still counts");
  assert.strictEqual(h.viewerIsUnder13(), false);
  h = helperFor({ username: "demo" }, { [MEMBER]: JSON.stringify({ age: 34 }) });
  assert.strictEqual(h.viewerAge(), 34, "signed-out / demo sessions unchanged");
}

function testCommuneSwipeGetterIgnoresForeignBlob() {
  /* commune-swipe's getMemberAge (what viewerAge asks first) must agree. */
  var src = read("js/commune-swipe.js");
  assert.ok(/memberProfileOwned\(p\)\) p = \{\}/.test(src), "getMemberProfile drops another user's blob");
  assert.ok(/next\.ownerUserId = owner/.test(src), "setMemberProfile stamps the signed-in owner");
}

/* ---------- (c) dating hydrate: missing see_dating ---------- */

var dating = read("js/seedops-dating-hydrate.js");
var helperSrc = read("js/age-floor-keywords.js");
var SCALE = 10;

function pageLoad(server, session, local, script) {
  var doc = makeDoc();
  var puts = [];
  var ls = store(local);
  var win = {
    document: doc, localStorage: ls,
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve({ user_metadata: JSON.parse(JSON.stringify(server.meta)) }); },
      updateUser: function (data) {
        puts.push(JSON.parse(JSON.stringify(data)));
        Object.assign(server.meta, data);
        return Promise.resolve({ user_metadata: server.meta });
      },
      rest: function () { return Promise.resolve([]); },
    },
  };
  var see = ls.getItem("cognation.commune.seeDating.v1") === "1";
  win.CognationCommuneSwipe = {
    getMemberProfile: function () {
      var p = JSON.parse(ls.getItem(MEMBER) || "{}");
      return win.CognationAgeFloor.memberProfileOwned(p) ? p : {};
    },
    setMemberProfile: function (p) {
      ls.setItem(MEMBER, JSON.stringify(p || {}));
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
  var ctx = {
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: console,
    setTimeout: function (fn, ms) { return setTimeout(fn, (ms || 0) / SCALE); }, clearTimeout: clearTimeout,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
  };
  vm.createContext(ctx);
  vm.runInContext(helperSrc, ctx);
  vm.runInContext(dating, ctx);
  var swipe = win.CognationCommuneSwipe;
  function rerender() { swipe.setMemberProfile(swipe.getMemberProfile()); }
  setTimeout(function () { doc.dispatchEvent(new CustomEvent("cognation:session-started")); }, 5);
  (script || []).forEach(function (step) { setTimeout(function () { step(swipe, doc, rerender); }, step.at); });
  return new Promise(function (resolve) { setTimeout(function () { resolve({ puts: puts, ls: ls, swipe: swipe, win: win }); }, 1200); });
}
function at(ms, fn) { fn.at = ms; return fn; }
function churn() {
  var s = [];
  for (var i = 1; i <= 12; i++) {
    s.push(at(i * 60, function (swipe, doc, rerender) {
      rerender();
      doc.dispatchEvent(new CustomEvent("cognation:auth-changed"));
      doc.dispatchEvent(new CustomEvent("cognation:session-started"));
    }));
  }
  return s;
}

var ALEX_META = { member_age: 34, member_city: "Springfield", member_state: "IL", member_country: "United States", member_interests: ["jobs"] };

function testMissingSeeDatingNoWrite() {
  /* Server has Alex's prefs but no see_dating key; local copy is Alex's own. */
  var local = {
    [MEMBER]: JSON.stringify({ age: 34, city: "Springfield", locality: "Springfield", state: "IL", country: "United States", interests: ["jobs"], ownerUserId: "u-alex" }),
  };
  return pageLoad({ meta: Object.assign({}, ALEX_META) }, ALEX, local, churn()).then(function (r) {
    assert.strictEqual(r.puts.length, 0, "missing see_dating is the default, not a change (got " + r.puts.length + " writes)");
    assert.strictEqual(r.swipe.getSeeDating(), false, "See dating stays off (the default)");
  });
}

function testOtherUsersLeftoversNoWrite() {
  /* Luna used this browser before: her age 15 and See dating on are left behind. */
  var local = {
    [MEMBER]: JSON.stringify({ age: 15, city: "Elsewhere", interests: ["gamers"], ownerUserId: "u-luna" }),
    "cognation.commune.seeDating.v1": "1",
  };
  return pageLoad({ meta: Object.assign({}, ALEX_META) }, ALEX, local, churn()).then(function (r) {
    assert.strictEqual(r.puts.length, 0, "Luna's leftovers are never written to Alex's account (got " + r.puts.length + ")");
    var blob = JSON.parse(r.ls.getItem(MEMBER));
    assert.strictEqual(blob.ownerUserId, "u-alex", "local copy now belongs to Alex");
    assert.strictEqual(blob.age, 34, "Alex's server age, not Luna's 15");
    assert.strictEqual(blob.city, "Springfield");
    assert.strictEqual(r.swipe.getSeeDating(), false, "Luna's See dating flag reset to the default");
    assert.strictEqual(r.win.CognationAgeFloor.viewerAge(), 34);
  });
}

function testRealChangeStillWrites() {
  var local = {
    [MEMBER]: JSON.stringify({ age: 34, city: "Springfield", locality: "Springfield", state: "IL", country: "United States", interests: ["jobs"], ownerUserId: "u-alex" }),
  };
  var script = [at(200, function (swipe) { swipe.setSeeDating(true); var p = swipe.getMemberProfile(); swipe.setMemberProfile(p); })];
  return pageLoad({ meta: Object.assign({}, ALEX_META) }, ALEX, local, script).then(function (r) {
    assert.strictEqual(r.puts.length, 1, "turning See dating on writes once (got " + r.puts.length + ")");
    assert.strictEqual(r.puts[0].see_dating, true);
  });
}

/* ---------- (a) Tower profile placeholder ---------- */

function testTowerSource() {
  var src = read("js/tower.js");
  assert.ok(/function legacyBlobOwned\(blob\)/.test(src) && /legacyBlobOwned\(parsed\) \? parsed : null/.test(src),
    "legacy cognation.tower.profile.v1 is read only when owned by the signed-in user");
  assert.ok(/load: function \(\) \{[\s\S]{0,1200}?return legacyTowerBlob\(\);\s*\},\s*get: function/.test(src), "TowerProfileStore.load goes through the owner check");
  assert.ok(/towerBlob\.ownerUserId = ownerId/.test(src), "Tower saves stamp the owner");
  assert.ok(/if \(data\._loading\) return false;/.test(src), "the placeholder is never saved");
  var css = read("css/styles.css");
  var nameRule = /\.tower-profile-name\.is-loading \{\s*color: var\(--cgn-text-muted\);\s*min-width: 10ch;\s*visibility: hidden;\s*\}/;
  var avatarRule = /\.tower-avatar\.is-loading \{\s*background: var\(--cgn-text-muted\) !important;\s*opacity: 0\.4;\s*\}/;
  assert.ok(nameRule.test(css), "name placeholder uses the existing muted token");
  assert.ok(avatarRule.test(css), "avatar placeholder: muted circle at 40% opacity");
}

function testTowerFollowSelfHidden() {
  var src = read("js/tower-follow.js");
  assert.ok(/if \(isOwnProfileId\(id\)\) \{\s*if \(row\) row\.hidden = true;\s*btn\.hidden = true;\s*return;/.test(src),
    "Add friend row hidden on your own profile before any async lookup");
}

testViewerAgeSameUserOnly();
testCommuneSwipeGetterIgnoresForeignBlob();
testTowerSource();
testTowerFollowSelfHidden();
testMissingSeeDatingNoWrite()
  .then(testOtherUsersLeftoversNoWrite)
  .then(testRealChangeStillWrites)
  .then(function () { console.log("shared-device-local-cache.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
