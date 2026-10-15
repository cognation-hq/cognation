/**
 * ECHO swipe learning step 1 — contract + local behavior.
 * Run: node js/echo-swipe-learn.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.ok(/SEE_FRIEND_SHARES_KEY/.test(src), "Friends' shares key");
assert.ok(/LEARN_KEY/.test(src), "swipe-learn key");
assert.ok(/confirmInterestTags/.test(src) && /noteLeftInterestTags/.test(src));
assert.ok(/FADE_LEFT_THRESHOLD/.test(src));
assert.ok(/OFF_INTEREST_FRIEND_RATIO/.test(src) && /offInterest/.test(src));
assert.ok(/viewerIsSeedOrOps/.test(src), "seed swipes excluded");
assert.ok(/swiperIsSeed|fromSeed|profileLooksSeed/.test(src), "seed shares filtered");
assert.ok(/shareAuthorBlocked/.test(src), "blocks honored on shares");
assert.ok(/You're caught up/.test(src) || /You\\'re caught up/.test(src), "deck end copy");
assert.ok(/getSeeFriendShares/.test(src) && /setSeeFriendShares/.test(src));
assert.ok(/data-commune-algo-manager/.test(html), "Algorithm Manager in ECHO");
assert.ok(/data-commune-see-friend-shares/.test(html), "Friends' shares switch");
assert.ok(/Shared by /.test(src), "sharer name why line");
assert.ok(/interest graph stays private|interest graph stays anonymous|Interest graph stays/i.test(src + html));
assert.ok(!/Cap 250/.test(src));
assert.ok(!/Cap 250/.test(html));

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
  };
}
function loadSwipe(localStorage, sessionStorage, extras) {
  extras = extras || {};
  var windowStub = Object.assign({ CognationAuth: extras.CognationAuth }, extras.window || {});
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
    sessionStorage: sessionStorage || memoryStorage(),
    console: console,
    CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
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
  vm.runInContext(src, context);
  return windowStub.CognationCommuneSwipe;
}

function sessionFor(id) {
  return JSON.stringify({ username: id, activeProfileId: id, profileDisplayName: id });
}

/* Right swipe confirms tag + records share with sharer name; seed does not share. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["bea"], interests: ["tech"] },
      bea: { id: "bea", kind: "personal", displayName: "Bea", friendIds: ["ada"] },
    },
  }));
  var api = loadSwipe(local, memoryStorage());
  api.settleSwipe({
    id: "fact-1", type: "fact", title: "AI note", body: "About tech and AI.", interests: ["tech", "ai"],
  }, "right");
  var learn = JSON.parse(local.getItem("cognation.commune.swipe-learn.v1"));
  assert.ok(learn.confirmed.tech >= 1 || learn.confirmed.ai >= 1, "right confirms interest");
  var shares = JSON.parse(local.getItem("cognation.commune.friend-shares.v1"));
  assert.ok(shares.some(function (s) { return s.adId === "fact-1" && s.sharerName === "Ada" && s.swiperId === "ada"; }));
})();

(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("seed-ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      "seed-ada": { id: "seed-ada", kind: "personal", displayName: "SeedAda", handle: "seed-ada-0001", accountKind: "seed", friendIds: [] },
    },
  }));
  var api = loadSwipe(local, memoryStorage(), {
    CognationAuth: { getSession: function () { return { accountKind: "seed", isSeed: true, activeProfileId: "seed-ada", profileDisplayName: "SeedAda" }; } },
  });
  api.settleSwipe({ id: "fact-2", type: "fact", title: "X", body: "tech", interests: ["tech"] }, "right");
  var raw = local.getItem("cognation.commune.friend-shares.v1");
  var shares = raw ? JSON.parse(raw) : [];
  assert.strictEqual(shares.length, 0, "seed swipes excluded from shares");
})();

/* Repeated lefts fade a topic. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  var api = loadSwipe(local, memoryStorage());
  var card = { id: "w1", type: "wellness", title: "Sleep", body: "sleep tips", interests: ["sleep"] };
  api.settleSwipe(card, "left");
  api.settleSwipe(Object.assign({}, card, { id: "w2" }), "left");
  api.settleSwipe(Object.assign({}, card, { id: "w3" }), "left");
  assert.strictEqual(api.isTopicFaded("sleep"), true, "topic fades after repeated lefts");
})();

/* Friends' shares switch off empties friend lane; off-interest ratio honored in pace. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 28, interests: ["tech"] }));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["bea"], interests: ["tech"] },
      bea: { id: "bea", kind: "personal", displayName: "Bea", friendIds: ["ada"] },
    },
  }));
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "s1", adId: "a1", title: "Tech talk", body: "AI", interests: ["tech"], swiperId: "bea", sharerName: "Bea", swiperIsSeed: false },
    { id: "s2", adId: "a2", title: "Baking", body: "cake", interests: ["baking"], swiperId: "bea", sharerName: "Bea", swiperIsSeed: false },
  ]));
  var api = loadSwipe(local, memoryStorage());
  var friends = api.friendShareCards();
  assert.ok(friends.some(function (c) { return !c.offInterest; }), "in-interest friend share flows");
  assert.ok(friends.some(function (c) { return c.offInterest; }), "off-interest friend share available");
  assert.ok(friends.every(function (c) { return /Shared by Bea/.test(c.why || ""); }), "why shows sharer");
  api.setSeeFriendShares(false);
  assert.strictEqual(api.friendShareCards().length, 0, "switch off hides friends' shares");
  api.setSeeFriendShares(true);
  var deck = api.sampleDeck(24);
  var off = deck.filter(function (c) { return c.type === "friend" && c.offInterest; });
  assert.ok(off.length * 6 <= deck.length || off.length <= Math.floor(deck.length / 6) + 1, "off-interest ≤ ~1/6");
  /* Stricter: each off-interest placement must satisfy ratio at its index */
  var seenOff = 0;
  deck.forEach(function (c, i) {
    if (c.type === "friend" && c.offInterest) {
      seenOff += 1;
      assert.ok(seenOff * 6 <= i + 1, "off-interest ratio at index " + i);
    }
  });
})();

/* Seed share never surfaces to a real viewer. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["seed1"], interests: ["tech"] },
      seed1: { id: "seed1", kind: "personal", displayName: "Seed", handle: "seed-0001", accountKind: "seed", seedFleetId: "seed-0001", friendIds: ["ada"] },
    },
  }));
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "sx", adId: "ax", title: "Seed share", body: "tech", interests: ["tech"], swiperId: "seed1", sharerName: "Seed", swiperIsSeed: true },
  ]));
  var api = loadSwipe(local, memoryStorage());
  assert.strictEqual(api.friendShareCards().length, 0, "real users never see seed shares");
})();

console.log("echo-swipe-learn tests passed");
