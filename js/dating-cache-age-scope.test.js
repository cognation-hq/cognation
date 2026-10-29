/**
 * The dating hydrate cache (sessionStorage cognation.seedops.datingHydrate.v2)
 * is never a source of age. Before: a signed-in page load with that cache
 * re-applied its birthAge (no user_birth read at all), and the cache carried
 * no user id. So another account's cache, a signed-out cache, or a hand-edited
 * one (birthAge raised) set the age every gate reads: viewerAge, Tower
 * ratingViewer / the #312 hold, Classroom, dating, rooms.
 * Now: the cache is keyed by user id (any other cache is dropped), it holds
 * no age that is applied, the viewer stays pending until this load's own
 * user_birth read answers, and that answer sets the age.
 * Real age-floor-keywords, seedops-u13-test-viewer, commune-swipe,
 * seedops-dating-hydrate, auto-rate and tower.js in one vm page, with a fake
 * Supabase client (reads only).
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
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
function fakeElement(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), hidden: false, attrs: {}, style: {}, innerHTML: "", children: [],
    setAttribute: function (k, v) { this.attrs[k] = String(v); }, getAttribute: function (k) { return this.attrs[k]; },
    addEventListener: function () {}, appendChild: function (c) { this.children.push(c); return c; },
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  };
}

var KEY = "cognation.seedops.datingHydrate.v2";
var YEAR = new Date().getFullYear();
function account(id, birthYear) {
  return {
    user: { id: "u-" + id, app_metadata: {}, user_metadata: {} },
    session: { source: "supabase", supabaseUserId: "u-" + id, username: id, activeProfileId: "p-" + id },
    row: { id: "p-" + id, user_id: "u-" + id, account_kind: "personal" },
    birth: birthYear ? { birth_year: birthYear, birth_month: 1 } : null,
  };
}
var TEEN = account("teen", YEAR - 15);
var ADULT = account("adult", YEAR - 30);
var FORGED_AGE = 30;

/* One page load: sessionStorage carries over from "before the reload". */
function page(opts) {
  var listeners = {};
  var doc = {
    readyState: "complete", body: fakeElement("body"),
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; }, createElement: fakeElement,
  };
  var ls = store();
  var ss = store(opts.session || {});
  var acct = opts.acct || null;
  var h = { ss: ss, rest: [], puts: [], rpcs: [], birthDelay: opts.birthDelay || 0, accounts: [TEEN, ADULT] };
  var win = {
    document: doc, localStorage: ls, sessionStorage: ss, location: { search: "", pathname: "/commune.html", hash: "", href: "https://cognation.test/commune.html" },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    CognationDatingFlag: { enabled: function () { return true; } },
    CognationAuth: { getSession: function () { return acct ? clone(acct.session) : null; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return acct ? { access_token: "t-" + acct.user.id, user: { id: acct.user.id } } : null; },
      getUser: function () { return Promise.resolve(acct ? clone(acct.user) : null); },
      updateUser: function (data) { h.puts.push(clone(data)); return Promise.resolve(null); },
      rpc: function (name) { h.rpcs.push(name); return Promise.resolve(false); },
      rest: function (table, o) {
        h.rest.push({ table: table, method: (o && o.method) || "GET" });
        var m = /user_id=eq\.([^&]+)/.exec((o && o.query) || "");
        var id = m ? decodeURIComponent(m[1]) : "";
        var who = h.accounts.filter(function (a) { return a.user.id === id; })[0];
        if (table === "user_birth") {
          var rows = who && who.birth ? [clone(who.birth)] : [];
          return wait(h.birthDelay).then(function () { return rows; });
        }
        if (table === "profiles" && who) return Promise.resolve([clone(who.row)]);
        return Promise.resolve([]);
      },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: ss, location: win.location, console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String, parseInt: parseInt, isNaN: isNaN, URL: URL,
    fetch: function () { h.rest.push({ table: "fetch", method: "FETCH" }); return Promise.resolve(null); },
  });
  ["js/age-floor-keywords.js", "js/seedops-u13-test-viewer.js", "js/commune-swipe.js",
    "js/seedops-dating-hydrate.js", "js/auto-rate.js", "js/tower.js"]
    .forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });
  h.swipe = win.CognationCommuneSwipe;
  h.floor = win.CognationAgeFloor;
  h.tower = win.CognationTowerStore;
  h.emit = function (type) { doc.dispatchEvent(new CustomEvent(type, { detail: {} })); };
  h.signIn = function (a) { acct = a; h.emit("cognation:session-started"); };
  h.signOut = function () { acct = null; h.emit("cognation:session-ended"); };
  /* An unrated server post (PG-13): the #312 hold keeps it back while the age is
     not known. An R server post: the Tower/News gate shows it only to 17+. */
  var pg13 = { id: "pg13", _remote: true, authorProfileId: "p-other", body: "Hello", createdAt: "2026-10-29T14:00:00.000Z", attachments: [] };
  var rPost = Object.assign({}, pg13, { id: "r", rating: "R" });
  h.gates = function () {
    return {
      birthAge: h.swipe.getDatingBirthAge(),
      memberAge: h.swipe.getMemberAge(),
      viewerAge: h.floor.viewerAge(),
      classroom: h.swipe.classroomAllowed(),
      dating: h.swipe.datingAllowed(),
      pending: h.swipe.viewerAgePending(),
      hold: h.tower.holdRemotePost(clone(pg13)),
      seesR: !!win.CognationTowerPostVisibleToViewer(clone(rPost)),
    };
  };
  h.sampler = function () {
    var seen = [];
    var t = setInterval(function () { seen.push(h.gates()); }, 5);
    return { seen: seen, stop: function () { clearInterval(t); seen.push(h.gates()); return seen; } };
  };
  h.birthReads = function () { return h.rest.filter(function (r) { return r.table === "user_birth"; }).length; };
  h.writes = function () {
    return h.puts.concat(h.rpcs, h.rest.filter(function (r) { return r.method !== "GET"; }));
  };
  return h;
}

