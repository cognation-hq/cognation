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
    classroom: [{ id: "cl1", title: "Insurance basics" }],
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
    classroom: [],
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
    classroom: api.visibleClassroomSessions(),
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

function stableId(id) {
  return String(id || "").replace(/-r\d+$/, "");
}

function deckHas(deck, id) {
  return deck.some(function (card) { return stableId(card.id) === id; });
}

function sessionFor(id) {
  return JSON.stringify({ username: id, activeProfileId: id, source: "demo" });
}

function testPassStaysHiddenForViewer() {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  var session = memoryStorage();
  var api = loadSwipe(local, session);

  api.settleSwipe({ id: "fact-hearts", type: "fact", title: "A public fact", body: "Hearts." }, "left");
  assert.strictEqual(deckHas(api.sampleDeck(24), "fact-hearts"), false);
  assert.deepStrictEqual(api.omitPassed([
    { id: "fact-hearts" },
    { id: "fact-hearts-r6" },
    { id: "fact-honey" },
  ]).map(function (card) { return card.id; }), ["fact-honey"]);

  var refreshed = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(refreshed.sampleDeck(24), "fact-hearts"), false);
  assert.strictEqual(deckHas(refreshed.sampleDeck(24), "fact-honey"), true);

  api.settleSwipe({ id: "fact-trees-r4", type: "fact" }, "left");
  assert.strictEqual(deckHas(loadSwipe(local, memoryStorage()).sampleDeck(24), "fact-trees"), false);

  api.settleSwipe({
    id: "fact-honey",
    type: "fact",
    title: "A public fact",
    body: "Honey lasts.",
  }, "right");
  var kept = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(kept.sampleDeck(24), "fact-honey"), true);
  var passes = JSON.parse(local.getItem("cognation.commune.swipe.dismissed.v1"));
  assert.ok(passes.ada.indexOf("fact-honey") === -1);
  assert.ok(passes.ada.indexOf("fact-hearts") !== -1);

  local.setItem("cognation.session.v2", sessionFor("bea"));
  var other = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(other.sampleDeck(24), "fact-hearts"), true);
  assert.strictEqual(deckHas(other.sampleDeck(24), "fact-trees"), true);
  other.settleSwipe({ id: "well-walk", type: "wellness" }, "left");
  assert.strictEqual(deckHas(other.sampleDeck(24), "well-walk"), false);

  local.setItem("cognation.session.v2", sessionFor("ada"));
  var adaAgain = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(adaAgain.sampleDeck(24), "fact-hearts"), false);
  assert.strictEqual(deckHas(adaAgain.sampleDeck(24), "well-walk"), true);
}

function testLegacySessionPassBelongsToViewer() {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  var session = memoryStorage();
  session.setItem("cognation.commune.swipe.dismissed.v1", JSON.stringify(["fact-banana", "room-site-moms-r2"]));
  var api = loadSwipe(local, session);
  assert.strictEqual(deckHas(api.sampleDeck(24), "fact-banana"), false);
  assert.strictEqual(session.getItem("cognation.commune.swipe.dismissed.v1"), null);
  var stored = JSON.parse(local.getItem("cognation.commune.swipe.dismissed.v1"));
  assert.deepStrictEqual(stored.ada.slice().sort(), ["fact-banana", "room-site-moms"]);

  local.setItem("cognation.session.v2", sessionFor("bea"));
  var bea = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(bea.sampleDeck(24), "fact-banana"), true);
}

