/**
 * #79 follow-up (shared device / sign-in window).
 * 1. While signing in (sign-in configured, login state not stored yet) the page
 *    is treated as signed in: the Tower shows the locked placeholder (no demo
 *    "Alexa", no leftover "Ada"), ownerless local Tower/member copies are
 *    ignored, and there is no Add friend.
 * 2. Logout clears both local profile copies (cognation.tower.profile.v1 and
 *    cognation.member.profile.v1); the server row refills them.
 * 3. Add friend is hidden on any profile of the signed-in account (either face),
 *    including a stale data-profile-id, and never relabeled "Unavailable".
 * 4. Shared device Ada -> Alex: none of Ada's copies show for Alex.
 * Run: node js/signin-window-own-profile.test.js
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
function el() {
  return {
    hidden: false, textContent: "", style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, removeAttribute: function () {}, getAttribute: function () { return null; },
    addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    focus: function () {}, appendChild: function () {}, reset: function () {},
  };
}
function makeDoc() {
  var listeners = {};
  return {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function (id) { return id === "login-gate" || id === "login-form" ? el() : null; },
    createElement: function () { return el(); },
    body: el(),
  };
}

var TOWER = "cognation.tower.profile.v1";
var MEMBER = "cognation.member.profile.v1";
var SESSION_KEY = "cognation.session.v2";
var ALEX = { username: "member-alex", activeProfileId: "p-alex", profileKind: "personal", source: "supabase", supabaseUserId: "u-alex" };
var ADA_LEFTOVERS = {};
ADA_LEFTOVERS[TOWER] = JSON.stringify({ displayName: "Ada", quote: "Ada's quote" });
ADA_LEFTOVERS[MEMBER] = JSON.stringify({ age: 15, city: "Elsewhere" });

/* A page with tower.js + the age helper. `state.session` is what the login
   gate has stored so far (null = still signing in). */
function towerPage(local, opts) {
  opts = opts || {};
  var state = { session: opts.session || null, configured: opts.configured !== false };
  var doc = makeDoc();
  var ls = store(local);
  var win = {
    document: doc, localStorage: ls, location: { hash: "", search: "" }, CustomEvent: CustomEvent, addEventListener: function () {},
    CognationAuth: { getSession: function () { return state.session; } },
    CognationSupabase: { configured: function () { return state.configured; } },
    CognationAccounts: {
      DEMO_ALEXA: { personalId: "prof-alexa" },
      getProfileById: function (id) { return id === "prof-alexa" ? { id: "prof-alexa", kind: "personal", displayName: "Alexa" } : null; },
      getProfilesForUsername: function () { return []; },
    },
    CognationSupabaseSocial: {
      active: function () { return !!(state.session && state.session.source === "supabase"); },
      getViewedProfileId: function () { return state.session ? state.session.activeProfileId : ""; },
      getTowerProfile: function (id) { return state.rows && state.rows[id] ? state.rows[id] : null; },
      getProfile: function () { return null; },
    },
  };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: ls, location: win.location, CustomEvent: CustomEvent,
    console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout, JSON: JSON, String: String, parseInt: parseInt, isNaN: isNaN });
  vm.runInContext(read("js/age-floor-keywords.js"), ctx);
  vm.runInContext(read("js/tower.js"), ctx, { filename: "js/tower.js" });
  return { state: state, win: win, ls: ls, tower: win.CognationTowerProfileStore, floor: win.CognationAgeFloor };
}

function assertPlaceholder(page, label) {
  var p = page.tower.get();
  assert.strictEqual(p._loading, true, label + ": locked placeholder");
  assert.strictEqual(p.displayName, "", label + ": blank name (got " + JSON.stringify(p.displayName) + ")");
  assert.notStrictEqual(p.quote, "Ada's quote", label + ": no leftover quote");
  assert.strictEqual(page.floor.viewerAge(), 0, label + ": ownerless member copy ignored (unknown age)");
  return p;
}

/* ---------- 1. Sign-in window with a delayed session ---------- */
function testSignInWindow() {
  var page = towerPage({});
  assert.strictEqual(page.floor.signInPending(), true, "token not stored yet = signing in");
  var p = assertPlaceholder(page, "signing in");
  assert.strictEqual(p._profileId, "", "no demo founder id while signing in");
  assert.strictEqual(page.tower.getActiveProfileId(), null, "never falls back to DEMO_ALEXA");
  assert.strictEqual(page.tower.save(p), false, "the placeholder is never saved");
  /* ~1.3-2.9s later the login state is stored; the server row is still loading. */
  page.state.session = ALEX;
  assert.strictEqual(page.floor.signInPending(), false);
  p = page.tower.get();
  assert.strictEqual(p._loading, true, "still the placeholder until the server row");
  assert.strictEqual(p._profileId, "p-alex");
  page.state.rows = { "p-alex": { displayName: "Alex", _remote: true, _profileKind: "personal" } };
  p = page.tower.get();
  assert.ok(!p._loading, "server row replaces the placeholder");
  assert.strictEqual(p.displayName, "Alex");
}

