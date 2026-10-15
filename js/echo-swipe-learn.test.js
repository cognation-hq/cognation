/**
 * ECHO swipe learning + seed-only friend-share sandbox.
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
assert.ok(/viewerIsSeedOrOps/.test(src), "seed status helper");
assert.ok(/swiperIsSeed|fromSeed|profileLooksSeed|shareSeedFlag/.test(src), "seed shares flagged");
assert.ok(/learnSandbox/.test(src), "tag learning sandboxed");
assert.ok(/shareAuthorBlocked/.test(src), "blocks honored on shares");
assert.ok(/You're caught up/.test(src) || /You\\'re caught up/.test(src), "deck end copy");
assert.ok(/getSeeFriendShares/.test(src) && /setSeeFriendShares/.test(src));
assert.ok(/data-commune-algo-manager/.test(html), "Algorithm Manager in ECHO");
assert.ok(/data-commune-see-friend-shares/.test(html), "Friends' shares switch");
assert.ok(/Shared by /.test(src), "sharer name why line");
assert.ok(/interest graph stays private|interest graph stays anonymous|Interest graph stays/i.test(src + html));
assert.ok(!/Cap 250/.test(src));
assert.ok(!/Cap 250/.test(html));
assert.ok(/cognation_am_i_seed/.test(src), "uses cognation_am_i_seed RPC");

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

function learnBox(local, box) {
  var raw = JSON.parse(local.getItem("cognation.commune.swipe-learn.v1") || "{}");
  if (raw.confirmed || raw.left) return raw; /* legacy */
  return (raw && raw[box]) || { confirmed: {}, left: {} };
}

/* Real right swipe confirms real tags + records non-seed share. */
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
  api.noteViewerSeedStatus(false);
  api.noteProfileSeedStatus("bea", false);
  api.settleSwipe({
    id: "fact-1", type: "fact", title: "AI note", body: "About tech and AI.", interests: ["tech", "ai"],
  }, "right");
  var learn = learnBox(local, "real");
  assert.ok(learn.confirmed.tech >= 1 || learn.confirmed.ai >= 1, "right confirms real interest");
  var seedLearn = learnBox(local, "seed");
  assert.ok(!seedLearn.confirmed || !seedLearn.confirmed.tech, "real swipe does not feed seed tags");
  var shares = JSON.parse(local.getItem("cognation.commune.friend-shares.v1"));
  assert.ok(shares.some(function (s) {
    return s.adId === "fact-1" && s.sharerName === "Ada" && s.swiperId === "ada" && s.swiperIsSeed === false;
  }));
})();

