/**
 * ECHO: Classroom and Webinar cards show only while a Professional page is live
 * (Alexa 2026-10-20 8:20 PM CT). Nothing live -> no such cards and no blank slot;
 * the remaining featured families keep their 1:1 mix.
 * Run: node js/echo-classroom-live-only.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var swipeSrc = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
var towerSrc = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

/* Signed in (#309: a signed-out viewer's gates see age 0): a live session, and
   the age comes from user_birth (setDatingBirthAge), not the local profile. */
var VIEWER_ID = ["u", "viewer"].join("-");
function loadSwipe(windowStub) {
  var local = memoryStorage();
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: ["insurance"] }));
  local.setItem("cognation.commune.seeDating.v1", "1");
  windowStub.CognationDatingFlag = { enabled: function () { return true; } };
  windowStub.CognationSupabase = windowStub.CognationSupabase || { getSession: function () { return { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } }; } };
  var context = vm.createContext({
    window: windowStub,
    document: {
      readyState: "complete",
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      dispatchEvent: function () {},
    },
    localStorage: local,
    sessionStorage: memoryStorage(),
    console: console,
    CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
    setTimeout: setTimeout,
    isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number,
  });
  vm.runInContext(swipeSrc, context);
  var api = windowStub.CognationCommuneSwipe;
  api.setDatingBirthAge(30);
  return api;
}

function family(type) {
  var content = { fact: 1, wellness: 1, friend: 1, event: 1, know: 1, content: 1, marketplace: 1, group: 1 };
  return content[type] ? "content" : String(type || "");
}

function assertNoGapAndEven(deck, families) {
  deck.forEach(function (card, i) {
    assert.ok(card && card.type && card.id, "slot " + i + " has a real card (no blank)");
    if (i) assert.notStrictEqual(family(card.type), family(deck[i - 1].type), "no back-to-back family at " + i);
  });
  var counts = {};
  deck.forEach(function (c) { var f = family(c.type); counts[f] = (counts[f] || 0) + 1; });
  var vals = families.map(function (f) { return counts[f] || 0; });
  vals.forEach(function (v) { assert.ok(v > 0, "every remaining family appears: " + JSON.stringify(counts)); });
  assert.ok(Math.max.apply(null, vals) - Math.min.apply(null, vals) <= 1, "1:1 across remaining families: " + JSON.stringify(counts));
}

var lanes = function (api) {
  return {
    classroom: api.visibleClassroomSessions(),
    ad: [{ id: "a1", title: "A placed ad" }],
    chatroom: [{ id: "c1", title: "Room" }],
    fact: [{ id: "f1", title: "Fact" }],
    wellness: [{ id: "w1", title: "Note" }],
    friend: [], event: [], know: [],
  };
};
var dating = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];

/* 1. No live signal at all (today's real state): zero Classroom / Webinar cards. */
var none = loadSwipe({});
assert.strictEqual(none.liveProPages().length, 0);
assert.strictEqual(none.classroomCatalog().length, 0);
assert.strictEqual(none.visibleClassroomSessions().length, 0);
var deck0 = none.paceDeck(lanes(none), dating, 24);
assert.strictEqual(deck0.length, 24, "deck still fills every slot");
assert.ok(deck0.every(function (c) { return c.type !== "classroom"; }), "no Classroom card");
assertNoGapAndEven(deck0, ["ad", "chatroom", "dating", "content"]);
none.setMode("professional");
var pro0 = none.sampleDeck(12);
assert.ok(pro0.length === 4 && pro0.every(function (c) { return c.type === "pro-podcast" && !c.demo; }), "nothing live and no real pages: only the 4 Podcast cards, no placeholders");
assert.ok(pro0.every(function (c) { return c.type !== "pro-webinar"; }), "no Webinar card");
none.setMode("personal");
assert.ok(none.sampleDeck(18).every(function (c) { return c.type !== "classroom"; }), "real sample deck: no Classroom");

/* A signal that lists pages which are not live (or not professional) counts as nothing live. */
var offline = loadSwipe({ CognationProLive: { livePages: function () {
  return [{ profileId: "p1", live: false, kind: "professional" }, { profileId: "p2", live: true, kind: "personal" }];
} } });
assert.strictEqual(offline.classroomCatalog().length, 0);

/* Go live (browser-only stub) is not a live signal. */
var stub = loadSwipe({ CognationLive: { echoCard: function () { return { id: "live-echo-share", type: "live" }; } } });
assert.strictEqual(stub.classroomCatalog().length, 0, "Go live stub does not make a Classroom card");

/* 2. A live Professional page: its Classroom card (and Webinar card) appear. */
var pages = [{ profileId: "pro-ada", handle: "ada-pro", displayName: "Ada", live: true, kind: "professional", title: "Budgeting basics" }];
var win = { CognationProLive: { livePages: function () { return pages; } } };
var live = loadSwipe(win);
var cards = live.classroomCatalog();
assert.strictEqual(cards.length, 1);
assert.strictEqual(cards[0].id, "class-live-pro-ada");
assert.strictEqual(cards[0].type, "classroom");
assert.strictEqual(cards[0].title, "Budgeting basics");
assert.strictEqual(cards[0].host, "Ada");
assert.strictEqual(cards[0].profileId, "pro-ada");
var deck1 = live.paceDeck(lanes(live), dating, 25);
assert.ok(deck1.some(function (c) { return c.id === "class-live-pro-ada" || /^class-live-pro-ada-r/.test(c.id); }), "live Classroom in ECHO");
assertNoGapAndEven(deck1, ["classroom", "ad", "chatroom", "dating", "content"]);
live.setMode("professional");
assert.ok(live.sampleDeck(14).some(function (c) { return c.type === "pro-webinar" && c.profileId === "pro-ada" && !c.demo; }), "live Webinar card, not a placeholder");
live.setMode("personal");

/* Under 18 never sees the Classroom card even while live. */
live.setDatingBirthAge(16);
live.setMemberProfile({ age: 16 });
assert.strictEqual(live.visibleClassroomSessions().length, 0);
live.setDatingBirthAge(30);
live.setMemberProfile({ age: 30 });

/* 3. The page goes not-live: its card is removed and the slot is filled by the next type. */
pages = [];
assert.strictEqual(live.classroomCatalog().length, 0);
var deck2 = live.paceDeck(lanes(live), dating, 24);
assert.ok(deck2.every(function (c) { return c.type !== "classroom"; }), "card removed once not live");
assertNoGapAndEven(deck2, ["ad", "chatroom", "dating", "content"]);
assert.strictEqual(live.openClassroom("class-live-pro-ada", false), false, "offline classroom opens nothing");
live.setMode("professional");
assert.ok(live.sampleDeck(12).every(function (c) { return c.type !== "pro-webinar"; }), "Webinar removed once not live");

/* Removed: hard-coded Classrooms, Demo placeholder Webinars, sample calendar events. */
assert.ok(!/CLASSROOM_SESSIONS/.test(swipeSrc), "no hard-coded Classroom list");
assert.ok(!/PRO_WEBINARS/.test(swipeSrc), "no placeholder Webinar list");
assert.ok(!/localStorage[^\n]*(pro.?live|classroom.?live)/i.test(swipeSrc), "no localStorage live stub");
assert.ok(!/Coffee with Jordan|Hang with Mira|Block scrapbook night|Farmers market/.test(towerSrc), "no sample calendar events");
assert.ok(/SAMPLE_CALENDAR_ID = \/\^cal-demo-\[1-4\]\$\//.test(towerSrc), "old saved sample events dropped on read");

console.log("echo-classroom-live-only ok");
