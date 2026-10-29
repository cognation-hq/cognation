/**
 * Signed out, every client gate sees age 0 (#309 rule), whatever the device's
 * local profile, localStorage or sessionStorage says. Fail closed.
 *
 * A signed-out (demo session) viewer whose local member profile was edited to
 * age 30, with See dating saved on, the dating switch forced on, a leftover
 * dating-hydrate cache in sessionStorage, and a birth age pushed in while
 * signed out (a cognation:birth-saved event, or a stray setDatingBirthAge) must
 * NOT open: R content (Tower, AutoRate, feed photos), the 18+ areas (dating,
 * speed dating, the 18-21 and 21+ rooms, Marketplace 18+/21+ posts and bids,
 * auction bids), Classroom, or Peer Review. Nothing sends a network write.
 * The same gates still open for a signed-in viewer whose user_birth age is 30.
 *
 * Real modules in one vm window: auto-rate, age-floor-keywords, accounts,
 * seedops-schema, tower, commune-swipe, peer-review-room, commune-messages,
 * live-stubs and seedops-dating-hydrate.
 * Run: node js/signed-out-age-zero.test.js
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
var VIEWER_ID = ["u", "viewer"].join("-");
var EDITED_AGE = 10 * 3;

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
  var e = {
    tagName: String(tag || "div").toUpperCase(), innerHTML: "", textContent: "", value: "", style: {}, hidden: false,
    attrs: {}, children: [], parentNode: null,
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute: function (k) { delete this.attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore: function (c) { return this.appendChild(c); },
    addEventListener: function () {}, removeEventListener: function () {},
    /* Parts a mounted widget looks up exist; the mount markers do not yet. */
    _q: {},
    querySelector: function (sel) {
      if (sel === "[data-auction-room]" || sel === "[data-commune-room-log]") return null;
      if (!this._q[sel]) this._q[sel] = el("div");
      return this._q[sel];
    },
    querySelectorAll: function () { return []; },
    closest: function () { return null; }, focus: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
  };
  return e;
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

var POSTS = [
  { id: "g", authorName: "Sam", handle: "sam", body: "Blue mug for sale #market", createdAt: "2026-10-20T19:00:00.000Z", rating: "G", lat: 41.88, lng: -87.63 },
  { id: "r18", authorName: "Dana", handle: "dana", body: "Wine glasses, set of six, 18+ only #market", createdAt: "2026-10-20T18:00:00.000Z", rating: "R", lat: 41.88, lng: -87.63 },
  { id: "a21", authorName: "Lee", handle: "lee", body: "Homebrew beer kit, 21+ #market", createdAt: "2026-10-20T17:00:00.000Z", rating: "PG-13", lat: 41.88, lng: -87.63 },
];

/* signedIn: a live Supabase session for VIEWER_ID whose user_birth age is EDITED_AGE.
   Otherwise: a signed-out demo session on a device with an edited local age. */
