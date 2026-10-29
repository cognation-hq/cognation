/**
 * Signed in, a viewer's age comes ONLY from user_birth (#309 rule). The local
 * member profile's age is never read, even when it is the viewer's own
 * (ownerUserId matches the session). Signed in with the user_birth age pending,
 * missing, or on a page with no user_birth reader = age 0 (fail closed).
 *
 * A signed-in viewer whose own local profile was edited to age 30 opens nothing
 * on every page that loads age-floor-keywords:
 *   index before deferred commune-swipe loads, index after it loads (user_birth
 *   still pending), feed-rating.html and calendar.html.
 * Covered: R/PG-13 (Tower, AutoRate, feed photos, news comments), 18+ (dating,
 * speed dating, 18-21 / 21+ rooms, Marketplace 18+/21+ posts and bids, auction
 * bids), Classroom (COMMUNE Classroom, calendar sessions) and Peer Review.
 * When user_birth arrives the real age applies. A signed-in control and a
 * signed-in SEED (a seed is a signed-in account, never a demo viewer) with a
 * stored birth date of 30 open the gates. No network writes.
 *
 * Real modules in a vm window, in each page's script order.
 * Run: node js/signed-in-age-birth-only.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var MEMBER = "cognation.member.profile.v1";
var TOWER_KEY = "cognation.tower.posts.v3";
/* Test values built at runtime. */
var VIEWER_ID = ["u", "viewer", "si"].join("-");
var SEED_ID = ["u", "seed", "si"].join("-");
var EDITED_AGE = 10 * 3;
var BIRTH_AGE = 10 * 3;

var PAGES = {
  /* index.html: age-floor-keywords early, the rest deferred; commune-swipe not yet run. */
  "index-pre": ["js/auto-rate.js", "js/age-floor-keywords.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js",
    "js/classroom-sessions.js", "js/news-comments.js"],
  "index": ["js/auto-rate.js", "js/age-floor-keywords.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js",
    "js/classroom-sessions.js", "js/news-comments.js", "js/commune-swipe.js", "js/peer-review-room.js",
    "js/commune-messages.js", "js/live-stubs.js", "js/seedops-dating-hydrate.js"],
  "feed-rating": ["js/accounts.js", "js/age-floor-keywords.js", "js/tower.js"],
  "calendar": ["js/age-floor-keywords.js", "js/classroom-sessions.js"],
};

