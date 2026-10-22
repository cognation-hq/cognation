/**
 * ECHO Professional: the real "Professionals you might know" card (Alexa 2026-10-22 CT).
 * - 11:48 "maybe a people you may know professional card": real Pro pages only; no card when none.
 * - 11:49 "this persons name - job title software eng": each row is "Name · Job title", or the
 *   name only when the page has no job title (never invented; profiles has no job title column today).
 * - 11:49 "maybe 3 people you might know on one card": up to 3 rows, each opens that Pro page.
 * Never seed pages for real viewers, never the viewer's own pages, never personal friends.
 * Run: node js/echo-pro-people-card.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var swipeSrc = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

function fakeEl() {
  var attrs = {};
  return {
    innerHTML: "",
    className: "",
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
    removeAttribute: function (k) { delete attrs[k]; },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    appendChild: function () {},
    style: {},
  };
}

function load(pages, extra) {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, field: "Software", interests: ["software engineering"] }));
  var profiles = {
    ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["friend"] },
    friend: { id: "friend", kind: "personal", displayName: "Friend", friendIds: ["ada", "sam"], accountKind: "real" },
    sam: { id: "sam", kind: "personal", displayName: "Sam", friendIds: ["friend"], accountKind: "real" },
  };
  pages.forEach(function (p) { profiles[p.id] = p; });
  local.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  var session = memoryStorage();
  session.setItem("cognation.commune.mode", "professional");
  var win = extra || {};
  var ctx = vm.createContext({
    window: win,
    document: {
      readyState: "complete",
      querySelector: function () { return null; },
      addEventListener: function () {},
      dispatchEvent: function () {},
      createElement: function () { return fakeEl(); },
    },
    localStorage: local, sessionStorage: session, console: console,
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt,
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  });
  vm.runInContext(swipeSrc, ctx);
  var api = win.CognationCommuneSwipe;
  api.noteViewerSeedStatus(false);
  return { api: api, win: win };
}
function pro(id, name, extra) {
  var p = { id: id, kind: "professional", handle: id, displayName: name, headline: "Software engineering team", accountKind: "real" };
  Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
  return p;
}
function knowCards(api) { return api.buildProfessionalLanes()["pro-know"]; }

/* 1. Title shown / title missing. Row label is "Name · Job title" or the name alone. */
var a = load([pro("jordan", "Jordan", { jobTitle: "Software Engineer" }), pro("riley", "Riley")]);
var card = knowCards(a.api);
assert.strictEqual(card.length, 1, "one people card");
var rows = card[0].people;
assert.strictEqual(rows.length, 2, "two real matches: two rows, not padded");
var html = a.api.renderCard(card[0]).innerHTML;
assert.ok(html.indexOf(">Jordan \u00b7 Software Engineer</button>") >= 0, "name · job title");
assert.ok(html.indexOf(">Riley</button>") >= 0, "no job title: name only");
assert.ok(!/Riley \u00b7/.test(html), "no invented title");
assert.ok(html.indexOf("Software engineering team") < 0, "bio/headline is never used as a job title");
assert.ok(!/Demo \u00b7|data-account-kind=/.test(html), "real pages carry no Demo badge");
assert.ok(!/<h4/.test(html), "no duplicate heading under the type mark");
assert.ok(/data-type-mark="know"/.test(html) && /Why you see this:/.test(html), "type mark and why line kept");

/* 2. Row links: each row opens that person's Pro page. */
var opened = [];
var b = load([pro("jordan", "Jordan"), pro("riley", "Riley"), pro("sky", "Sky")], {
  CognationTowerOpenProfile: function (h) { opened.push(h); },
});
var c3 = knowCards(b.api)[0];
var el = b.api.renderCard(c3);
var buttons = [];
(el.innerHTML.match(/data-pro-know-open="\d+"/g) || []).forEach(function (m) {
  var i = m.match(/\d+/)[0];
  var handlers = {};
  buttons.push({
    getAttribute: function (k) { return k === "data-pro-know-open" ? i : null; },
    addEventListener: function (t, fn) { handlers[t] = fn; },
    click: function () { handlers.click({ stopPropagation: function () {}, preventDefault: function () {}, target: { closest: function () { return this; } } }); },
  });
});
el.querySelectorAll = function (sel) { return sel === "[data-pro-know-open]" ? buttons : []; };
b.api.bindCard(el, c3);
assert.strictEqual(buttons.length, 3, "three rows, three links");
buttons.forEach(function (btn) { btn.click(); });
assert.strictEqual(opened.join(","), c3.people.map(function (r) { return r.handle; }).join(","), "each row opens its own Pro page");
assert.ok(/data-pro-know-handle="jordan"/.test(el.innerHTML), "row names its page");