function testRightSwipeStillKeeps() {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["friend"] },
      friend: { id: "friend", kind: "personal", displayName: "Friend", friendIds: ["ada", "sam"] },
      sam: { id: "sam", kind: "personal", displayName: "Sam", friendIds: ["friend"] },
      pro: {
        id: "pro",
        kind: "professional",
        handle: "studio",
        displayName: "Studio",
        marketingAd: { title: "Evening class", body: "A placed class.", interests: ["class"] },
      },
    },
  }));
  var api = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(api.sampleDeck(18), "ad-pro-0"), true);
  assert.strictEqual(deckHas(api.sampleDeck(18), "know-sam"), true);

  api.settleSwipe({
    id: "ad-pro-0",
    type: "ad",
    title: "Evening class",
    body: "A placed class.",
    interests: ["class"],
    profileId: "pro",
    handle: "studio",
  }, "right");
  var shares = JSON.parse(local.getItem("cognation.commune.friend-shares.v1"));
  assert.ok(shares.some(function (share) { return share.adId === "ad-pro-0" && share.swiperId === "ada"; }));
  assert.strictEqual(deckHas(loadSwipe(local, memoryStorage()).sampleDeck(18), "ad-pro-0"), true);

  api.settleSwipe({ id: "know-sam", type: "know", profileId: "sam", title: "Sam" }, "right");
  assert.strictEqual(deckHas(api.sampleDeck(18), "know-sam"), true);

  api.settleSwipe({ id: "ad-pro-0", type: "ad", title: "Evening class" }, "left");
  api.settleSwipe({ id: "know-sam", type: "know", profileId: "sam" }, "left");
  var after = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(after.sampleDeck(18), "ad-pro-0"), false);
  assert.strictEqual(deckHas(after.sampleDeck(18), "know-sam"), false);

  var profiles = JSON.parse(local.getItem("cognation.profiles.v1"));
  profiles.profiles.bea = { id: "bea", kind: "personal", displayName: "Bea", friendIds: ["friend"] };
  local.setItem("cognation.profiles.v1", JSON.stringify(profiles));
  local.setItem("cognation.session.v2", sessionFor("bea"));
  var bea = loadSwipe(local, memoryStorage());
  assert.strictEqual(deckHas(bea.sampleDeck(18), "ad-pro-0"), true);
  assert.strictEqual(deckHas(bea.sampleDeck(18), "know-sam"), true);
}


function testClassroomSurface() {
  var api = loadSwipe(memoryStorage(), memoryStorage());
  var catalog = api.classroomCatalog();
  assert.strictEqual(catalog.length, 3);
  assert.strictEqual(
    catalog.map(function (c) { return String(c.id); }).join(","),
    "class-insurance,class-voting,class-business"
  );
  catalog.forEach(function (card) {
    assert.strictEqual(card.type, "classroom");
    assert.strictEqual(card.host, "Cognation");
    assert.ok(card.minAge >= 18);
  });

  api.setMemberProfile({ age: 16, interests: ["insurance"] });
  assert.strictEqual(api.classroomAllowed(), false);
  assert.strictEqual(api.visibleClassroomSessions().length, 0);

  api.setMemberProfile({ age: 18, interests: ["insurance"] });
  assert.strictEqual(api.classroomAllowed(), true);
  assert.strictEqual(api.visibleClassroomSessions().length, 3);

  var deck = api.sampleDeck(24);
  assert.ok(deck.some(function (c) { return c.type === "classroom"; }), "adult deck should include Classroom");
  assertPaced(deck);

  /* Featured mix 1:1 — classroom should appear without stacking runs of itself */
  var classIdx = [];
  deck.forEach(function (c, i) { if (c.type === "classroom") classIdx.push(i); });
  for (var i = 1; i < classIdx.length; i++) {
    assert.ok(classIdx[i] - classIdx[i - 1] >= 2, "classroom cards must not run back-to-back");
  }

  var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.indexOf('id="panel-classroom"') !== -1, "index must include #panel-classroom");
  assert.ok(html.indexOf("data-classroom") !== -1, "index must include data-classroom");
}