function store(init) {
  var s = Object.assign({}, init || {});
  return {
    _s: s,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
    setItem: function (k, v) { s[k] = String(v); },
    removeItem: function (k) { delete s[k]; },
    key: function (i) { return Object.keys(s)[i] || null; },
    get length() { return Object.keys(s).length; },
  };
}
function el(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), innerHTML: "", textContent: "", value: "", style: {}, hidden: false,
    attrs: {}, children: [], parentNode: null, _q: {},
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute: function (k) { delete this.attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore: function (c) { return this.appendChild(c); },
    addEventListener: function () {}, removeEventListener: function () {},
    querySelector: function (sel) {
      if (sel === "[data-auction-room]" || sel === "[data-commune-room-log]") return null;
      if (!this._q[sel]) this._q[sel] = el("div");
      return this._q[sel];
    },
    querySelectorAll: function () { return []; },
    closest: function () { return null; }, focus: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

var POSTS = [
  { id: "g", authorName: "Sam", handle: "sam", body: "Blue mug for sale #market", createdAt: "2026-10-20T19:00:00.000Z", rating: "G", lat: 41.88, lng: -87.63 },
  { id: "r18", authorName: "Dana", handle: "dana", body: "Wine glasses, set of six, 18+ only #market", createdAt: "2026-10-20T18:00:00.000Z", rating: "R", lat: 41.88, lng: -87.63 },
  { id: "a21", authorName: "Lee", handle: "lee", body: "Homebrew beer kit, 21+ #market", createdAt: "2026-10-20T17:00:00.000Z", rating: "PG-13", lat: 41.88, lng: -87.63 },
];

/* opts.page: a PAGES key. opts.seed: sign in as a seed account. opts.birth:
   "pending" (user_birth read never answers), "none" (no row), or "now". */
function world(opts) {
  var uid = opts.seed ? SEED_ID : VIEWER_ID;
  var listeners = {};
  var doc = {
    readyState: "complete", body: el("body"),
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; }, createElement: function (tag) { return el(tag); },
  };
  var net = { writes: [], reads: [] };
  var session = { source: "supabase", supabaseUserId: uid, username: "viewer", activeProfileId: "p-" + uid };
  if (opts.seed) { session.accountKind = "seed"; session.seedFleetId = ["seed", "fleet", "01"].join("-"); }
  var local = {};
  /* The viewer's OWN local profile (ownerUserId matches), edited to 30. */
  local[MEMBER] = JSON.stringify({ age: EDITED_AGE, field: "Nursing", interests: ["nursing"], lat: 41.88, lng: -87.63, ownerUserId: uid });
  local["cognation.session.v2"] = JSON.stringify(session);
  local["cognation.commune.seeDating.v1"] = "1";
  local[TOWER_KEY] = JSON.stringify({ version: 2, posts: POSTS });
  var ls = store(local);
  var ss = store({});
  var birthRelease = null;
  var birthGate = opts.birth === "pending" ? new Promise(function (r) { birthRelease = r; }) : Promise.resolve();
  var birthRow = function () {
    if (opts.birth === "none") return [];
    return [{ birth_year: new Date().getFullYear() - (opts.birthAge || BIRTH_AGE), birth_month: 1 }];
  };
  var win = {
    document: doc, localStorage: ls, sessionStorage: ss,
    location: { search: "", hash: "", pathname: "/" + opts.page + ".html", href: "https://cognation.test/" + opts.page + ".html" },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    CustomEvent: CustomEvent,
    __COGNATION_CLASSROOM_NO_BOOT__: true,
    CognationAuth: { getSession: function () { return JSON.parse(JSON.stringify(session)); } },
    CognationSeedOpsLog: { write: function () {} },
    CognationDatingFlag: { enabled: function () { return true; } }, /* forced on: the age is the only gate left */
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t-" + uid, user: { id: uid } }; },
      getUser: function () { return Promise.resolve({ id: uid, app_metadata: {}, user_metadata: {} }); },
      updateUser: function (data) { net.writes.push({ updateUser: Object.keys(data || {}) }); return Promise.resolve(null); },
      rpc: function (name) { net.writes.push({ rpc: name }); return Promise.resolve(false); },
      rest: function (table, o) {
        var method = String((o && o.method) || "GET").toUpperCase();
        if (method !== "GET") { net.writes.push({ rest: table, method: method }); return Promise.resolve([]); }
        net.reads.push(table);
        if (table === "user_birth") return birthGate.then(birthRow);
        return Promise.resolve([]);
      },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: ss, location: win.location,
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
    CustomEvent: CustomEvent, URL: URL, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, navigator: { userAgent: "node" },
    fetch: function (url, o) {
      var method = String((o && o.method) || "GET").toUpperCase();
      if (method !== "GET") net.writes.push({ fetch: method });
      return Promise.reject(new Error("offline"));
    },
  });
  PAGES[opts.page].forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });
  var swipe = win.CognationCommuneSwipe || null;
  if (swipe) swipe.setSeeDating(true);
  var rooms = {};
  if (swipe) swipe.siteRoomCatalog().forEach(function (r) { rooms[r.gate] = r; });

  function classRow(id, rating) {
    var start = Date.now() + 60 * 60000;
    return { id: id, title: "Session " + id, kind: "classroom", status: "scheduled", rating: rating,
      starts_at: new Date(start).toISOString(), ends_at: new Date(start + 45 * 60000).toISOString(),
      host_profile_id: "h-" + id,
      host: { id: "h-" + id, handle: "host" + id, display_name: "Host " + id, kind: "professional", account_kind: "real", user_id: "h-user-" + id } };
  }
  return {
    win: win, net: net, swipe: swipe, floor: win.CognationAgeFloor,
    releaseBirth: function () { if (birthRelease) birthRelease(); },
    emit: function (type, detail) { doc.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); },
    has: function (name) { return !!win[name]; },
    roomOpen: function (gate) {
      var room = rooms[gate];
      assert.ok(room, "site room for gate " + gate);
      return swipe.visibleSiteRooms().some(function (r) { return r.id === room.id; });
    },
    towerSees: function (rating, body) {
      return !!win.CognationTowerPostVisibleToViewer({ id: "t-" + rating, authorName: "Ana", body: body || "Late show recap", rating: rating });
    },
    remoteHeld: function (rating) {
      return !!win.CognationTowerStore.holdRemotePost({ id: "rm-" + rating, _remote: true, authorName: "Ana", body: "Late show recap", rating: rating });
    },
    autoRate: function (rating) { return win.CognationAutoRate.canSee(rating, { age: win.CognationAgeFloor.viewerAge() }); },
    feedPhoto: function (rating) {
      return win.CognationFeedPhotos.html([{ kind: "photo", dataUrl: "data:image/gif;base64,R0lGOD", rating: rating }]).indexOf("<img") !== -1;
    },
    newsThread: function (rating) { return win.CognationNewsComments.isThreadVisible(rating); },
    agenda: function () {
      var api = win.CognationClassroomSessions;
      var rows = [classRow("g", "G"), classRow("p13", "PG-13"), classRow("r", "R")].map(api.normalizeRow);
      return api.publicAgenda(rows, {}).map(function (s) { return s.rating; }).join(",");
    },
    bidNote: function () {
      var mug = Array.prototype.filter.call(swipe.marketplaceCards(), function (c) { return /-g$/.test(c.id); })[0];
      assert.ok(mug, "the G Marketplace card stays");
      var m = /data-market-bid-note>([^<]*)</.exec(swipe.renderCard(mug).innerHTML);
      return m ? m[1] : null;
    },
    marketIds: function () {
      return Array.prototype.map.call(swipe.marketplaceCards(), function (c) { return String(c.id).replace(/^market-/, ""); }).sort().join(",");
    },
    auctionBid: function () {
      var panel = el("section");
      win.CognationAuctionRoom.mount(panel, { id: "auction-1", type: "pro-auction" }, swipe.getMemberAge());
      return panel.children.some(function (c) { return /data-auction-bid/.test(c.innerHTML); });
    },
    peerCards: function () {
      return win.CognationPeerReview.cards({ field: "nursing", interests: ["nursing"], age: swipe.getMemberAge() }).length;
    },
  };
}