/* 3. Cap: more than 3 real matches -> one card with 3 rows. */
var d = load([pro("p1", "One"), pro("p2", "Two"), pro("p3", "Three"), pro("p4", "Four"), pro("p5", "Five")]);
var capped = knowCards(d.api);
assert.strictEqual(capped.length, 1, "one card");
assert.strictEqual(capped[0].people.length, 3, "3-row cap");
assert.strictEqual(d.api.sampleDeck(18).filter(function (x) { return x.type === "pro-know"; }).length, 1, "the deck shows it once");

/* 4. One match -> one row. Zero -> no card. */
assert.strictEqual(knowCards(load([pro("solo", "Solo")]).api)[0].people.length, 1, "one real match: one row");
var zero = load([]);
assert.strictEqual(knowCards(zero.api).length, 0, "no real Pro pages: no card");
assert.ok(zero.api.sampleDeck(18).every(function (x) { return x.type !== "pro-know"; }), "no people card in the deck");

/* 5. Seeds never reach a real viewer; unknown account kind fails closed; not padded with them. */
var e = load([
  pro("real1", "Real One"),
  pro("seed1", "Seed One", { accountKind: "seed" }),
  pro("ops1", "Ops One", { accountKind: "ops" }),
  pro("fleet1", "Fleet One", { accountKind: "", seedFleetId: "fleet-a" }),
  pro("unknown1", "Unknown One", { accountKind: "" }),
]);
var eRows = knowCards(e.api)[0].people.map(function (r) { return r.profileId; });
assert.strictEqual(eRows.join(","), "real1", "only the real page; seeds and unknowns are left out, not padded");
var srvSeed = load([pro("srv", "Server Seed")]);
srvSeed.api.noteProfileSeedStatus("srv", true);
assert.strictEqual(knowCards(srvSeed.api).length, 0, "server-marked seed page: no card for a real viewer");

/* Unknown viewer (seed check failed): still no seed pages. Confirmed seed viewer: seed pages only. */
var u = load([pro("real2", "Real Two"), pro("seed2", "Seed Two", { accountKind: "seed" })]);
u.api.noteViewerSeedStatus(null);
assert.strictEqual(knowCards(u.api)[0].people.map(function (r) { return r.profileId; }).join(","), "real2", "unknown viewer: real pages only");
u.api.noteViewerSeedStatus(true);
assert.strictEqual(knowCards(u.api)[0].people.map(function (r) { return r.profileId; }).join(","), "seed2", "seed viewer stays in the seed sandbox");

/* 6. Never the viewer's own pages (by id, by session profiles, or by owner). */
var f = load([pro("mine1", "Mine By Id"), pro("mine2", "Mine By Owner", { userId: "u-ada" }), pro("other", "Other")], {
  CognationSupabaseSocial: { getMyProfiles: function () { return [{ id: "mine1", user_id: "u-ada" }]; } },
});
assert.strictEqual(knowCards(f.api)[0].people.map(function (r) { return r.profileId; }).join(","), "other", "own pages excluded");
var g = load([pro("ada-pro", "Ada Pro")], {
  CognationAccounts: { getProfilesForUsername: function () { return [{ id: "ada-pro" }]; } },
});
assert.strictEqual(knowCards(g.api).length, 0, "only own page: no card");

/* 7. No personal friends-you-may-know cards in the Pro deck. */
var deck = a.api.sampleDeck(18);
assert.ok(deck.every(function (x) { return /^pro-/.test(x.type); }), "Professional deck only");
assert.ok(deck.every(function (x) { return !x.people || x.people.every(function (r) { return ["friend", "sam"].indexOf(r.profileId) < 0; }); }), "no personal friends");

/* 8. Source guards. */
assert.ok(/profileLooksSeed\(rec\) !== wantSeed/.test(swipeSrc) && /var wantSeed = resolveViewerSeedStatus\(\) === true;/.test(swipeSrc), "seed guard in professionalsYouMightKnow");
assert.ok(/PRO_KNOW_MAX = 3/.test(swipeSrc), "3-row cap constant");
assert.ok(!/pro-know-placeholder/.test(swipeSrc), "no placeholder stand-in");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
assert.ok(/\.commune-pro-know-open/.test(css), "row style present");

console.log("echo-pro-people-card ok");