function testLocalPreviewUnchanged() {
  /* Sign-in not configured (local preview): the old demo fallback stays. */
  var local = {}; local[TOWER] = JSON.stringify({ displayName: "Demo" }); local[MEMBER] = JSON.stringify({ age: 34 });
  var page = towerPage(local, { configured: false });
  assert.strictEqual(page.floor.signInPending(), false);
  assert.strictEqual(page.tower.getActiveProfileId(), "prof-alexa", "demo founder fallback unchanged in local preview");
  assert.strictEqual(page.floor.viewerAge(), 34, "local preview member copy unchanged");
  var demo = towerPage(local, { session: { username: "demo", source: "demo" } });
  assert.strictEqual(demo.floor.signInPending(), false, "demo sessions are not 'signing in'");
}

/* ---------- 4. Shared device Ada -> Alex (leftovers from before stamping) ---------- */
function testSharedDeviceAdaToAlex() {
  var page = towerPage(ADA_LEFTOVERS);
  assertPlaceholder(page, "Alex signing in over Ada's leftovers");
  page.state.session = ALEX;
  var p = page.tower.get();
  assert.notStrictEqual(p.displayName, "Ada", "Ada's unstamped Tower copy never shows for Alex");
  assert.strictEqual(page.floor.viewerAge(), 0, "Ada's age 15 never counts for Alex");
  var mine = {}; mine[TOWER] = JSON.stringify({ displayName: "Alex", ownerUserId: "u-alex" });
  mine[MEMBER] = JSON.stringify({ age: 34, ownerUserId: "u-alex" });
  var own = towerPage(mine, { session: ALEX });
  assert.strictEqual(own.tower.get().displayName, "Alex", "your own stamped copy still shows");
  assert.strictEqual(own.floor.viewerAge(), 34);
}

/* ---------- 2. Logout clears both local profile copies ---------- */
function testLogoutClears() {
  var doc = makeDoc();
  var seed = {}; seed[SESSION_KEY] = JSON.stringify(Object.assign({ username: "seed-ada" }, { source: "supabase", supabaseUserId: "u-ada", activeProfileId: "p-ada" }));
  seed[TOWER] = ADA_LEFTOVERS[TOWER]; seed[MEMBER] = ADA_LEFTOVERS[MEMBER]; seed["cognation.unrelated.v1"] = "keep";
  var ls = store(seed);
  var signOuts = 0;
  var win = {
    document: doc, localStorage: ls, location: { hash: "", search: "" },
    CognationAccounts: { ensureSeeded: function () {}, getProfileById: function () { return null; }, profilesForLogin: function () { return []; } },
    CognationSupabaseSocial: { getProfile: function () { return null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getUser: function () { return Promise.resolve({ id: "u-ada" }); },
      signOut: function () { signOuts++; return Promise.resolve(); },
    },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
  };
  win.window = win;
  vm.runInNewContext(read("js/login.js"), {
    window: win, document: doc, localStorage: ls, location: win.location, CustomEvent: CustomEvent,
    console: console, Promise: Promise, JSON: JSON, Date: Date, setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    fetch: function () { return Promise.reject(new Error("no network")); },
  });
  return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
    return win.CognationAuth.logout();
  }).then(function () {
    assert.strictEqual(signOuts, 1);
    assert.strictEqual(ls.getItem(TOWER), null, "Tower profile copy cleared on logout");
    assert.strictEqual(ls.getItem(MEMBER), null, "member profile copy cleared on logout");
    assert.strictEqual(ls.getItem(SESSION_KEY), null, "session cleared");
    assert.strictEqual(ls.getItem("cognation.unrelated.v1"), "keep", "other keys untouched");
  });
}

/* ---------- 3. Add friend on your own profile (either face) ---------- */
function followPage(opts) {
  var doc = makeDoc();
  var row = { hidden: false };
  var attrs = { "data-profile-id": opts.staleId || "" };
  var btn = {
    hidden: false, disabled: false, textContent: "Add friend",
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    getAttribute: function (k) { return k in attrs ? attrs[k] : null; },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    closest: function (sel) { return sel === "[data-tower-follow-row]" ? row : null; },
  };
  doc.querySelectorAll = function (sel) { return sel === "[data-tower-follow]" ? [btn] : []; };
  var ls = store();
  if (opts.session) ls.setItem(SESSION_KEY, JSON.stringify(opts.session));
  var win = {
    document: doc, localStorage: ls,
    CognationTowerProfileStore: { get: function () { return opts.viewed; } },
    CognationAgeFloor: { signInPending: function () { return !!opts.pending; } },
    CognationSupabaseSocial: {
      getMyProfiles: function () { return opts.myProfiles || []; },
      getProfile: function (id) { return (opts.rows || {})[id] || null; },
    },
    CognationAccounts: {
      getProfileById: function () { return null; },
      getProfilesForUsername: function (u) { return (opts.local || {})[u] || []; },
    },
    /* Seed/ops friend gate: blocks every seed profile (Ada is a seed). */
    CognationSeedOpsFriendGate: { canFriend: function (_, p) { return p && p.seed ? { ok: false, message: "Cannot friend seed accounts" } : { ok: true }; } },
  };
  win.window = win;
  vm.runInNewContext(read("js/tower-follow.js"), {
    window: win, document: doc, localStorage: ls, CustomEvent: CustomEvent, console: console, Promise: Promise,
    setTimeout: setTimeout, clearTimeout: clearTimeout, JSON: JSON, String: String,
  });
  doc.dispatchEvent(new CustomEvent("cognation:session-started"));
  return { btn: btn, row: row, attrs: attrs };
}