function settle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Every gate the page has, for a signed-in viewer whose user_birth age is not in yet. */
function closed(w, label) {
  assert.ok(w.floor.sessionUserId(), label + ": signed in");
  assert.strictEqual(w.floor.viewerAge(), 0, label + ": viewerAge 0, not the own local age 30");
  if (w.has("CognationTowerPostVisibleToViewer")) {
    assert.strictEqual(w.towerSees("R"), false, label + ": no R Tower post");
    assert.strictEqual(w.towerSees("PG-13"), false, label + ": no PG-13 Tower post");
    assert.strictEqual(w.towerSees("G", "Bar crawl tonight, 21+ only"), false, label + ": no 21+ keyword Tower post");
    assert.strictEqual(w.remoteHeld("R"), false, label + ": no R server post");
    assert.strictEqual(w.feedPhoto("R"), false, label + ": no R feed photo");
    assert.strictEqual(w.feedPhoto("PG-13"), false, label + ": no PG-13 feed photo");
  }
  if (w.has("CognationAutoRate")) {
    assert.strictEqual(w.autoRate("R"), false, label + ": AutoRate refuses R");
    assert.strictEqual(w.autoRate("PG-13"), false, label + ": AutoRate refuses PG-13");
  }
  if (w.has("CognationNewsComments")) {
    assert.strictEqual(w.newsThread("PG-13"), false, label + ": no PG-13 news thread");
    assert.strictEqual(w.newsThread("R"), false, label + ": no R news thread");
  }
  if (w.has("CognationClassroomSessions")) {
    /* Unknown age is 0 (PM ruling, #309): G/PG sessions only. The server's 13 default is a separate backstop. */
    assert.strictEqual(w.agenda(), "G", label + ": G/PG classroom sessions only");
  }
  if (w.swipe) {
    assert.strictEqual(w.swipe.getMemberAge(), 0, label + ": member age 0, not the own local age 30");
    ["personal", "professional"].forEach(function (mode) {
      var deck = w.swipe.sampleDeck(40, mode);
      assert.ok(deck.every(function (c) { return c.type !== "classroom" && c.type !== "ad"; }), label + ": no classroom or ad cards (" + mode + ")");
      assert.ok(deck.every(function (c) { return !c.rating || ["G", "PG"].indexOf(String(c.rating)) !== -1; }), label + ": G/PG cards only (" + mode + ")");
    });
    assert.ok(w.win.CognationLive.memberAge() < 18, label + ": COMMUNE live age under 18");
    assert.strictEqual(w.swipe.datingAllowed(), false, label + ": dating closed");
    assert.strictEqual(w.roomOpen("speed-dating"), false, label + ": speed dating closed");
    assert.strictEqual(w.roomOpen("age-18-21"), false, label + ": 18-21 room closed");
    assert.strictEqual(w.roomOpen("age-21"), false, label + ": 21+ room closed");
    assert.strictEqual(w.marketIds(), "g", label + ": no 18+/21+ Marketplace posts");
    assert.strictEqual(w.swipe.marketCanBid(), false, label + ": no Marketplace bids");
    assert.strictEqual(w.auctionBid(), false, label + ": no auction Bid button");
    /* Signed in: the age line, not the signed-out "Sign in to bid." */
    assert.strictEqual(w.bidNote(), "Bidding is for ages 16 and up.", label + ": signed in keeps the age line");
    assert.strictEqual(w.swipe.classroomAllowed(), false, label + ": COMMUNE classroom closed");
    assert.strictEqual(w.swipe.visibleClassroomSessions().length, 0, label + ": no COMMUNE classroom cards");
    assert.strictEqual(w.peerCards(), 0, label + ": no Peer Review cards");
  }
}