function world(signedIn) {
  var listeners = {};
  var doc = {
    readyState: "complete",
    body: el("body"),
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function (tag) { return el(tag); },
  };
  var net = { writes: [], fetches: [] };
  var session = signedIn
    ? { source: "supabase", supabaseUserId: VIEWER_ID, username: "viewer", activeProfileId: "p-" + VIEWER_ID }
    : { source: "demo", username: "demo", activeProfileId: "demo" };
  var local = {};
  local[MEMBER] = JSON.stringify(signedIn
    ? { age: EDITED_AGE, field: "Nursing", interests: ["nursing"], lat: 41.88, lng: -87.63, ownerUserId: VIEWER_ID }
    : { age: EDITED_AGE, field: "Nursing", interests: ["nursing"], lat: 41.88, lng: -87.63 });
  local["cognation.session.v2"] = JSON.stringify(session);
  local["cognation.commune.seeDating.v1"] = "1";
  local[TOWER_KEY] = JSON.stringify({ version: 2, posts: POSTS });
  var ls = store(local);
  /* Leftover dating-hydrate cache from an earlier sign-in on this device. */
  var ss = store({ "cognation.seedops.datingHydrate.v2": JSON.stringify({ userId: VIEWER_ID, age: EDITED_AGE }) });
  var win = {
    document: doc, localStorage: ls, sessionStorage: ss,
    location: { search: "", hash: "", pathname: "/commune.html", href: "https://cognation.test/commune.html" },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    CustomEvent: CustomEvent,
    CognationAuth: { getSession: function () { return JSON.parse(JSON.stringify(session)); } },
    CognationSeedOpsLog: { write: function () {} },
    CognationDatingFlag: { enabled: function () { return true; } }, /* forced on: the age is the only gate left */
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return signedIn ? { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } } : null; },
      getUser: function () { return Promise.resolve(signedIn ? { id: VIEWER_ID, app_metadata: {}, user_metadata: {} } : null); },
      updateUser: function (data) { net.writes.push({ updateUser: Object.keys(data || {}) }); return Promise.resolve(null); },
      rpc: function (name) { net.writes.push({ rpc: name }); return Promise.resolve(false); },
      rest: function (table, opts) {
        var method = String((opts && opts.method) || "GET").toUpperCase();
        if (method !== "GET") net.writes.push({ rest: table, method: method });
        if (table === "user_birth" && signedIn) {
          var now = new Date();
          return Promise.resolve([{ birth_year: now.getFullYear() - EDITED_AGE, birth_month: 1 }]);
        }
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
    fetch: function (url, opts) {
      var method = String((opts && opts.method) || "GET").toUpperCase();
      net.fetches.push(method);
      if (method !== "GET") net.writes.push({ fetch: method });
      return Promise.reject(new Error("offline"));
    },
  });
  ["js/auto-rate.js", "js/age-floor-keywords.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js",
    "js/commune-swipe.js", "js/peer-review-room.js", "js/commune-messages.js", "js/live-stubs.js",
    "js/seedops-dating-hydrate.js"].forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });
  var swipe = win.CognationCommuneSwipe;
  if (signedIn) swipe.setDatingBirthAge(EDITED_AGE); /* the user_birth read */
  swipe.setSeeDating(true);
  var rooms = {};
  swipe.siteRoomCatalog().forEach(function (r) { rooms[r.gate] = r; });
  return {
    win: win, ls: ls, ss: ss, net: net, swipe: swipe, floor: win.CognationAgeFloor,
    emit: function (type, detail) { doc.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); },
    roomOpen: function (gate) {
      var room = rooms[gate];
      assert.ok(room, "site room for gate " + gate);
      return swipe.visibleSiteRooms().some(function (r) { return r.id === room.id; });
    },
    seesR: function () {
      return !!win.CognationTowerPostVisibleToViewer({ id: "r-post", authorName: "Ana", body: "Late show recap", rating: "R" });
    },
    autoRateR: function () { return win.CognationAutoRate.canSee("R", { age: win.CognationAgeFloor.viewerAge() }); },
    feedPhotoR: function () {
      return win.CognationFeedPhotos.html([{ kind: "photo", dataUrl: "data:image/gif;base64,R0lGOD", rating: "R" }]).indexOf("<img") !== -1;
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
      return win.CognationPeerReview.cards({ field: "nursing", interests: ["nursing"], age: swipe.getAccessAge() }).length;
    },
    peerCardsAtMemberAge: function () {
      return win.CognationPeerReview.cards({ field: "nursing", interests: ["nursing"], age: swipe.getMemberAge() }).length;
    },
  };
}

function signedOutClosed(w, label) {
  assert.strictEqual(w.floor.sessionUserId(), "", label + ": signed out");
  assert.strictEqual(w.floor.viewerAge(), 0, label + ": viewerAge is 0, not the edited local age");
  assert.strictEqual(w.swipe.getMemberAge(), 0, label + ": getMemberAge is 0");
  assert.strictEqual(w.swipe.getDatingBirthAge(), null, label + ": no dating birth age");
  assert.ok(w.swipe.getAccessAge() < 18, label + ": access age under 18");
  assert.ok(w.win.CognationLive.memberAge() < 18, label + ": COMMUNE live age under 18");
  /* R content */
  assert.strictEqual(w.seesR(), false, label + ": no R Tower post");
  assert.strictEqual(w.autoRateR(), false, label + ": AutoRate refuses R");
  assert.strictEqual(w.feedPhotoR(), false, label + ": no R feed photo");
  /* 18+ areas */
  assert.strictEqual(w.swipe.datingAllowed(), false, label + ": dating closed");
  assert.strictEqual(w.roomOpen("speed-dating"), false, label + ": speed dating closed");
  assert.strictEqual(w.roomOpen("age-18-21"), false, label + ": 18-21 room closed");
  assert.strictEqual(w.roomOpen("age-21"), false, label + ": 21+ room closed");
  assert.strictEqual(w.marketIds(), "g", label + ": no 18+/21+ Marketplace posts");
  assert.strictEqual(w.swipe.marketCanBid(), false, label + ": no Marketplace bids");
  assert.strictEqual(w.auctionBid(), false, label + ": no auction Bid button");
  /* Classroom */
  assert.strictEqual(w.swipe.classroomAllowed(), false, label + ": classroom closed");
  assert.strictEqual(w.swipe.visibleClassroomSessions().length, 0, label + ": no classroom cards");
  /* Peer Review */
  assert.strictEqual(w.peerCards(), 0, label + ": no Peer Review cards");
  assert.strictEqual(w.peerCardsAtMemberAge(), 0, label + ": no Peer Review cards at age 0");
}

