/**
 * ECHO shows no placeholder cards (Alexa 2026-10-22 11:37 AM CT: "we don need demo only crds in echo").
 * Removed: Research, Field update, Pop culture ×, the "Professionals you might know" placeholder,
 * and the placeholder Weekly Cognation bot auction (Auction now waits on a real schedule).
 * Kept: the four Podcast cards, without the Demo badge (Alexa 11:46 AM CT via SeedOps:
 * "this will also be a card when cognation goes live but doesnt need to be a demo").
 * Run: node js/echo-no-placeholders.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    removeItem: function (key) {
      delete data[key];
    },
  };
}

/* Signed in (#309: a signed-out or demo viewer's gates see age 0): the stored
   session is a Supabase sign-in, the member profile is this user's, and the
   age comes from user_birth (setDatingBirthAge), not the local profile. No
   live Supabase session, so the local page registry still feeds the deck. */
var VIEWER_ID = ["u", "viewer"].join("-");
function loadSwipe(localStorage, sessionStorage, extra) {
  var windowStub = extra || {};
  var documentStub = {
    readyState: "complete",
    querySelector: function () { return null; },
    addEventListener: function () {},
    dispatchEvent: function () {},
  };
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    console: console,
    CustomEvent: function CustomEvent(name, init) {
      this.type = name;
      this.detail = init && init.detail;
    },
    setTimeout: setTimeout,
    isFinite: isFinite,
    parseInt: parseInt,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
  });
  vm.runInContext(src("js/age-floor-keywords.js"), context);
  vm.runInContext(src("js/commune-swipe.js"), context);
  windowStub.CognationCommuneSwipe.setDatingBirthAge(30);
  return windowStub.CognationCommuneSwipe;
}

var swipe = src("js/commune-swipe.js");

/* 1. No placeholder builder, label, badge or copy is left in ECHO. */
assert.ok(!/proPlaceholder/.test(swipe), "no proPlaceholder()");
assert.ok(!/Demo \u00b7 placeholder|Demo · placeholder|DEMO_LABEL/.test(swipe), "no Demo · placeholder label");
assert.ok(!/data-account-kind="placeholder"/.test(swipe), "no placeholder badge markup");
assert.ok(!/demo: true/.test(swipe), "no card flagged demo by ECHO itself");
["Research papers", "Weekly Cognation bot auction", "Field update:", "Pop culture \\u00d7",
 "pro-know-placeholder", "once a research feed connects", "once a field feed connects", "once a feed connects",
 "once real pages connect"].forEach(function (s) {
  assert.ok(swipe.indexOf(s) < 0, "placeholder copy gone: " + s);
});
/* Seed accounts' own content keeps its Demo badge (seedops badge, not a placeholder). */
assert.ok(/CognationSeedOpsBadge\.badgeHtml\(card\.record\)/.test(swipe), "seed Demo badge still rendered for seed records");
assert.ok(/Demo · seed/.test(swipe), "seed badge label kept");

/* 2. Auction: no real schedule source yet -> no card, but the type stays for a real schedule. */
assert.ok(/function scheduledAuctionCards\(\) \{\s*return \[\];\s*\}/.test(swipe), "auction lane empty until a real schedule exists");
assert.ok(/lanes\[PRO\.AUCTION\] = scheduledAuctionCards\(\)/.test(swipe), "auction lane reads the schedule hook");

function adultStores(pages) {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "supabase", supabaseUserId: VIEWER_ID }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, field: "Nursing", interests: ["public health"], ownerUserId: VIEWER_ID }));
  var profiles = { ada: { id: "ada", kind: "personal", displayName: "Ada" } };
  (pages || []).forEach(function (p) { profiles[p.id] = p; });
  local.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  return local;
}
function assertReal(deck, label) {
  deck.forEach(function (c) {
    assert.ok(!c.demo, label + ": not a placeholder " + c.id);
    assert.ok(["pro-research", "pro-field", "pro-popculture", "pro-auction"].indexOf(c.type) < 0,
      label + ": no card from a lane without real data: " + c.type);
  });
  var ids = deck.map(function (c) { return c.id; });
  ids.forEach(function (id, i) { assert.strictEqual(ids.indexOf(id), i, label + ": no repeated card " + id); });
}