function cacheFor(userId, birthAge) {
  var o = { ok: true, seedish: false, seeDating: true, birthAge: birthAge, at: "2026-10-29T17:00:00.000Z" };
  if (userId) o.userId = userId;
  var s = {};
  s[KEY] = JSON.stringify(o);
  return s;
}

function neverForged(seen, label) {
  seen.forEach(function (g, i) {
    assert.notEqual(g.birthAge, FORGED_AGE, label + " sample " + i + ": birth age never the cached one");
    assert.notEqual(g.memberAge, FORGED_AGE, label + " sample " + i + ": member age never the cached one");
    assert.notEqual(g.viewerAge, FORGED_AGE, label + " sample " + i + ": viewerAge never the cached one");
    assert.equal(g.classroom, false, label + " sample " + i + ": classroom closed");
    assert.equal(g.dating, false, label + " sample " + i + ": dating closed");
    assert.equal(g.seesR, false, label + " sample " + i + ": Tower/News gate never shows an R post");
    if (g.pending) assert.equal(g.hold, false, label + " sample " + i + ": pending: #312 hold keeps the PG-13 post back");
  });
}

test("edited cache (own user id, age raised): never applied; pending until user_birth answers, then the real age", async function () {
  var h = page({ acct: TEEN, session: cacheFor(TEEN.user.id, FORGED_AGE), birthDelay: 120 });
  var s = h.sampler();
  await wait(260); /* boot hydrate at 200 ms; user_birth still out */
  var mid = h.gates();
  assert.equal(mid.pending, true, "viewer pending while user_birth is out");
  assert.equal(mid.hold, false, "pending: the #312 hold keeps the PG-13 post back");
  await wait(150);
  var seen = s.stop();
  neverForged(seen, "teen");
  var end = h.gates();
  assert.equal(end.birthAge, 15, "user_birth sets the teen's own age");
  assert.equal(end.viewerAge, 15);
  assert.equal(end.pending, false);
  assert.equal(h.birthReads(), 1, "this load read user_birth once");
  assert.deepEqual(h.writes(), [], "no network writes");
});