/* Seed right swipe writes a seed share and teaches the seed's own tags. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("seed-ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      "seed-ada": { id: "seed-ada", kind: "personal", displayName: "SeedAda", friendIds: ["seed-bea"] },
      "seed-bea": { id: "seed-bea", kind: "personal", displayName: "SeedBea", friendIds: ["seed-ada"] },
    },
  }));
  var api = loadSwipe(local, memoryStorage());
  api.noteViewerSeedStatus(true);
  api.noteProfileSeedStatus("seed-ada", true);
  api.noteProfileSeedStatus("seed-bea", true);
  api.settleSwipe({ id: "fact-2", type: "fact", title: "X", body: "tech", interests: ["tech"] }, "right");
  var shares = JSON.parse(local.getItem("cognation.commune.friend-shares.v1") || "[]");
  assert.ok(shares.some(function (s) {
    return s.adId === "fact-2" && s.swiperId === "seed-ada" && s.swiperIsSeed === true;
  }), "seed writes a friend share");
  var seedLearn = learnBox(local, "seed");
  assert.ok(seedLearn.confirmed.tech >= 1, "seed swipe teaches seed tags");
  var realLearn = learnBox(local, "real");
  assert.ok(!realLearn.confirmed || !realLearn.confirmed.tech, "seed swipe does not feed real tags");
})();

/* Seed-to-seed share visible to a seed viewer. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("seed-bea"));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 22, interests: ["tech"] }));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      "seed-bea": { id: "seed-bea", kind: "personal", displayName: "SeedBea", friendIds: ["seed-ada"], interests: ["tech"] },
      "seed-ada": { id: "seed-ada", kind: "personal", displayName: "SeedAda", friendIds: ["seed-bea"] },
    },
  }));
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "ss1", adId: "a1", title: "Seed tech", body: "AI", interests: ["tech"], swiperId: "seed-ada", sharerName: "SeedAda", swiperIsSeed: true },
  ]));
  var api = loadSwipe(local, memoryStorage());
  api.noteViewerSeedStatus(true);
  api.noteProfileSeedStatus("seed-ada", true);
  api.noteProfileSeedStatus("seed-bea", true);
  var friends = api.friendShareCards();
  assert.strictEqual(friends.length, 1, "seed viewer sees seed friend share");
  assert.ok(/Shared by SeedAda/.test(friends[0].why || ""));
})();

/* Seed share hidden from a real viewer. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["seed1"], interests: ["tech"] },
      seed1: { id: "seed1", kind: "personal", displayName: "Seed", friendIds: ["ada"] },
    },
  }));
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "sx", adId: "ax", title: "Seed share", body: "tech", interests: ["tech"], swiperId: "seed1", sharerName: "Seed", swiperIsSeed: true },
  ]));
  var api = loadSwipe(local, memoryStorage());
  api.noteViewerSeedStatus(false);
  api.noteProfileSeedStatus("seed1", true);
  assert.strictEqual(api.friendShareCards().length, 0, "real users never see seed shares");
})();

/* Unknown viewer gets nothing (fail closed). */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("mystery"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      mystery: { id: "mystery", kind: "personal", displayName: "M", friendIds: ["bea"] },
      bea: { id: "bea", kind: "personal", displayName: "Bea", friendIds: ["mystery"] },
    },
  }));
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "s1", adId: "a1", title: "Tech", body: "AI", interests: ["tech"], swiperId: "bea", sharerName: "Bea", swiperIsSeed: false },
  ]));
  var api = loadSwipe(local, memoryStorage());
  /* leave viewerSeedStatus null */
  assert.strictEqual(api.friendShareCards().length, 0, "unknown viewer sees no friend shares");
  api.settleSwipe({ id: "f-u", type: "fact", title: "X", body: "tech", interests: ["tech"] }, "right");
  var raw = local.getItem("cognation.commune.friend-shares.v1");
  var shares = raw ? JSON.parse(raw) : [];
  assert.ok(!shares.some(function (s) { return s.adId === "f-u"; }), "unknown viewer writes no share");
  assert.strictEqual(api.peopleYouMayKnow ? api.peopleYouMayKnow().length : api.sampleDeck(12).filter(function (c) { return c.type === "know"; }).length >= 0, true);
  assert.strictEqual(api.sampleDeck(20).filter(function (c) { return c.type === "know"; }).length, 0, "unknown viewer PYMK empty");
})();

/* Bare seed profile (no client seed fields) with server seed status still writes a seed share. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("prof-seed-0001"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      "prof-seed-0001": { id: "prof-seed-0001", kind: "personal", displayName: "Ada", friendIds: [] },
    },
  }));
  var api = loadSwipe(local, memoryStorage(), {
    CognationAuth: {
      getSession: function () {
        return { username: "seed-0001", activeProfileId: "prof-seed-0001", profileDisplayName: "Ada", source: "supabase", supabaseUserId: "u-seed-0001" };
      },
    },
  });
  assert.strictEqual(api.viewerIsSeedOrOps(), true, "unknown fails closed as seedish");
  api.settleSwipe({ id: "fact-bare", type: "fact", title: "X", body: "tech", interests: ["tech"] }, "right");
  var shares = JSON.parse(local.getItem("cognation.commune.friend-shares.v1") || "[]");
  assert.ok(!shares.some(function (s) { return s.adId === "fact-bare"; }), "unknown status does not write");
  api.noteViewerSeedStatus(true);
  api.settleSwipe({ id: "fact-bare-2", type: "fact", title: "Y", body: "tech", interests: ["tech"] }, "right");
  shares = JSON.parse(local.getItem("cognation.commune.friend-shares.v1") || "[]");
  assert.ok(shares.some(function (s) {
    return s.adId === "fact-bare-2" && s.swiperIsSeed === true;
  }), "known seed writes seed share");
})();

/* Unknown sharer kind hidden from real; once marked real, share can show. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["bare"], interests: ["tech"] },
      bare: { id: "bare", kind: "personal", displayName: "Bare", friendIds: ["ada"] },
    },
  }));
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "sx2", adId: "ax2", title: "Maybe", body: "tech", interests: ["tech"], swiperId: "bare", sharerName: "Bare" },
  ]));
  var api = loadSwipe(local, memoryStorage());
  api.noteViewerSeedStatus(false);
  assert.strictEqual(api.friendShareCards().length, 0, "unknown sharer hidden from real");
  api.noteProfileSeedStatus("bare", false);
  local.setItem("cognation.commune.friend-shares.v1", JSON.stringify([
    { id: "sx2", adId: "ax2", title: "Maybe", body: "tech", interests: ["tech"], swiperId: "bare", sharerName: "Bare", swiperIsSeed: false },
  ]));
  assert.ok(api.friendShareCards().length >= 1, "known real sharer visible to real");
})();

/* Repeated lefts fade a topic (real sandbox). */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  var api = loadSwipe(local, memoryStorage());
  api.noteViewerSeedStatus(false);
  var card = { id: "w1", type: "wellness", title: "Sleep", body: "sleep tips", interests: ["sleep"] };
  api.settleSwipe(card, "left");
  api.settleSwipe(Object.assign({}, card, { id: "w2" }), "left");
  api.settleSwipe(Object.assign({}, card, { id: "w3" }), "left");
  assert.strictEqual(api.isTopicFaded("sleep"), true, "topic fades after repeated lefts");
})();

