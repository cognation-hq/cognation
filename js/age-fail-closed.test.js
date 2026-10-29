/**
 * Age fails closed (item 1). The member-editable auth metadata member_age, a
 * demo default or a stale local profile age never opens 18+ content:
 *   - a pending age (signed in, user_birth not read yet) sees G/PG only in
 *     Tower (no PG-13, R or MA), and reads 13 in the COMMUNE 18+ live gates
 *     and Peer Review;
 *   - the signed-out demo sees G/PG only in Tower;
 *   - a signed-in account with no user_birth row sees G/PG only in Tower;
 *   - a 14-year-old with a self-set member_age 99 stays 14 everywhere;
 *   - a real adult gets 18+ once the user_birth age loads;
 *   - nothing here sends a network write.
 * Run: node js/age-fail-closed.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var MEMBER = "cognation.member.profile.v1";

function store(init) {
  var s = Object.assign({}, init || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
    setItem: function (k, v) { s[k] = String(v); },
    removeItem: function (k) { delete s[k]; },
    key: function (i) { return Object.keys(s)[i] || null; },
    get length() { return Object.keys(s).length; },
  };
}
function makeDoc() {
  var ls = {};
  var events = [];
  return {
    events: events,
    readyState: "complete",
    addEventListener: function (t, fn) { (ls[t] = ls[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { events.push(ev.type); (ls[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () { return { setAttribute: function () {}, appendChild: function () {}, style: {}, classList: { add: function () {}, remove: function () {} } }; },
    body: null,
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

/* Tower's ratingViewer(), lifted from js/tower.js so the real code is tested. */
function towerRatingViewerSrc() {
  var src = read("js/tower.js");
  var start = src.indexOf("  function ratingViewer() {");
  assert.ok(start !== -1, "tower.js has ratingViewer");
  var end = src.indexOf("\n  }\n", start);
  return src.slice(start, end + 4);
}

/* user: { id, meta (auth user_metadata), birth: rows | "pending" }, local: prior profile. */
function world(user, local, signedOut) {
  var doc = makeDoc();
  var ls = store(local || {});
  var net = { writes: [], reads: [] };
  var session = signedOut
    ? { source: "demo", username: "demo" }
    : { source: "supabase", supabaseUserId: user.id, username: "member-" + user.id, activeProfileId: "p-" + user.id };
  var win = {
    document: doc,
    localStorage: ls,
    location: { search: "", hash: "", pathname: "/" },
    addEventListener: function () {}, dispatchEvent: function () {},
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationDatingFlag: { enabled: function () { return true; } },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return signedOut ? null : { access_token: "session", user: { id: user.id } }; },
      getUser: function () { return Promise.resolve({ id: user.id, app_metadata: {}, user_metadata: JSON.parse(JSON.stringify(user.meta || {})) }); },
      updateUser: function (data) { net.writes.push({ updateUser: data }); return Promise.resolve({ user_metadata: data }); },
      rest: function (table, opts) {
        var method = String((opts && opts.method) || "GET").toUpperCase();
        if (method !== "GET") net.writes.push({ rest: table, method: method });
        net.reads.push(table);
        if (table === "user_birth") {
          if (user.birth === "pending") return new Promise(function () {});
          return Promise.resolve(user.birth || []);
        }
        return Promise.resolve([]);
      },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: store(), console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
    navigator: { userAgent: "node" },
  });
  function load(rel) { vm.runInContext(read(rel), ctx, { filename: rel }); }
  load("js/auto-rate.js");
  load("js/age-floor-keywords.js");
  load("js/commune-swipe.js");
  load("js/peer-review-room.js");
  load("js/live-stubs.js");
  load("js/seedops-dating-hydrate.js");
  vm.runInContext(towerRatingViewerSrc() + "\nwindow.__towerRatingViewer = ratingViewer;", ctx);
  return {
    win: win, doc: doc, ls: ls, net: net,
    rViewer: function () { return win.__towerRatingViewer(); },
    seesR: function () { return win.CognationAutoRate.canSee("R", win.__towerRatingViewer()); },
    sees: function (rating) { return win.CognationAutoRate.canSee(rating, win.__towerRatingViewer()); },
    liveAge: function () { return win.CognationLive.memberAge(); },
    peerCards: function () {
      var swipe = win.CognationCommuneSwipe;
      var age = typeof swipe.getAccessAge === "function" ? swipe.getAccessAge() : swipe.getMemberProfile().age;
      return win.CognationPeerReview.cards({ field: "nursing", interests: ["nursing"], age: age });
    },
  };
}
function settle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function birthRow(age) {
  var now = new Date();
  return [{ birth_year: now.getFullYear() - age, birth_month: 1 }];
}
function owned(id, fields) {
  var o = {}; o[MEMBER] = JSON.stringify(Object.assign({ ownerUserId: id }, fields)); return o;
}