test("another user's cache is dropped, never applied", async function () {
  var h = page({ acct: TEEN, session: cacheFor(ADULT.user.id, FORGED_AGE), birthDelay: 60 });
  var s = h.sampler();
  await wait(400);
  neverForged(s.stop(), "teen with adult cache");
  assert.equal(h.gates().birthAge, 15);
  var cached = JSON.parse(h.ss.getItem(KEY) || "null");
  assert.ok(cached && cached.userId === TEEN.user.id, "cache rewritten for the teen");
  assert.equal(cached.birthAge, 15);
  assert.deepEqual(h.writes(), []);
});

test("a cache with no user id (older format) is dropped", async function () {
  var h = page({ acct: TEEN, session: cacheFor(null, FORGED_AGE), birthDelay: 40 });
  var s = h.sampler();
  await wait(350);
  neverForged(s.stop(), "teen with unkeyed cache");
  assert.equal(h.gates().birthAge, 15);
});

test("signed out: a leftover cache sets no age and is dropped", async function () {
  var h = page({ acct: null, session: cacheFor(ADULT.user.id, FORGED_AGE) });
  var s = h.sampler();
  await wait(350);
  var seen = s.stop();
  seen.forEach(function (g, i) {
    assert.equal(g.birthAge, null, "sample " + i + ": no birth age signed out");
    assert.notEqual(g.memberAge, FORGED_AGE, "sample " + i);
    assert.equal(g.dating, false, "sample " + i + ": dating closed");
    assert.equal(g.hold, false, "sample " + i + ": hold keeps the PG-13 post back");
  });
  var cached = JSON.parse(h.ss.getItem(KEY) || "null");
  assert.ok(!cached || cached.userId !== ADULT.user.id, "the adult's cache is gone");
  assert.equal(h.birthReads(), 0, "no user_birth read signed out");
});

test("a genuine cache still gets this load's user_birth answer (it overwrites a changed age)", async function () {
  /* Cached at 30, but user_birth now answers 15 (birth month corrected). */
  var h = page({ acct: TEEN, session: cacheFor(TEEN.user.id, FORGED_AGE), birthDelay: 20 });
  await wait(320);
  assert.equal(h.birthReads(), 1);
  assert.equal(h.gates().birthAge, 15, "user_birth overwrites the cached value");
  /* Adult reload with its own genuine cache: opens once user_birth answers. */
  var a = page({ acct: ADULT, session: cacheFor(ADULT.user.id, 30), birthDelay: 80 });
  await wait(240);
  assert.equal(a.gates().classroom, false, "closed while pending, even with a genuine cache");
  assert.equal(a.gates().hold, false, "pending: hold keeps the PG-13 post back");
  assert.equal(a.gates().seesR, false, "pending: no R post");
  await wait(150);
  assert.equal(a.gates().birthAge, 30);
  assert.equal(a.gates().classroom, true, "open once user_birth answers");
  assert.equal(a.gates().hold, true);
  assert.equal(a.gates().seesR, true, "R post shows once the adult's age is read");
  assert.deepEqual(h.writes().concat(a.writes()), []);
});

test("in-page sign-out clears the cache; a different user's sign-in writes their own", async function () {
  var h = page({ acct: null });
  await wait(250);
  h.signIn(ADULT);
  await wait(150);
  assert.equal(JSON.parse(h.ss.getItem(KEY)).userId, ADULT.user.id, "cache keyed to the adult");
  h.signOut();
  assert.equal(h.ss.getItem(KEY), null, "sign-out clears it");
  assert.equal(h.swipe.getDatingBirthAge(), null);
  h.signIn(TEEN);
  await wait(150);
  var c = JSON.parse(h.ss.getItem(KEY));
  assert.equal(c.userId, TEEN.user.id, "teen's own cache");
  assert.equal(c.birthAge, 15);
  assert.deepEqual(h.writes(), []);
});
