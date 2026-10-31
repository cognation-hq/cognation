/**
 * Shared device, local-record readers: A (Personal + Pro) used this browser and
 * left records in cognation.profiles.v1; B signs in on the same browser with live
 * sign-in configured. Readers that list local records show only B's own records
 * (server data covers everyone else):
 *   commune-swipe eachProfile lanes (placed ads, public events, dating pool,
 *   Tower going-live content, Pro interest), pulse-mutual localRows,
 *   tower.js newsProfessionalPosts (feedPlate / newsList) and circleProfileRecords.
 * B's own local records still show. Demo session and local preview (sign-in
 * off) are unchanged. Seed/ops viewers keep the unstamped seed fleet records the
 * SeedOps hydrates write (live seed dating pool).
 * Real js/accounts.js + reader modules in a vm. No network, no DB.
 * Run: node js/local-reader-owner-guard.test.js
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

/* A's leftovers: stamped Personal + Pro (TowerProfileStore.save) and an older
   unstamped Pro copy (written before ownership stamps). */
function aRecords() {
  return {
    "p-ada": { id: "p-ada", kind: "personal", displayName: "ADA PERSONAL", handle: "ada", accountUsername: "ada",
      ownerUserId: A_UID, city: "Norman", state: "OK", age: 30, datingContent: true, avatarDataUrl: PHOTO,
      goingLive: { what: "ADA LIVE SALE", when: SOON, where: "Ada yard" } },
    "p-ada-pro": { id: "p-ada-pro", kind: "professional", displayName: "ADA PRO", handle: "ada_pro", accountUsername: "ada",
      ownerUserId: A_UID, city: "Norman", state: "OK",
      marketingAds: [{ id: "ad1", title: "ADA AD", body: "Ada ad body" }],
      publicEvents: [{ id: "ev1", title: "ADA EVENT", when: SOON, where: "Ada hall" }],
      featuredPosts: [{ id: "fp1", title: "ADA NEWS POST", body: "Ada news body", createdAt: "2026-10-30T12:00:00Z", likes: 9 }],
      goingLive: { what: "ADA LIVE SALE", when: SOON, where: "Ada yard" },
      calendarEvents: [{ id: "c1", title: "ADA CAL", date: DAY, public: true, signupFriendIds: ["p-ada", "p-ada-pro"] }] },
    "p-ada-old": { id: "p-ada-old", kind: "professional", displayName: "ADA OLD PRO", handle: "ada_old", accountUsername: "ada",
      marketingAds: [{ id: "ad2", title: "ADA OLD AD", body: "Ada old ad" }],
      featuredPosts: [{ id: "fp2", title: "ADA OLD NEWS", body: "Ada old news", createdAt: "2026-10-29T12:00:00Z", likes: 3 }] }
  };
}
function bRecords() {
  return {
    "p-bea": { id: "p-bea", kind: "personal", displayName: "BEA PERSONAL", handle: "bea", accountUsername: "bea",
      ownerUserId: B_UID, city: "Norman", state: "OK", age: 31,
      goingLive: { what: "BEA LIVE SALE", when: EARLIER, where: "Bea yard" } },
    "p-bea-pro": { id: "p-bea-pro", kind: "professional", displayName: "BEA PRO", handle: "bea_pro", accountUsername: "bea",
      ownerUserId: B_UID, city: "Norman", state: "OK",
      marketingAds: [{ id: "ad1", title: "BEA AD", body: "Bea ad body" }],
      publicEvents: [{ id: "ev1", title: "BEA EVENT", when: SOON, where: "Bea hall" }],
      featuredPosts: [{ id: "fp1", title: "BEA NEWS POST", body: "Bea news body", createdAt: "2026-10-30T13:00:00Z", likes: 5 }],
      goingLive: { what: "BEA LIVE SALE", when: EARLIER, where: "Bea yard" } }
  };
}
/* Unstamped seed fleet record (seedops hydrates, seed sessions only). */
function seedRecords() {
  return {
    "prof-seed-0042": { id: "prof-seed-0042", kind: "personal", displayName: "SEED DATE", handle: "seed_0042",
      accountKind: "seed", seedFleetId: "seed-0042", city: "Norman", state: "OK", age: 29, datingContent: true, avatarDataUrl: PHOTO }
  };
}

var B_SESSION = { source: "supabase", supabaseUserId: B_UID, username: "bea", activeProfileId: "p-bea" };
var SEED_SESSION = { source: "supabase", supabaseUserId: "u-seed-7", username: "seed7", activeProfileId: "p-seed7", accountKind: "seed" };
var DEMO_SESSION = { source: "demo", username: "alexa", activeProfileId: "p-ada" };

