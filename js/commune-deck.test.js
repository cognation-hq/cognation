/**
 * Commune deck pacing, private rating copy, and ad/friend-request gates.
 * Run: node js/commune-deck.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

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

function loadSwipe(localStorage, sessionStorage) {
  var windowStub = {};
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
  vm.runInContext(fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8"), context);
  return windowStub.CognationCommuneSwipe;
}

function typesOf(deck) {
  return deck.map(function (card) { return card.type; });
}

function assertPaced(deck) {
  var i;
  for (i = 1; i < deck.length; i++) {
    assert.notStrictEqual(deck[i].type, deck[i - 1].type, "same type ran in a row at " + i);
  }
  var datingAt = [];
  deck.forEach(function (card, idx) {
    if (card.type === "dating") datingAt.push(idx);
  });
  datingAt.forEach(function (idx) {
    assert.ok(idx >= 5, "dating led or landed in the first five cards");
  });
  for (i = 1; i < datingAt.length; i++) {
    assert.ok(datingAt[i] - datingAt[i - 1] >= 6, "fewer than five other cards between dating cards");
  }
}

function testRatingSentences() {
  var api = loadSwipe(memoryStorage(), memoryStorage());
  assert.strictEqual(api.ratingSentence(7.5), "You've been rated a 7.5");
  assert.strictEqual(api.ratingSentence(8), "You've been rated an 8");
  assert.strictEqual(api.ratingSentence(8.0), "You've been rated an 8");
  assert.strictEqual(api.ratingSentence(7), "You've been rated a 7");
  assert.strictEqual(api.ratingSentence(11), "You've been rated an 11");
  assert.strictEqual(api.ratingSentence(18), "You've been rated an 18");
  assert.strictEqual(api.ratingSentence(80), "You've been rated an 80");
}

function testPace() {
  var api = loadSwipe(memoryStorage(), memoryStorage());
  var lanes = {
    ad: [{ id: "a1", title: "A placed ad" }],
    chatroom: [{ id: "c1", title: "Room" }],
    fact: [{ id: "f1", title: "Fact" }],
    wellness: [{ id: "w1", title: "Note" }],
    friend: [{ id: "fr1", title: "Kept" }],
    event: [{ id: "e1", title: "Class" }],
    know: [{ id: "k1", title: "Someone" }],
  };
  var dating = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
  var deck = api.paceDeck(lanes, dating, 28);
  assert.ok(deck.length >= 20);
  assert.notStrictEqual(deck[0].type, "dating");
  assertPaced(deck);
  assert.ok(typesOf(deck).indexOf("dating") > 4);

  var sparse = api.paceDeck({
    ad: [],
    chatroom: [{ id: "c1" }],
    fact: [{ id: "f1" }],
    wellness: [{ id: "w1" }],
    friend: [],
    event: [],
    know: [],
  }, [], 12);
  assert.ok(sparse.length >= 12);
  assertPaced(sparse);
  var skipped = sparse.filter(function (card) {
    return card.type === "know" || card.type === "ad" || card.type === "dating";
  });
  assert.strictEqual(skipped.length, 0);
}

function testFullFriendList() {
  var local = memoryStorage();
  var friends = [];
  var i;
  for (i = 0; i < 6000; i++) friends.push("friend-" + i);
  local.setItem("cognation.session.v2", JSON.stringify({
    username: "member",
    activeProfileId: "me",
    source: "demo",
  }));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      me: { id: "me", kind: "personal", displayName: "Member", friendIds: friends },
    },
  }));
  var api = loadSwipe(local, memoryStorage());
  var sent = api.sendPersonalFriendRequest("someone-else");
  assert.strictEqual(sent.full, true);
  assert.strictEqual(sent.ok, false);
  assert.strictEqual(sent.message, "This list is full.");
  assert.strictEqual(local.getItem("cognation.friend.requests.v1"), null);
}

function titles(rooms) {
  return Array.prototype.map.call(rooms, function (room) { return String(room.title); });
}

function testSiteRooms() {
  var api = loadSwipe(memoryStorage(), memoryStorage());
  var catalog = titles(api.siteRoomCatalog());
  assert.deepStrictEqual(catalog, [
    "18–21",
    "Highschool",
    "Moms",
    "Tech/AI",
    "Speed dating",
    "21+",
    "Disability help",
    "Mental health",
    "Military",
    "LGBTQ",
    "Public policy",
    "Gamers",
    "Jobs",
    "Garage sale",
    "Reality shows",
    "Insurance",
  ]);
  api.siteRoomCatalog().forEach(function (room) {
    assert.strictEqual(room.type, "chatroom");
    assert.strictEqual(room.host, "Cognation");
    assert.strictEqual(room.body, "Cognation hosts this room.");
  });

  var interests = [
    "moms", "tech", "ai", "disability help", "mental health", "military", "lgbtq",
    "public policy", "gamers", "jobs", "garage sale", "reality shows", "insurance",
  ];

  api.setMemberProfile({ age: 16, interests: interests });
  api.setSeeDating(true);
  var school = titles(api.visibleSiteRooms());
  assert.ok(school.indexOf("Highschool") !== -1);
  assert.ok(school.indexOf("Moms") !== -1);
  assert.ok(school.indexOf("Tech/AI") !== -1);
  assert.strictEqual(school.indexOf("Speed dating"), -1);
  assert.strictEqual(school.indexOf("21+"), -1);
  assert.strictEqual(school.indexOf("18–21"), -1);

  api.setMemberProfile({ age: 19, interests: [] });
  api.setSeeDating(false);
  assert.deepStrictEqual(titles(api.visibleSiteRooms()), ["18–21"]);
  api.setSeeDating(true);
  assert.deepStrictEqual(titles(api.visibleSiteRooms()), ["18–21", "Speed dating"]);

  api.setMemberProfile({ age: 21, interests: interests });
  api.setSeeDating(true);
  var adult = titles(api.visibleSiteRooms());
  assert.ok(adult.indexOf("18–21") !== -1);
  assert.ok(adult.indexOf("21+") !== -1);
  assert.ok(adult.indexOf("Speed dating") !== -1);
  assert.ok(adult.indexOf("Insurance") !== -1);
  assert.strictEqual(adult.indexOf("Highschool"), -1);
  assert.strictEqual(adult.length, 15);

  api.setMemberProfile({ age: 30, interests: ["insurance"] });
  api.setSeeDating(false);
  assert.deepStrictEqual(titles(api.visibleSiteRooms()), ["21+", "Insurance"]);

  api.setMemberProfile({ age: 40, interests: [] });
  assert.deepStrictEqual(titles(api.visibleSiteRooms()), ["21+"]);

  var lanes = {
    ad: [],
    chatroom: api.visibleSiteRooms(),
    fact: [{ id: "f1", title: "Fact" }],
    wellness: [{ id: "w1", title: "Note" }],
    friend: [],
    event: [],
    know: [],
  };
  var paced = api.paceDeck(lanes, [], 18);
  assertPaced(paced);
  var chatRun = 0;
  paced.forEach(function (card) { if (card.type === "chatroom") chatRun += 1; });
  assert.ok(chatRun > 0 && chatRun <= 8);
}

function testAdsAndNoInventedCafe() {
  var source = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
  var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.strictEqual(source.toLowerCase().indexOf("cat cafe"), -1);
  assert.strictEqual(source.toLowerCase().indexOf("cat-cafe"), -1);
  assert.strictEqual(html.toLowerCase().indexOf("come check out the cat cafe"), -1);

  var local = memoryStorage();
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      pro: {
        id: "pro",
        kind: "professional",
        handle: "studio",
        displayName: "Studio",
        featuredPosts: [{ id: "post", title: "Office hours", body: "A normal post." }],
      },
    },
  }));
  var api = loadSwipe(local, memoryStorage());
  var plain = api.sampleDeck(12);
  assert.ok(plain.every(function (card) { return card.type !== "ad" && card.type !== "know"; }));

  var withAd = memoryStorage();
  withAd.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      pro: {
        id: "pro",
        kind: "professional",
        handle: "studio",
        displayName: "Studio",
        marketingAd: { title: "Evening class", body: "A placed marketing video.", videoUrl: "https://example.com/class.mp4", interests: ["class"] },
      },
    },
  }));
  var api2 = loadSwipe(withAd, memoryStorage());
  var shown = api2.sampleDeck(12);
  assert.ok(shown.some(function (card) { return card.type === "ad" && card.handle === "studio" && card.videoUrl; }));
}

testRatingSentences();
testPace();
testFullFriendList();
testSiteRooms();
testAdsAndNoInventedCafe();
console.log("commune-deck.test.js ok");
