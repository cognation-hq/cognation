/**
 * Shared device, signed out: A used this browser with live sign-in and left
 * records stamped with A's ownerUserId in cognation.profiles.v1, then signed out.
 * With sign-in configured and no one signed in, the local-record readers #348
 * guarded leave out records stamped to a member (commune-swipe eachProfile lanes,
 * incl. Pro interest; pulse-mutual localRows; tower newsProfessionalPosts ->
 * feedPlate / newsList; circleProfileRecords). Unstamped demo and seed records
 * still show, so the signed-out demo is unchanged. Local preview (sign-in off)
 * and demo sessions are unchanged.
 * Also guarded, signed in or signed out: the PULSE share-row name fallback
 * (cognation.commune.friend-shares.v1), people-search local hits, and the Commune
 * "people you may know" lane (friend records read by id).
 * Real js/accounts.js + reader modules in a vm. No network, no DB.
 * Run: node js/signed-out-leftover-guard.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function memoryStorage() {
  var d = {};
  return { _d: d, getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}

var A_UID = "u-ada";
var B_UID = "u-bea";
var SOON = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16);
var DAY = SOON.slice(0, 10);
var EARLIER = new Date(Date.now() + 2 * 864e5 - 36e5).toISOString().slice(0, 16);
var PHOTO = "https://cdn.test/p.jpg";
var SHARE_AT = Date.now() + 5 * 864e5;

/* A's stamped leftovers (TowerProfileStore.save stamps ownerUserId). */
function aRecords() {
  return {
    "p-ada": { id: "p-ada", kind: "personal", displayName: "ADA PERSONAL", handle: "ada", accountUsername: "ada",
      ownerUserId: A_UID, accountKind: "real", city: "Norman", state: "OK", age: 30, friendIds: ["p-cal"],
      goingLive: { what: "ADA LIVE SALE", when: SOON, where: "Ada yard" } },
    "p-ada-pro": { id: "p-ada-pro", kind: "professional", displayName: "ADA PRO", handle: "ada_pro", accountUsername: "ada",
      ownerUserId: A_UID, city: "Norman", state: "OK",
      marketingAds: [{ id: "ad1", title: "ADA AD", body: "Ada ad body" }],
      publicEvents: [{ id: "ev1", title: "ADA EVENT", when: SOON, where: "Ada hall" }],
      featuredPosts: [{ id: "fp1", title: "ADA NEWS POST", body: "Ada news body", createdAt: "2026-10-30T12:00:00Z", likes: 9 }],
      goingLive: { what: "ADA LIVE SALE", when: SOON, where: "Ada yard" },
      calendarEvents: [{ id: "c1", title: "ADA CAL", date: DAY, public: true, signupFriendIds: ["p-ada", "p-ada-pro"] }] }
  };
}
/* Another member C's stamped leftover (a friend of A). */
function cRecords() {
  return {
    "p-cal": { id: "p-cal", kind: "personal", displayName: "CAL PERSONAL", handle: "cal", accountUsername: "cal",
      ownerUserId: "u-cal", accountKind: "real", city: "Norman", state: "OK", age: 34,
      goingLive: { what: "ADA LIVE SALE", when: SOON, where: "Cal yard" } }
  };
}
function bRecords() {
  return {
    "p-bea": { id: "p-bea", kind: "personal", displayName: "BEA PERSONAL", handle: "bea", accountUsername: "bea",
      ownerUserId: B_UID, accountKind: "real", city: "Norman", state: "OK", age: 31, friendIds: ["p-ada"],
      goingLive: { what: "BEA LIVE SALE", when: EARLIER, where: "Bea yard" } },
    "p-bea-pro": { id: "p-bea-pro", kind: "professional", displayName: "BEA PRO", handle: "bea_pro", accountUsername: "bea",
      ownerUserId: B_UID, city: "Norman", state: "OK",
      marketingAds: [{ id: "ad1", title: "BEA AD", body: "Bea ad body" }],
      publicEvents: [{ id: "ev1", title: "BEA EVENT", when: SOON, where: "Bea hall" }],
      featuredPosts: [{ id: "fp1", title: "BEA NEWS POST", body: "Bea news body", createdAt: "2026-10-30T13:00:00Z", likes: 5 }],
      goingLive: { what: "BEA LIVE SALE", when: EARLIER, where: "Bea yard" } }
  };
}
/* Unstamped demo records (the signed-out demo) and an unstamped seed fleet record. */
function demoRecords() {
  return {
    "prof-demo-zed-pro": { id: "prof-demo-zed-pro", kind: "professional", displayName: "ZED DEMO PRO", handle: "zed_demo", accountUsername: "zed",
      city: "Norman", state: "OK",
      marketingAds: [{ id: "ad1", title: "ZED AD", body: "Zed ad body" }],
      publicEvents: [{ id: "ev1", title: "ZED EVENT", when: SOON, where: "Zed hall" }],
      featuredPosts: [{ id: "fp1", title: "ZED NEWS POST", body: "Zed news", createdAt: "2026-10-28T12:00:00Z", likes: 2 }],
      goingLive: { what: "ZED LIVE", when: SOON, where: "Zed yard" } },
    "prof-demo-yan": { id: "prof-demo-yan", kind: "personal", displayName: "YAN DEMO", handle: "yan_demo", accountUsername: "yan",
      city: "Norman", state: "OK", age: 28, goingLive: { what: "ZED LIVE", when: SOON, where: "Yan yard" } },
    "prof-seed-0042": { id: "prof-seed-0042", kind: "personal", displayName: "SEED DATE", handle: "seed_0042",
      accountKind: "seed", seedFleetId: "seed-0042", city: "Norman", state: "OK", age: 29, datingContent: true, avatarDataUrl: PHOTO }
  };
}
/* cognation.commune.friend-shares.v1 as recordShare writes it: A and C shared the
   same ad (C's record is not on this device); demo shares from demo records. */