function settle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function main() {
  /* 1) Signed out with an edited local age of 30. */
  var out = world(false);
  await settle(30);
  signedOutClosed(out, "signed out");

  /* 2) A birth month "saved" while signed out sets no age (no account to save it for). */
  var now = new Date();
  out.emit("cognation:birth-saved", { year: now.getFullYear() - EDITED_AGE, month: 1 });
  await settle(10);
  signedOutClosed(out, "after birth-saved while signed out");

  /* 3) A stray birth age pushed in while signed out (a hydrate or caller that
     never checked the session) is not read by any gate. */
  out.swipe.setDatingBirthAge(EDITED_AGE);
  await settle(10);
  assert.strictEqual(out.swipe.getDatingBirthAge(), null, "stray birth age not read while signed out");
  assert.strictEqual(out.swipe.getMemberAge(), 0, "stray birth age: getMemberAge still 0");
  assert.strictEqual(out.feedPhotoR(), false, "stray birth age: no R feed photo");
  assert.strictEqual(out.swipe.datingAllowed(), false, "stray birth age: dating closed");
  assert.strictEqual(out.swipe.classroomAllowed(), false, "stray birth age: classroom closed");
  assert.strictEqual(out.roomOpen("age-21"), false, "stray birth age: 21+ room closed");
  assert.strictEqual(out.roomOpen("speed-dating"), false, "stray birth age: speed dating closed");
  assert.strictEqual(out.swipe.marketCanBid(), false, "stray birth age: no bids");
  assert.strictEqual(out.auctionBid(), false, "stray birth age: no auction Bid button");
  assert.strictEqual(out.peerCardsAtMemberAge(), 0, "stray birth age: no Peer Review cards");

  /* 4) No network writes while signed out. */
  assert.deepStrictEqual(out.net.writes, [], "signed out: no network writes");

  /* 5) Signed in with user_birth 30: the same gates open (no over-blocking). */
  var inn = world(true);
  await settle(30);
  assert.strictEqual(inn.floor.viewerAge(), EDITED_AGE, "signed in: viewerAge from user_birth");
  assert.strictEqual(inn.swipe.getMemberAge(), EDITED_AGE);
  assert.strictEqual(inn.swipe.getDatingBirthAge(), EDITED_AGE);
  assert.strictEqual(inn.seesR(), true, "signed in 30: R Tower post");
  assert.strictEqual(inn.autoRateR(), true, "signed in 30: AutoRate allows R");
  assert.strictEqual(inn.feedPhotoR(), true, "signed in 30: R feed photo");
  assert.strictEqual(inn.swipe.datingAllowed(), true, "signed in 30: dating open");
  assert.strictEqual(inn.roomOpen("speed-dating"), true, "signed in 30: speed dating open");
  assert.strictEqual(inn.roomOpen("age-21"), true, "signed in 30: 21+ room open");
  assert.strictEqual(inn.marketIds(), "a21,g,r18", "signed in 30: 18+/21+ Marketplace posts");
  assert.strictEqual(inn.swipe.marketCanBid(), true, "signed in 30: bids");
  assert.strictEqual(inn.auctionBid(), true, "signed in 30: auction Bid button");
  assert.strictEqual(inn.swipe.classroomAllowed(), true, "signed in 30: classroom open");
  assert.ok(inn.peerCards() > 0, "signed in 30: Peer Review cards");

  /* 6) Source: the auction room gets getMemberAge(); the gates go through the signed-out check. */
  var swipeSrc = read("js/commune-swipe.js");
  assert.ok(/CognationAuctionRoom\.mount\(roomEl\(\), card, getMemberAge\(\)\)/.test(swipeSrc), "auction bid age is getMemberAge()");
  assert.ok(/function getMemberAge\(\) \{\s+if \(signedOutViewer\(\)\) return 0;/.test(swipeSrc), "getMemberAge fails closed when signed out");
  assert.ok(/function viewerAge\(\) \{\s+try \{\s+if \(!sessionUserId\(\)\) return 0;/.test(read("js/age-floor-keywords.js")), "viewerAge fails closed when signed out");

  console.log("signed-out-age-zero.test.js: ok");
})().catch(function (e) { console.error(e); process.exit(1); });