/* mode: "live" (sign-in configured, session given), "off" (local preview). */
function boot(opts) {
  var ls = memoryStorage();
  var b = bRecords();
  if (opts.bUnstamped) delete b["p-bea"].ownerUserId;
  var profiles = Object.assign({}, aRecords(), opts.withB ? b : {}, opts.withSeed ? seedRecords() : {});
  /* The seed viewer's own (stamped) record: their city for the local dating pool. */
  if (opts.seedViewer) profiles["p-seed7"] = { id: "p-seed7", kind: "personal", displayName: "SEED VIEWER", handle: "seed7",
    accountUsername: "seed7", accountKind: "seed", ownerUserId: "u-seed-7", city: "Norman", state: "OK", age: 33 };
  ls.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  ls.setItem("cognation.commune.seeDating.v1", "1");
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
    document: doc, localStorage: ls, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationDatingFlag: { enabled: function () { return true; } },
    CognationSupabase: {
      configured: function () { return configured; },
      getSession: function () { return signedIn ? { access_token: "t", user: { id: opts.session.supabaseUserId } } : null; }
    },
    CognationAuth: { getSession: function () { var r = ls.getItem("cognation.session.v2"); return r ? JSON.parse(r) : null; } },
  };
  if (opts.seedViewer) win.CognationSeedOpsCommuneAlive = { isSeedOrOpsSession: function () { return true; } };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {},
  });
  vm.runInContext(src("js/accounts.js"), ctx);
  vm.runInContext(src("js/pulse-mutual.js"), ctx);
  vm.runInContext(src("js/commune-swipe.js"), ctx);
  vm.runInContext(src("js/auto-rate.js"), ctx);
  vm.runInContext(src("js/tower.js"), ctx);
  var swipe = win.CognationCommuneSwipe;
  if (swipe && typeof swipe.setDatingBirthAge === "function") swipe.setDatingBirthAge(32);
  return { win: win, ls: ls, ctx: ctx };
}

function surfaces(p) {
  var w = p.win;
  var deck = [];
  ["personal", "professional"].forEach(function (mode) {
    try { deck = deck.concat(w.CognationCommuneSwipe.sampleDeck(120, mode) || []); } catch (e) { deck.push({ error: String(e && e.stack || e) }); }
  });
  var pulse = w.CognationPulseMutual.localRows(p.ls);
  var plate = w.CognationTowerStore.feedPlate().filter(function (x) { return x.towerKind === "professional"; });
  var circle = vm.runInContext("typeof circleProfileRecords", p.ctx);
  return { deck: deck, pulse: pulse, plate: plate, circle: circle };
}
function text(x) { return JSON.stringify(x); }

function ids(s) {
  return {
    deck: Array.from(s.deck, function (c) { return String(c.id || c.error); }),
    pulse: Array.from(s.pulse, function (r) { return String(r.profile_id); }),
    plate: Array.from(s.plate, function (x) { return String(x.id); })
  };
}
function hasAda(list) { return list.filter(function (id) { return /p-ada/.test(id); }); }
function some(list, re) { return list.some(function (id) { return re.test(id); }); }

/* 1. B signed in on A's browser: nothing of A's renders; B's own records do. */
function testBSeesNoneOfA() {
  var s = ids(surfaces(boot({ mode: "live", session: B_SESSION, withB: true })));
  assert.deepStrictEqual(s.deck.filter(function (id) { return /error/i.test(id); }), [], "deck builds");
  assert.deepStrictEqual(hasAda(s.deck), [], "no A ads, events, going-live or dating cards in B's Commune deck");
  assert.ok(!some(s.deck, /^date-/), "no A dating entry");
  assert.deepStrictEqual(hasAda(s.pulse), [], "no A PULSE rows");
  assert.deepStrictEqual(hasAda(s.plate), [], "no A News posts (feedPlate / newsList)");
  assert.ok(some(s.deck, /^ad-p-bea-pro-ad1/), "B's own ad still shows");
  assert.ok(some(s.deck, /^event-p-bea-pro-ev1/), "B's own public event still shows");
  assert.ok(some(s.deck, /^content-live-p-bea/), "B's own going-live still shows");
  assert.deepStrictEqual(s.pulse.slice().sort(), ["p-bea", "p-bea-pro"], "B's own PULSE rows still show");
  assert.deepStrictEqual(s.plate, ["pro-p-bea-pro-fp1"], "B's own News post still shows");
}