function shares(opts) {
  var out = [];
  if (opts.withAShares) {
    out.push({ id: "share-ad9-a", adId: "ad9", title: "SHARED AD", body: "x", sharerName: "ADA PERSONAL", swiperId: "p-ada", swiperIsSeed: false, interests: ["music"], at: SHARE_AT });
    out.push({ id: "share-ad9-c", adId: "ad9", title: "SHARED AD", body: "x", sharerName: "CAL GONE", swiperId: "p-cal-gone", swiperIsSeed: false, interests: ["music"], at: SHARE_AT + 1000 });
  }
  if (opts.withDemoShares) {
    out.push({ id: "share-ad8-z", adId: "ad8", title: "DEMO AD", body: "y", sharerName: "ZED DEMO PRO", swiperId: "prof-demo-zed-pro", swiperIsSeed: false, interests: ["music"], at: SHARE_AT + 2000 });
    out.push({ id: "share-ad8-y", adId: "ad8", title: "DEMO AD", body: "y", sharerName: "YAN DEMO", swiperId: "prof-demo-yan", swiperIsSeed: false, interests: ["music"], at: SHARE_AT + 3000 });
  }
  return out;
}

var B_SESSION = { source: "supabase", supabaseUserId: B_UID, username: "bea", activeProfileId: "p-bea" };
var DEMO_SESSION = { source: "demo", username: "alexa", activeProfileId: "p-ada" };