/* 1) Pending age + self-set member_age 99 (also already on the device): Tower
   G/PG only; the 18+ gates read 13.
   One test per leak so each shows on its own. */
function pendingWorld() {
  var w = world({ id: "u-pend", meta: { member_age: 99, see_dating: true }, birth: "pending" },
    owned("u-pend", { age: 99, interests: ["nursing"] }));
  w.doc.dispatchEvent(new CustomEvent("cognation:session-started"));
  return settle(60).then(function () { return w; });
}
function testPendingTowerR() {
  return pendingWorld().then(function (w) {
    assert.ok(!(w.rViewer().age >= 13), "Tower ratingViewer: pending age is below 13 (got " + w.rViewer().age + ")");
    assert.strictEqual(w.sees("G"), true, "pending sees G");
    assert.strictEqual(w.sees("PG"), true, "pending sees PG");
    assert.strictEqual(w.sees("PG-13"), false, "pending sees no PG-13");
    assert.strictEqual(w.seesR(), false, "R Tower posts stay hidden while the age is pending");
    assert.strictEqual(w.sees("MA"), false, "pending sees no MA");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}
function testPendingCommuneLive() {
  return pendingWorld().then(function (w) {
    assert.strictEqual(w.liveAge(), 13, "COMMUNE 18+ live gate reads 13 while pending (got " + w.liveAge() + ")");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}
function testPendingPeerReview() {
  return pendingWorld().then(function (w) {
    assert.strictEqual(w.peerCards().length, 0, "no 18+ Peer Review cards while the age is pending");
    var swipe = read("js/commune-swipe.js");
    assert.ok(/peer\.cards\(\{[^}]*age: getAccessAge\(\)/.test(swipe), "the deck passes the access age to Peer Review, not the raw profile age");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}

/* 1b) Signed-out demo (no session, even with a leftover profile age 30): G/PG only. */
function testSignedOutDemoGPG() {
  var w = world({ id: "demo", meta: {}, birth: [] }, {}, true);
  w.ls.setItem(MEMBER, JSON.stringify({ age: 30 }));
  return settle(30).then(function () {
    assert.strictEqual(w.sees("G"), true, "demo sees G");
    assert.strictEqual(w.sees("PG"), true, "demo sees PG");
    assert.strictEqual(w.sees("PG-13"), false, "demo sees no PG-13");
    assert.strictEqual(w.seesR(), false, "demo sees no R");
    assert.ok(w.liveAge() < 18, "demo is under the COMMUNE 18+ live gate");
    assert.strictEqual(w.peerCards().length, 0, "demo gets no 18+ Peer Review");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}

/* 1c) Signed in, user_birth read found no row, self-set member_age 99 (also on
   the device): Tower G/PG only; the 18+ gates stay closed. */
function testNoBirthRowGPG() {
  var w = world({ id: "u-nob", meta: { member_age: 99, see_dating: true }, birth: [] },
    owned("u-nob", { age: 99, interests: ["nursing"] }));
  w.doc.dispatchEvent(new CustomEvent("cognation:session-started"));
  return settle(60).then(function () {
    assert.ok(!(w.rViewer().age >= 13), "Tower ratingViewer: no birth row is below 13 (got " + w.rViewer().age + ")");
    assert.strictEqual(w.sees("G"), true, "no birth row sees G");
    assert.strictEqual(w.sees("PG"), true, "no birth row sees PG");
    assert.strictEqual(w.sees("PG-13"), false, "no birth row sees no PG-13");
    assert.strictEqual(w.seesR(), false, "no birth row sees no R");
    assert.strictEqual(w.sees("MA"), false, "no birth row sees no MA");
    assert.ok(w.liveAge() < 18, "COMMUNE 18+ live stays closed with no birth row");
    assert.strictEqual(w.peerCards().length, 0, "no 18+ Peer Review with no birth row");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}

/* 2) A 14-year-old who set member_age 99 in her metadata stays 14. */
function testFourteenStaysFourteen() {
  var w = world({ id: "u-14", meta: { member_age: 99, see_dating: true }, birth: birthRow(14) },
    owned("u-14", { interests: ["nursing"] }));
  w.doc.dispatchEvent(new CustomEvent("cognation:session-started"));
  return settle(120).then(function () {
    var swipe = w.win.CognationCommuneSwipe;
    assert.strictEqual(swipe.getDatingBirthAge(), 14, "user_birth age loaded");
    assert.strictEqual(JSON.parse(w.ls.getItem(MEMBER)).age, 14, "local profile age mirrors user_birth, not member_age 99");
    assert.strictEqual(w.win.CognationAgeFloor.viewerAge(), 14);
    assert.strictEqual(w.rViewer().age, 14, "Tower ratingViewer reads 14");
    assert.strictEqual(w.seesR(), false, "a 14-year-old never sees R posts");
    assert.strictEqual(w.sees("PG-13"), true, "a known 14 still sees PG-13");
    assert.strictEqual(w.liveAge(), 14, "COMMUNE live reads 14");
    assert.strictEqual(w.peerCards().length, 0, "no 18+ Peer Review for 14");
    assert.strictEqual(w.win.CognationSeedOpsDatingHydrate.prefsFromMetadata({ member_age: 99 }).age, undefined, "member_age is never read");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}

/* 3) A real adult keeps 18+ once the user_birth age loads (and not before). */
function testAdultAfterBirthLoads() {
  var w = world({ id: "u-30", meta: {}, birth: birthRow(30) }, owned("u-30", { interests: ["nursing"] }));
  assert.strictEqual(w.seesR(), false, "before user_birth loads: no R");
  w.doc.dispatchEvent(new CustomEvent("cognation:session-started"));
  return settle(120).then(function () {
    assert.strictEqual(w.rViewer().age, 30);
    assert.strictEqual(w.seesR(), true, "adult sees R once the birth age loads");
    assert.strictEqual(w.liveAge(), 30, "adult passes the COMMUNE 18+ live gate");
    assert.ok(w.peerCards().length > 0, "adult gets 18+ Peer Review");
    assert.strictEqual(w.net.writes.length, 0, "no network writes: " + JSON.stringify(w.net.writes));
  });
}

/* 4) setDatingBirthAge re-renders: it updates the local profile and tells the
   Tower feed, Times and deck (member-profile-updated / viewer-age-changed). */
function testBirthAgeReRenders() {
  var w = world({ id: "u-rr", meta: {}, birth: "pending" }, owned("u-rr", {}));
  var swipe = w.win.CognationCommuneSwipe;
  w.doc.events.length = 0;
  swipe.setDatingBirthAge(25);
  assert.ok(w.doc.events.indexOf("cognation:member-profile-updated") !== -1, "member-profile-updated on birth age load");
  assert.ok(w.doc.events.indexOf("cognation:viewer-age-changed") !== -1, "viewer-age-changed on birth age load");
  assert.strictEqual(JSON.parse(w.ls.getItem(MEMBER)).age, 25);
  w.doc.events.length = 0;
  swipe.setDatingBirthAge(null);
  assert.ok(w.doc.events.indexOf("cognation:member-profile-updated") !== -1, "re-render when the age is reset");
  assert.ok(!(JSON.parse(w.ls.getItem(MEMBER)).age > 0), "reset clears the local age");
  assert.strictEqual(w.seesR(), false, "no R once the age is reset");
  var tower = read("js/tower.js");
  assert.ok(/addEventListener\("cognation:viewer-age-changed"/.test(tower), "Tower feed re-renders on viewer-age-changed");
}

/* 5) Removed sources stay removed. */
function testSources() {
  var swipe = read("js/commune-swipe.js");
  assert.ok(swipe.indexOf("syncAgeFromAuthMetadata") === -1, "syncAgeFromAuthMetadata deleted");
  assert.ok(swipe.indexOf("Update your age in your profile") === -1, "stale age hint gone");
  assert.ok(/peer\.cards\(\{[^}]*age: getAccessAge\(\)/.test(swipe), "Peer Review gets the access age, not the raw profile age");
  var hyd = read("js/seedops-dating-hydrate.js");
  var alive = read("js/seedops-commune-alive.js");
  var path_ = read("js/seedops-pathways.js");
  [["js/seedops-dating-hydrate.js", hyd], ["js/seedops-commune-alive.js", alive]].forEach(function (p) {
    assert.ok(!/DEMO_AGE/.test(p[1]), p[0] + ": no DEMO_AGE");
    assert.ok(!/meta\.member_age|meta\.memberAge|prior\.memberAge/.test(p[1]), p[0] + ": never reads member_age / memberAge");
  });
  assert.ok(!/next\.age = 22/.test(path_), "pathways: no age-22 raise");
  var live = read("js/live-stubs.js");
  assert.ok(!/return 21;/.test(live), "live-stubs: no default adult age");
  assert.ok(/viewerAge\(\)/.test(live), "live-stubs reads CognationAgeFloor.viewerAge()");
  assert.ok(!/["']member_age["']\s*:/.test(read("js/login-signup-shell.js")), "sign-up never sends member_age");
}

var failures = [];
[testPendingTowerR, testPendingCommuneLive, testPendingPeerReview, testSignedOutDemoGPG, testNoBirthRowGPG, testFourteenStaysFourteen, testAdultAfterBirthLoads, testBirthAgeReRenders, testSources]
  .reduce(function (chain, t) {
    return chain.then(function () { return t(); }).then(function () {
      console.log("ok - " + t.name);
    }, function (err) {
      failures.push(t.name);
      console.log("not ok - " + t.name + ": " + ((err && err.message) || err));
    });
  }, Promise.resolve())
  .then(function () {
    if (failures.length) { process.exitCode = 1; return; }
    console.log("age-fail-closed ok");
  });