/* user_birth age 30 (a stored birth date): the adult paths open. */
function open(w, label) {
  assert.strictEqual(w.floor.viewerAge(), BIRTH_AGE, label + ": viewerAge from user_birth");
  assert.strictEqual(w.swipe.getDatingBirthAge(), BIRTH_AGE, label + ": birth age read");
  assert.strictEqual(w.towerSees("R"), true, label + ": R Tower post");
  assert.strictEqual(w.towerSees("PG-13"), true, label + ": PG-13 Tower post");
  assert.strictEqual(w.towerSees("G", "Bar crawl tonight, 21+ only"), true, label + ": 21+ keyword Tower post");
  assert.strictEqual(w.autoRate("R"), true, label + ": AutoRate allows R");
  assert.strictEqual(w.feedPhoto("R"), true, label + ": R feed photo");
  assert.strictEqual(w.newsThread("R"), true, label + ": R news thread");
  assert.strictEqual(w.agenda(), "G,PG-13,R", label + ": R classroom session");
  assert.strictEqual(w.swipe.datingAllowed(), true, label + ": dating open");
  assert.strictEqual(w.roomOpen("speed-dating"), true, label + ": speed dating open");
  assert.strictEqual(w.roomOpen("age-21"), true, label + ": 21+ room open");
  assert.strictEqual(w.marketIds(), "a21,g,r18", label + ": 18+/21+ Marketplace posts");
  assert.strictEqual(w.swipe.marketCanBid(), true, label + ": Marketplace bids");
  assert.strictEqual(w.auctionBid(), true, label + ": auction Bid button");
  assert.strictEqual(w.swipe.classroomAllowed(), true, label + ": COMMUNE classroom open");
  assert.ok(w.peerCards() > 0, label + ": Peer Review cards");
}