/* mode: "live" (sign-in configured) or "off" (local preview). */
function boot(opts) {
  var ls = memoryStorage();
  var profiles = Object.assign({}, opts.noA ? {} : aRecords(), opts.withC ? cRecords() : {},
    opts.withB ? bRecords() : {}, opts.noDemo ? {} : demoRecords());
  ls.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  ls.setItem("cognation.commune.seeDating.v1", "1");
  var sh = shares(opts);
  if (sh.length) ls.setItem("cognation.commune.friend-shares.v1", JSON.stringify(sh));
  if (opts.session) ls.setItem("cognation.session.v2", JSON.stringify(opts.session));
  var configured = opts.mode === "live";
  var signedIn = configured && opts.session && opts.session.source === "supabase";
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var win = {
    document: doc, localStorage: ls, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/", search: "" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationDatingFlag: { enabled: function () { return true; } },
    CognationSupabase: {
      configured: function () { return configured; },
      getSession: function () { return signedIn ? { access_token: "t", user: { id: opts.session.supabaseUserId } } : null; }
    },
    CognationAuth: { getSession: function () { var r = ls.getItem("cognation.session.v2"); return r ? JSON.parse(r) : null; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, URLSearchParams: URLSearchParams,
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {},
  });
  vm.runInContext(src("js/accounts.js"), ctx);
  vm.runInContext(src("js/pulse-mutual.js"), ctx);
  vm.runInContext(src("js/people-search.js"), ctx);
  vm.runInContext(src("js/commune-swipe.js"), ctx);
  vm.runInContext(src("js/auto-rate.js"), ctx);
  vm.runInContext(src("js/tower.js"), ctx);
  var swipe = win.CognationCommuneSwipe;
  if (swipe && typeof swipe.setDatingBirthAge === "function") swipe.setDatingBirthAge(32);
  if (opts.viewerReal && swipe && typeof swipe.noteViewerSeedStatus === "function") swipe.noteViewerSeedStatus(false);
  return { win: win, ls: ls, ctx: ctx };
}

function surfaces(p) {
  var w = p.win;
  var deck = [];
  ["personal", "professional"].forEach(function (mode) {
    try { deck = deck.concat(w.CognationCommuneSwipe.sampleDeck(120, mode) || []); } catch (e) { deck.push({ id: "error", error: String(e && e.stack || e) }); }
  });
  var pulse = w.CognationPulseMutual.localRows(p.ls);
  var plate = w.CognationTowerStore.feedPlate().filter(function (x) { return x.towerKind === "professional"; });
  var news = w.CognationTowerStore.newsList();
  var search = {};
  ["ada", "cal", "bea", "zed", "yan"].forEach(function (q) { search[q] = w.CognationPeopleDirectory.search(q); });
  var know = [];
  try { know = w.CognationCommuneSwipe.peopleYouMayKnowCards() || []; } catch (e) { know = [{ id: "error " + e.message }]; }
  return { deck: deck, pulse: pulse, plate: plate, news: news, search: search, know: know };
}
function ids(s) {
  return {
    deck: Array.from(s.deck, function (c) { return String(c.id); }),
    pulse: Array.from(s.pulse, function (r) { return String(r.profile_id); }),
    pulseNames: Array.from(s.pulse, function (r) { return String(r.display_name); }),
    plate: Array.from(s.plate, function (x) { return String(x.id); }),
    news: Array.from(s.news, function (x) { return String(x.id); }),
    search: Object.keys(s.search).reduce(function (o, q) { o[q] = Array.from(s.search[q], function (r) { return String(r.id); }); return o; }, {}),
    know: Array.from(s.know, function (c) { return String(c.id); })
  };
}
function some(list, re) { return list.some(function (id) { return re.test(id); }); }
function none(list, re) { return list.filter(function (id) { return re.test(id); }); }
var MEMBER = /p-ada|p-cal/;

/* 1. A signed out; a signed-out visitor (sign-in configured) sees none of A's
   stamped records in the #348 readers. The unstamped demo/seed records still show. */
function testSignedOutSeesNoneOfA() {
  var s = ids(surfaces(boot({ mode: "live" })));
  assert.deepStrictEqual(none(s.deck, /error/), [], "deck builds");
  assert.deepStrictEqual(none(s.deck, MEMBER), [], "no A ads, events or going-live in the signed-out Commune deck");
  assert.deepStrictEqual(none(s.pulse, MEMBER), [], "no A PULSE rows");
  assert.deepStrictEqual(none(s.plate, MEMBER), [], "no A News posts (feedPlate)");
  assert.deepStrictEqual(none(s.news, MEMBER), [], "no A News posts (newsList)");
  assert.ok(some(s.deck, /^ad-prof-demo-zed-pro-ad1/), "demo ad still shows");
  assert.ok(some(s.deck, /^event-prof-demo-zed-pro-ev1/), "demo event still shows");
  assert.ok(some(s.deck, /^content-live-prof-demo-zed-pro/), "demo going-live still shows");
  assert.deepStrictEqual(s.plate, ["pro-prof-demo-zed-pro-fp1"], "demo News post still shows");
  assert.deepStrictEqual(s.pulse.slice().sort(), ["prof-demo-yan", "prof-demo-zed-pro"], "demo PULSE rows still show");
  assert.deepStrictEqual(s.search.zed, ["prof-demo-zed-pro"], "demo search hit still shows");
}

/* 2. PULSE share-row name fallback: A's (and an absent member's) share entries
   never surface as names, signed out or signed in as B. Demo shares still do. */
function testPulseShareFallback() {
  var out = ids(surfaces(boot({ mode: "live", withAShares: true, noDemo: true })));
  assert.deepStrictEqual(out.pulseNames, [], "signed out: no A / C share names in PULSE");
  var bIn = ids(surfaces(boot({ mode: "live", session: B_SESSION, withB: true, withAShares: true })));
  assert.deepStrictEqual(none(bIn.pulseNames, /ADA|CAL/), [], "B signed in: no A / C share names in PULSE");
  var demo = ids(surfaces(boot({ mode: "live", noA: true, withDemoShares: true })));
  assert.deepStrictEqual(demo.pulseNames.slice().sort(), ["YAN DEMO", "ZED DEMO PRO"], "signed-out demo shares still show");
}

/* 3. People search: local hits leave out other members' pages (signed out: any
   stamped page). B's own page and demo hits are unchanged. */
function testPeopleSearch() {
  var out = ids(surfaces(boot({ mode: "live", withC: true })));
  assert.deepStrictEqual(out.search.ada, [], "signed out: no local hit for A's stamped pages");
  assert.deepStrictEqual(out.search.cal, [], "signed out: no local hit for C's stamped page");
  var bIn = ids(surfaces(boot({ mode: "live", session: B_SESSION, withB: true, withC: true })));
  assert.deepStrictEqual(bIn.search.ada, [], "B signed in: no local hit for A");
  assert.deepStrictEqual(bIn.search.bea.slice().sort(), ["p-bea", "p-bea-pro"], "B signed in: B's own pages still found");
}

/* 4. "People you may know": B is a friend of A on the server; A's local leftover
   (with A's friend list) must not suggest A's friends from local records. */
function testPeopleYouMayKnow() {
  var bIn = ids(surfaces(boot({ mode: "live", session: B_SESSION, withB: true, withC: true, viewerReal: true })));
  assert.deepStrictEqual(bIn.know, [], "B signed in: no suggestion read from A's or C's local record");
}

/* 5. Unchanged: local preview (sign-in off) and a demo session list every local
   record, shares and search hits as before. (People you may know only runs for a
   live signed-in viewer: elsewhere the viewer has no age band.) */
function testUnchangedPaths() {
  [
    { label: "local preview, no session", opts: { mode: "off", withC: true, withAShares: true } },
    { label: "local preview, B session", opts: { mode: "off", session: B_SESSION, withB: true, withC: true, withAShares: true, viewerReal: true } },
    { label: "demo session, sign-in configured", opts: { mode: "live", session: DEMO_SESSION, withC: true, withAShares: true } }
  ].forEach(function (c) {
    var s = ids(surfaces(boot(c.opts)));
    assert.ok(some(s.deck, /^event-p-ada-pro-ev1/), c.label + ": A event listed as before");
    assert.ok(some(s.deck, /^content-live-p-ada/), c.label + ": A going-live listed as before");
    assert.ok(s.plate.indexOf("pro-p-ada-pro-fp1") >= 0, c.label + ": A News post as before");
    assert.ok(s.search.ada.length > 0, c.label + ": A search hit as before");
    assert.ok(s.pulseNames.indexOf("CAL GONE") >= 0, c.label + ": share fallback name as before");
  });
}

[testSignedOutSeesNoneOfA, testPulseShareFallback, testPeopleSearch, testPeopleYouMayKnow, testUnchangedPaths].forEach(function (t) {
  if (!process.env.SOG_DUMP) require("node:test").test(t.name, t);
});

module.exports = { boot: boot, surfaces: surfaces, B_SESSION: B_SESSION, DEMO_SESSION: DEMO_SESSION };