function assertHidden(r, label) {
  assert.strictEqual(r.row.hidden, true, label + ": row hidden");
  assert.strictEqual(r.btn.hidden, true, label + ": button hidden");
  assert.notStrictEqual(r.btn.textContent, "Unavailable", label + ": never relabeled Unavailable");
}

function testOwnProfileEitherFace() {
  var ALEX_ROWS = { "p-alex": { id: "p-alex", user_id: "u-alex", kind: "personal" }, "p-alex-pro": { id: "p-alex-pro", user_id: "u-alex", kind: "professional" } };
  /* Session is on the personal face; the Tower shows the professional face. */
  assertHidden(followPage({ session: ALEX, viewed: { _profileId: "p-alex-pro", _profileKind: "professional" }, myProfiles: [ALEX_ROWS["p-alex"], ALEX_ROWS["p-alex-pro"]] }), "Alex pro face (my profiles)");
  assertHidden(followPage({ session: ALEX, viewed: { _profileId: "p-alex-pro" }, rows: ALEX_ROWS }), "Alex pro face (row owner)");
  /* Sage: session on professional, viewing personal; known only from the local accounts list. */
  var SAGE = { username: "seed-sage", activeProfileId: "p-sage-pro", profileKind: "professional", source: "supabase", supabaseUserId: "u-sage" };
  assertHidden(followPage({ session: SAGE, viewed: { _profileId: "p-sage" }, local: { "seed-sage": [{ id: "p-sage" }, { id: "p-sage-pro" }] } }), "Sage personal face");
  /* Stale data-profile-id from the sign-in window (demo founder). */
  assertHidden(followPage({ session: ALEX, staleId: "prof-alexa", viewed: { _profileId: "p-alex" } }), "stale attribute");
  /* Ada (seed): her own profile hides the button instead of 'Unavailable'. */
  var ADA = { username: "seed-ada", activeProfileId: "p-ada", source: "supabase", supabaseUserId: "u-ada" };
  assertHidden(followPage({ session: ADA, viewed: { _profileId: "p-ada-pro", seed: true }, rows: { "p-ada-pro": { id: "p-ada-pro", user_id: "u-ada" } } }), "Ada other face");
  assertHidden(followPage({ session: ADA, viewed: { _profileId: "p-ada", seed: true } }), "Ada same face");
  /* Signing in / placeholder: no Add friend. */
  assertHidden(followPage({ session: null, pending: true, viewed: { _profileId: "" } }), "signing in");
  assertHidden(followPage({ session: ALEX, viewed: { _loading: true, _profileId: "p-alex" } }), "placeholder");
  /* Other people are unchanged. */
  var other = followPage({ session: ALEX, viewed: { _profileId: "p-luna" }, myProfiles: [ALEX_ROWS["p-alex"], ALEX_ROWS["p-alex-pro"]], rows: { "p-luna": { id: "p-luna", user_id: "u-luna" } } });
  assert.strictEqual(other.row.hidden, false); assert.strictEqual(other.btn.hidden, false);
  assert.strictEqual(other.btn.textContent, "Add friend", "someone else's profile still offers Add friend");
  var seedOther = followPage({ session: ALEX, viewed: { _profileId: "p-ada", seed: true } });
  assert.strictEqual(seedOther.btn.textContent, "Unavailable", "Ada's profile seen by Alex keeps the seed label");
}

function testSeedDatingDefaultUntouched() {
  /* SeedOps is testing seed-0003's see_dating default save: not changed here. */
  var src = read("js/seedops-dating-hydrate.js");
  assert.ok(!/signInPending/.test(src), "dating hydrate not modified for the sign-in window");
}

testSignInWindow();
testLocalPreviewUnchanged();
testSharedDeviceAdaToAlex();
testOwnProfileEitherFace();
testSeedDatingDefaultUntouched();
testLogoutClears()
  .then(function () { console.log("signin-window-own-profile.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