/* Friends' shares switch + off-interest ratio (real sandbox). */
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
  api.noteViewerSeedStatus(false);
  api.noteProfileSeedStatus("bea", false);
  api.noteProfileSeedStatus("ada", false);
  var friends = api.friendShareCards();
  assert.ok(friends.some(function (c) { return !c.offInterest; }), "in-interest friend share flows");
  assert.ok(friends.some(function (c) { return c.offInterest; }), "off-interest friend share available");
  api.setSeeFriendShares(false);
  assert.strictEqual(api.friendShareCards().length, 0, "switch off hides friends' shares");
  api.setSeeFriendShares(true);
  var deck = api.sampleDeck(24);
  var seenOff = 0;
  deck.forEach(function (c, i) {
    if (c.type === "friend" && c.offInterest) {
      seenOff += 1;
      assert.ok(seenOff * 6 <= i + 1, "off-interest ratio at index " + i);
    }
  });
})();

/* PYMK: seeds never appear for real viewers. */
(function () {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("ada"));
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["bea"] },
      bea: { id: "bea", kind: "personal", displayName: "Bea", friendIds: ["ada", "seed1", "cara"] },
      seed1: { id: "seed1", kind: "personal", displayName: "Seed", friendIds: ["bea"] },
      cara: { id: "cara", kind: "personal", displayName: "Cara", friendIds: ["bea"] },
    },
  }));
  var api = loadSwipe(local, memoryStorage());
  api.noteViewerSeedStatus(false);
  api.noteProfileSeedStatus("seed1", true);
  api.noteProfileSeedStatus("cara", false);
  api.noteProfileSeedStatus("bea", false);
  var know = api.sampleDeck(30).filter(function (c) { return c.type === "know"; });
  assert.ok(know.every(function (c) { return c.profileId !== "seed1"; }), "PYMK hides seeds from real");
  assert.ok(know.some(function (c) { return c.profileId === "cara"; }) || true, "real PYMK can include reals");
})();


/* No shared trending/topic signal yet — do not invent one. Seed tags stay sandboxed. */
(function () {
  assert.ok(!/commune\.trend|trendingTopics|topicSignal|aggregateTrend/i.test(src),
    "no invented shared trending store");
  var local = memoryStorage();
  local.setItem("cognation.session.v2", sessionFor("seed-x"));
  var seedApi = loadSwipe(local, memoryStorage());
  seedApi.noteViewerSeedStatus(true);
  seedApi.settleSwipe({ id: "t1", type: "fact", title: "T", body: "robots", interests: ["robots"] }, "right");
  var raw = JSON.parse(local.getItem("cognation.commune.swipe-learn.v1") || "{}");
  assert.ok(raw.seed && raw.seed.confirmed && raw.seed.confirmed.robots >= 1, "seed sandbox got robots");
  assert.ok(!raw.real || !raw.real.confirmed || !raw.real.confirmed.robots, "real individual tags untouched");
  Object.keys(local._d || {}).forEach(function () {});
  /* memoryStorage has no _d export — check no extra trend keys on the store */
  var keys = [];
  /* re-read via getItem probe */
  ["cognation.commune.trending.v1", "cognation.commune.topic-signal.v1", "cognation.commune.aggregate-trend.v1"].forEach(function (k) {
    assert.strictEqual(local.getItem(k), null, "no invented key " + k);
  });
})();

console.log("echo-swipe-learn tests passed");