(async function main() {
  /* 1) index, before deferred commune-swipe runs. */
  var pre = world({ page: "index-pre", birth: "now" });
  await settle(20);
  closed(pre, "index before commune-swipe");
  assert.deepStrictEqual(pre.net.writes, [], "index before commune-swipe: no writes");

  /* 2) index, commune-swipe + hydrate loaded, user_birth read still pending. */
  var idx = world({ page: "index", birth: "pending" });
  idx.emit("cognation:session-started", {});
  await settle(40);
  closed(idx, "index, user_birth pending");
  /* ...then user_birth arrives: the real age applies. */
  idx.releaseBirth();
  idx.emit("cognation:session-started", {});
  await settle(60);
  open(idx, "index, after user_birth");
  assert.deepStrictEqual(idx.net.writes, [], "index: no writes");
  assert.ok(idx.net.reads.indexOf("user_birth") !== -1, "index: user_birth was read");

  /* 3) index, signed in with no user_birth row: age stays unknown, nothing opens. */
  var none = world({ page: "index", birth: "none" });
  none.emit("cognation:session-started", {});
  await settle(60);
  closed(none, "index, no user_birth row");
  assert.deepStrictEqual(none.net.writes, [], "no user_birth row: no writes");

  /* 4) feed-rating.html: no commune-swipe, no user_birth reader. */
  var fr = world({ page: "feed-rating", birth: "now" });
  await settle(20);
  closed(fr, "feed-rating");
  assert.deepStrictEqual(fr.net.writes, [], "feed-rating: no writes");

  /* 5) calendar.html: no commune-swipe, no user_birth reader. */
  var cal = world({ page: "calendar", birth: "now" });
  await settle(20);
  closed(cal, "calendar");
  assert.deepStrictEqual(cal.net.writes, [], "calendar: no writes");

  /* 6) Signed-in control: stored birth date of 30 opens the gates. */
  var ctl = world({ page: "index", birth: "now" });
  ctl.emit("cognation:session-started", {});
  await settle(60);
  open(ctl, "signed-in control");
  assert.deepStrictEqual(ctl.net.writes, [], "control: no writes");

  /* 7) Signed-in SEED with user_birth 30: a seed is signed in, not a demo viewer.
     Dating, 21+, classroom and R all open. */
  var seed = world({ page: "index", birth: "now", seed: true });
  seed.emit("cognation:session-started", {});
  await settle(60);
  assert.ok(seed.floor.sessionUserId(), "seed: signed in (not demo)");
  open(seed, "signed-in seed");
  assert.deepStrictEqual(seed.net.writes, [], "seed: no writes");

  /* 7b) Signed in, user_birth age 14 (under 16): no bids, and the card keeps the age line. */
  var teen = world({ page: "index", birth: "now", birthAge: 14 });
  teen.emit("cognation:session-started", {});
  await settle(60);
  assert.strictEqual(teen.swipe.getMemberAge(), 14, "signed-in 14: member age from user_birth");
  assert.strictEqual(teen.swipe.marketCanBid(), false, "signed-in 14: no Marketplace bids");
  assert.strictEqual(teen.bidNote(), "Bidding is for ages 16 and up.", "signed-in 14: age line, not Sign in to bid.");
  assert.deepStrictEqual(teen.net.writes, [], "signed-in 14: no writes");

  /* 8) Source: viewerAge never reads the local profile age. */
  var floorSrc = read("js/age-floor-keywords.js");
  var body = floorSrc.slice(floorSrc.indexOf("function viewerAge()"), floorSrc.indexOf("function viewerAge()") + 600);
  body = body.slice(0, body.indexOf("\n  }\n") + 4);
  assert.ok(!/memberProfileOwned|MEMBER_KEY|own\.age|\.age\b/.test(body.replace(/viewerAge/g, "")), "viewerAge reads no local profile age");

  console.log("signed-in-age-birth-only.test.js: ok");
})().catch(function (e) { console.error(e); process.exit(1); });