function testDatingBlankCard1Guards() {
  var swipeSrc = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
  assert.ok(swipeSrc.indexOf("ensureDatingBiosThenRebuild") !== -1, "dating toggle rehydrates before rebuild");
  assert.ok(swipeSrc.indexOf("prev === next") !== -1, "setSeeDating skips no-op emit");
  assert.ok(swipeSrc.indexOf('String(rec.bio || "").trim()') !== -1, "dating body trims whitespace bios");
  var hydrateSrc = fs.readFileSync(path.join(root, "js/seedops-dating-hydrate.js"), "utf8");
  assert.ok(hydrateSrc.indexOf("datingBiosReady") !== -1, "hydrate exposes datingBiosReady");
  assert.ok(hydrateSrc.indexOf("ensureDatingContent") !== -1, "hydrate exposes ensureDatingContent");
  assert.ok(hydrateSrc.indexOf("seeDating before setMemberProfile") !== -1, "prefs apply order avoids blank Card 1 race");
}

testRatingSentences();
testDatingBlankCard1Guards();
testPace();
testFullFriendList();
testSiteRooms();
testAdsAndNoInventedCafe();
testPassStaysHiddenForViewer();
testLegacySessionPassBelongsToViewer();
testRightSwipeStillKeeps();

function testClassroomAgeGateToast() {
  var api = loadSwipe(memoryStorage(), memoryStorage());
  api.setMemberProfile({ age: 16, interests: ["insurance"] });
  assert.strictEqual(api.classroomAllowed(), false);
  assert.strictEqual(api.openClassroom("class-insurance", false), false);

  api.setMemberProfile({ age: null, interests: ["insurance"] });
  assert.strictEqual(api.classroomAllowed(), false);
  assert.strictEqual(api.openClassroom("class-insurance", false), false);

  api.setMemberProfile({ age: 28, interests: ["insurance"] });
  assert.strictEqual(api.classroomAllowed(), true);

  var src = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
  assert.ok(
    src.indexOf("Classroom is for members 18+") !== -1,
    "openClassroom must toast age-gate copy"
  );
  assert.ok(src.indexOf("syncAgeFromAuthMetadata") !== -1, "must try auth member_age sync");

  var social = fs.readFileSync(path.join(root, "js/supabase-social.js"), "utf8");
  assert.ok(social.indexOf("friend_user_id.eq.") !== -1, "refreshFriends both directions");
  assert.ok(social.indexOf("cognation:circle-friends-hydrated") !== -1, "circle hydrate emit");
  assert.ok(social.indexOf("slice(0, 250)") !== -1, "friend hydrate capped at 250");

  var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
  assert.ok(tower.indexOf("CognationTowerOpenProfile") !== -1, "circle click opens profile");
  assert.ok(tower.indexOf("cognation:circle-friends-hydrated") !== -1, "circle restarts on hydrate");
}

function testChatroomReplyReleasesSwipe() {
  /* Source guard: after a room reply, release roomId lock so deck swipe works again. */
  var src = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
  assert.ok(src.indexOf("function releaseRoomSurface") !== -1, "releaseRoomSurface helper");
  assert.ok(src.indexOf("function clearPointer") !== -1, "clearPointer helper");
  var submitIdx = src.indexOf('form.addEventListener("submit"');
  assert.ok(submitIdx !== -1, "room compose submit handler");
  var submitChunk = src.slice(submitIdx, submitIdx + 900);
  assert.ok(submitChunk.indexOf("releaseRoomSurface()") !== -1, "submit releases room surface");
  assert.ok(submitChunk.indexOf("friction(\"complete\", \"chat\")") !== -1, "submit still completes chat friction");
  assert.ok(
    submitChunk.indexOf("if (room) paintRoom(room);") === -1,
    "submit must not leave the room open via paintRoom (that kept state.roomId and blocked swipe)"
  );
  assert.ok(src.indexOf("Sent. Swipe when you are ready.") !== -1, "status after send");
  assert.ok(src.indexOf("if (state.busy || state.roomId || state.classroomId) return;") !== -1, "swipe still guards open room");
}

testClassroomSurface();
testClassroomAgeGateToast();
testChatroomReplyReleasesSwipe();
console.log("commune-deck.test.js ok");