/* 2. Only A's leftovers on the device: B's local readers are empty of A. */
function testBWithOnlyALeftovers() {
  var s = ids(surfaces(boot({ mode: "live", session: B_SESSION })));
  assert.deepStrictEqual(hasAda(s.deck), [], "deck");
  assert.deepStrictEqual(s.pulse, [], "PULSE");
  assert.deepStrictEqual(s.plate, [], "News");
}

/* 3. B's own record without an ownership stamp (B's active profile) still shows. */
function testBUnstampedOwnRecord() {
  var s = ids(surfaces(boot({ mode: "live", session: B_SESSION, withB: true, bUnstamped: true })));
  assert.ok(some(s.deck, /^content-live-p-bea(-r\d+)?$/), "B's active profile (unstamped) going-live still shows");
  assert.deepStrictEqual(hasAda(s.deck), [], "still nothing of A's");
}

/* 4. Seed/ops viewer: the unstamped seed fleet records (seedops hydrates) stay in
   the dating pool; A's member records do not render. */
function testSeedViewerKeepsFleet() {
  var s = ids(surfaces(boot({ mode: "live", session: SEED_SESSION, withSeed: true, seedViewer: true })));
  assert.ok(some(s.deck, /^date-prof-seed-0042/), "seed fleet dating entry stays for a seed viewer");
  assert.deepStrictEqual(hasAda(s.deck), [], "no A records for a seed viewer");
  assert.deepStrictEqual(hasAda(s.plate), [], "no A News posts for a seed viewer");
}
function testRealViewerNoUnstampedFleet() {
  var s = ids(surfaces(boot({ mode: "live", session: B_SESSION, withSeed: true })));
  assert.ok(!some(s.deck, /prof-seed-0042/), "a real viewer never gets a seed fleet record");
}

/* 5. Unchanged paths: local preview (sign-in off) and a demo session. The readers
   still list every local record, as before. (Signed out with sign-in configured:
   member-stamped records are left out, js/signed-out-leftover-guard.test.js.) */
function testUnchangedPaths() {
  [
    { label: "local preview, sign-in off, no session", opts: { mode: "off", withB: true } },
    { label: "local preview, sign-in off, B session", opts: { mode: "off", session: B_SESSION, withB: true } },
    { label: "signed-out demo", opts: { mode: "live", session: DEMO_SESSION, withB: true } }
  ].forEach(function (c) {
    var s = ids(surfaces(boot(c.opts)));
    assert.ok(some(s.deck, /^event-p-ada-pro-ev1/), c.label + ": A event listed as before");
    assert.ok(some(s.deck, /^content-live-p-ada/), c.label + ": A going-live listed as before");
    assert.deepStrictEqual(s.plate, ["pro-p-ada-pro-fp1", "pro-p-ada-old-fp2", "pro-p-bea-pro-fp1"], c.label + ": News plate as before");
    assert.deepStrictEqual(s.pulse.slice().sort(), ["p-ada", "p-ada-pro"], c.label + ": PULSE as before");
  });
}

/* 6. tower circleProfileRecords (Circle "friends follow" topics) reads through the guard. */
function testCircleRecordsGuarded() {
  var tower = src("js/tower.js");
  var start = tower.indexOf("function circleProfileRecords()");
  var body = tower.slice(start, tower.indexOf("\n  }\n", start));
  assert.ok(/localRecordVisible/.test(body), "circleProfileRecords filters through CognationAccounts.localRecordVisible");
}

[testBSeesNoneOfA, testBWithOnlyALeftovers, testBUnstampedOwnRecord, testSeedViewerKeepsFleet,
  testRealViewerNoUnstampedFleet, testUnchangedPaths, testCircleRecordsGuarded].forEach(function (t) {
  if (!process.env.LRG_DUMP) require("node:test").test(t.name, t);
});

module.exports = { boot: boot, surfaces: surfaces };
if (require.main === module && process.env.LRG_DUMP) {
  var o = JSON.parse(process.env.LRG_DUMP);
  if (o.session) o.session = { B: B_SESSION, SEED: SEED_SESSION, DEMO: DEMO_SESSION }[o.session];
  var s = surfaces(boot(o));
  console.log(text(s.deck.map(function (c) { return c.id + "|" + (c.title || c.error); })));
  console.log(text(s.pulse));
  console.log(text(s.plate.map(function (x) { return x.id; })));
}