/* 3. Podcast stays, without the Demo label: copy and why line kept, no button or link. */
var sess = memoryStorage(); sess.setItem("cognation.commune.mode", "professional");
var none = loadSwipe(adultStores([]), sess);
var lanes = none.buildProfessionalLanes();
var pods = lanes["pro-podcast"];
assert.strictEqual(pods.map(function (c) { return c.title; }).join("|"),
  "Top industry performers|Ethical collaboration|Async by default|Continuing education", "four Podcast cards kept");
assert.strictEqual(pods[0].body, "Talks with leading people across industries, not only Cognation experts.", "copy kept");
pods.forEach(function (c) {
  assert.ok(!c.demo, "Podcast not flagged demo: " + c.id);
  assert.strictEqual(c.why, "Picked by topic: ethics, async work, continuing education.", "why line kept");
  assert.ok(!c.handle && !c.url && !c.href, "Podcast card has no destination to link to: " + c.id);
});
assert.ok(!/PRO\.PODCAST[\s\S]{0,200}<(button|a)\b/.test(swipe), "no Podcast button or link that leads nowhere");

/* 4. Lanes with no real data are empty; the deck skips them and never spins. */
["pro-webinar", "pro-know", "pro-research", "pro-auction", "pro-field", "pro-popculture"].forEach(function (t) {
  assert.strictEqual(lanes[t].length, 0, "empty lane " + t);
});
var only = none.sampleDeck(18);
assert.strictEqual(only.length, 4, "only the four Podcast cards, each once");
assertReal(only, "podcast-only");
var t0 = Date.now();
assert.strictEqual(none.paceProfessional({}, 50).length, 0, "all lanes empty -> empty deck");
assert.ok(Date.now() - t0 < 200, "pacing returns at once on empty lanes");

/* 5. Real cards still render in a 1:1 mix: a live Webinar plus real professional pages. */
var pages = [
  { id: "clinic", kind: "professional", handle: "clinic", displayName: "Clinic Studio", headline: "Public health education", accountKind: "real" },
  { id: "lab", kind: "professional", handle: "lab", displayName: "Lab Works", headline: "Research lab", accountKind: "real" },
  { id: "desk", kind: "professional", handle: "desk", displayName: "Desk Co", headline: "Public health desk", accountKind: "real" },
];
var live = [{ profileId: "pro-ada", handle: "ada-pro", displayName: "Ada Pro", live: true, kind: "professional", sessionKind: "webinar", title: "Budgeting basics" }];
var sess2 = memoryStorage(); sess2.setItem("cognation.commune.mode", "professional");
var real = loadSwipe(adultStores(pages), sess2, { CognationProLive: { livePages: function () { return live; } } });
var deck = real.sampleDeck(18);
assert.strictEqual(deck.map(function (c) { return c.type; }).join(","),
  "pro-webinar,pro-know,pro-podcast,pro-podcast,pro-podcast,pro-podcast",
  "1:1 across real lanes; an exhausted lane drops out: " + deck.map(function (c) { return c.id; }));
assertReal(deck, "mixed");

/* Uneven real lanes keep strict alternation while both have cards. */
var mix = real.paceProfessional({ "pro-webinar": [{ id: "w1" }, { id: "w2" }], "pro-know": [{ id: "k1" }, { id: "k2" }, { id: "k3" }] }, 10);
assert.strictEqual(mix.map(function (c) { return c.id; }).join(","), "w1,k1,w2,k2,k3");

/* 6. Personal ECHO has no placeholder cards either. */
var sess3 = memoryStorage();
var personal = loadSwipe(adultStores(pages), sess3);
personal.sampleDeck(24).forEach(function (c) { assert.ok(!c.demo, "personal: not a placeholder " + c.id); });

console.log("echo-no-placeholders ok");
