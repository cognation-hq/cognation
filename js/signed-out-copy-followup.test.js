/**
 * Designer's #318 copy follow-up (signed out), PM-ordered:
 *  1. Signed-out Marketplace card: "Sign in to bid." is a tappable link with the
 *     same text, #ED9300, to the existing sign-in route (/), focusable with a
 *     visible focus ring.
 *  2. Marketplace card: the body is not rendered when its trimmed text equals the
 *     title (case-insensitive), so the same words are not shown twice.
 *  3. Signed-out ECHO: one muted glass line, "Sign in to join rooms.", where the
 *     rooms would be, in the existing glass/muted tokens (no new colors).
 * No age or gating logic changes: the signed-out gates stay closed, the signed-in
 * 30 gates stay open, and nothing writes to the network.
 *
 * Real modules in one vm window: auto-rate, age-floor-keywords, accounts,
 * seedops-schema, tower, commune-swipe. Run: node --test js/signed-out-copy-followup.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var MEMBER = "cognation.member.profile.v1";
var TOWER_KEY = "cognation.tower.posts.v3";
var VIEWER_ID = ["u", "viewer"].join("-");
var AGE = 10 * 3;

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
  { id: "lamp", authorName: "Kai", handle: "kai", body: "Desk lamp. Works great, pickup only #market", createdAt: "2026-10-20T18:30:00.000Z", rating: "G", lat: 41.88, lng: -87.63 },
];

function world(signedIn) {
  var listeners = {};
  var shell = el("div");
  var roomsLine = shell.querySelector("[data-commune-signed-out-rooms]");
  roomsLine.hidden = true; /* index.html ships it hidden */
  roomsLine.textContent = "Sign in to join rooms.";
  var doc = {
    readyState: "complete", body: el("body"),
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function (sel) { return sel === "[data-commune-shell]" ? shell : null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function (tag) { return el(tag); },
  };
  var net = { writes: [] };
  var session = signedIn
    ? { source: "supabase", supabaseUserId: VIEWER_ID, username: "viewer", activeProfileId: "p-" + VIEWER_ID }
    : { source: "demo", username: "demo", activeProfileId: "demo" };
  var local = {};
  local[MEMBER] = JSON.stringify({ age: AGE, field: "Nursing", interests: ["nursing"], lat: 41.88, lng: -87.63, ownerUserId: signedIn ? VIEWER_ID : undefined });
  local["cognation.session.v2"] = JSON.stringify(session);
  local[TOWER_KEY] = JSON.stringify({ version: 2, posts: POSTS });
  var ls = store(local), ss = store({});
  var win = {
    document: doc, localStorage: ls, sessionStorage: ss,
    location: { search: "", hash: "", pathname: "/index.html", href: "https://cognation.test/index.html" },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    CustomEvent: CustomEvent,
    CognationAuth: { getSession: function () { return JSON.parse(JSON.stringify(session)); } },
    CognationSeedOpsLog: { write: function () {} },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return signedIn ? { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } } : null; },
      getUser: function () { return Promise.resolve(signedIn ? { id: VIEWER_ID, app_metadata: {}, user_metadata: {} } : null); },
      updateUser: function () { net.writes.push("updateUser"); return Promise.resolve(null); },
      rpc: function () { return Promise.resolve(false); }, /* read-only RPCs (e.g. the seed check) */
      rest: function (table, opts) {
        var method = String((opts && opts.method) || "GET").toUpperCase();
        if (method !== "GET") net.writes.push(method + " " + table);
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
      if (method !== "GET") net.writes.push("fetch " + method);
      return Promise.reject(new Error("offline"));
    },
  });
  ["js/auto-rate.js", "js/age-floor-keywords.js", "js/accounts.js", "js/seedops-schema.js", "js/tower.js",
    "js/commune-swipe.js"].forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });
  var swipe = win.CognationCommuneSwipe;
  if (signedIn) swipe.setDatingBirthAge(AGE); /* the user_birth read */
  function market(id) {
    return Array.prototype.filter.call(swipe.marketplaceCards(), function (c) { return c.id === "market-" + id; })[0];
  }
  return { swipe: swipe, net: net, roomsLine: roomsLine, market: market };
}
function settle(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
function bodies(html) { return (html.match(/<p class="commune-card-body">[^<]*<\/p>/g) || []); }

test("1. signed out: 'Sign in to bid.' is a link to the sign-in route, #ED9300, with a focus ring", async function () {
  var w = world(false);
  await settle(10);
  assert.strictEqual(w.swipe.marketCanBid(), false, "signed out: bidding stays closed (no gate change)");
  var html = w.swipe.renderCard(w.market("g")).innerHTML;
  var note = /<p class="commune-card-meta" data-market-bid-note>([\s\S]*?)<\/p>/.exec(html);
  assert.ok(note, "bid note is rendered");
  var a = /^<a class="commune-market-signin" href="\/" data-market-signin>Sign in to bid\.<\/a>$/.exec(note[1]);
  assert.ok(a, "bid note is one link, same text, to / (the sign-in route): " + note[1]);
  assert.ok(!/data-market-bid[\s>]/.test(html), "no Bid button");
  assert.ok(/href="\/">Back to sign in</.test(read("reset-password.html")), "/ is the site's existing sign-in route");
  var css = read("css/styles.css");
  assert.ok(/#panel-commune \.commune-card \.commune-market-signin,[^{]*\{\s*color: #ED9300 !important;/.test(css), "link is #ED9300");
  assert.ok(/\.commune-card \.commune-market-signin:focus-visible \{\s*outline: 2px solid #ED9300;/.test(css), "visible focus ring");
  assert.deepStrictEqual(w.net.writes, [], "signed out: no network writes");
});

test("1b. signed in: the bid area is unchanged (Bid button, no sign-in link)", async function () {
  var w = world(true);
  await settle(30);
  assert.strictEqual(w.swipe.marketCanBid(), true, "signed in 30: bids open (no gate change)");
  var html = w.swipe.renderCard(w.market("g")).innerHTML;
  assert.ok(/data-market-bid[\s>]/.test(html), "Bid button");
  assert.ok(!/data-market-signin/.test(html), "no sign-in link");
});

test("2. Marketplace card: body equal to the title (trimmed, any case) is not rendered twice", async function () {
  var w = world(false);
  await settle(10);
  var mug = w.market("g");
  assert.strictEqual(mug.title, "Blue mug for sale");
  assert.strictEqual(mug.body, "Blue mug for sale");
  var mugHtml = w.swipe.renderCard(mug).innerHTML;
  assert.ok(/<h4 class="commune-card-title">Blue mug for sale<\/h4>/.test(mugHtml), "title stays");
  assert.deepStrictEqual(bodies(mugHtml), [], "one-line post: no duplicate body");
  var odd = w.swipe.renderCard({ id: "market-x", type: "marketplace", title: "Blue Mug", body: "  blue MUG \n", pictures: [] }).innerHTML;
  assert.deepStrictEqual(bodies(odd), [], "case and whitespace differ only: no body");
  var lamp = w.market("lamp");
  assert.strictEqual(lamp.title, "Desk lamp");
  var lampHtml = w.swipe.renderCard(lamp).innerHTML;
  assert.deepStrictEqual(bodies(lampHtml), ['<p class="commune-card-body">Desk lamp. Works great, pickup only</p>'], "longer body still shows");
  var fact = w.swipe.renderCard({ id: "f", type: "fact", title: "Same", body: "Same" }).innerHTML;
  assert.strictEqual(bodies(fact).length, 1, "other card types are unchanged");
});

test("3. signed out: one muted glass line 'Sign in to join rooms.' where the rooms would be", async function () {
  var w = world(false);
  await settle(10);
  w.swipe.rebuild();
  assert.strictEqual(w.roomsLine.hidden, false, "signed out: the rooms line shows");
  assert.strictEqual(w.swipe.visibleSiteRooms().length, 0, "signed out: no rooms open (no gate change)");
  var html = read("index.html");
  var lines = html.match(/<p class="commune-signed-out-rooms" data-commune-signed-out-rooms hidden>Sign in to join rooms\.<\/p>/g) || [];
  assert.strictEqual(lines.length, 1, "exactly one line in index.html");
  assert.ok(html.indexOf("data-commune-signed-out-rooms") < html.indexOf('<div class="commune-swipe-stage">') &&
    html.indexOf('<div class="commune-swipe-stage">') - html.indexOf("data-commune-signed-out-rooms") < 200, "the line sits right above the deck");
  var css = read("css/styles.css");
  var rule = /\.commune-signed-out-rooms \{([^}]*)\}/.exec(css);
  assert.ok(rule, "rooms line has a rule");
  assert.ok(/color: var\(--cgn-text-muted\);/.test(rule[1]) && /background: var\(--cgn-glass\);/.test(rule[1]) && /border: 1px solid var\(--cgn-line\);/.test(rule[1]), "existing muted/glass tokens");
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(rule[1]), "no new colors in the rule");
  /* The deck end no longer adds a second, age-and-interests rooms line while signed out. */
  assert.ok(/: roomsOpen \|\| birthAgePending\(\) \|\| signedOutViewer\(\)\s*\? ''/.test(read("js/commune-swipe.js")), "deck end: no second rooms line signed out");
  assert.deepStrictEqual(w.net.writes, [], "signed out: no network writes");
});

test("3b. signed in: no signed-out rooms line", async function () {
  var w = world(true);
  await settle(30);
  w.swipe.rebuild();
  assert.strictEqual(w.roomsLine.hidden, true, "signed in: rooms line stays hidden");
  assert.ok(w.swipe.visibleSiteRooms().length > 0, "signed in 30: rooms open (no gate change)");
});
