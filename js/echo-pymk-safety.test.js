/**
 * ECHO "People you may know" safety (#151 PM ruling).
 *  1. Age: no suggestion across the minor/adult line. Viewer age comes from
 *     user_birth (getMemberAge, the dating and classroom gates' source); the
 *     candidate age is the profile's user_birth-derived rec.age (the dating
 *     candidate gate's source). Unknown on either side = nothing. Under-13 is
 *     never suggested.
 *  2. Exclusions: people I blocked (list_my_blocks, plus live-room blocks),
 *     nothing until the block list answers, and people with a pending
 *     request to me (local incoming + remote notifications).
 *  3. The KNOW-card friend request is awaited: failure shows
 *     "Could not send that request.", never "Friend request sent.".
 * Wording, rotation (REPEATABLE), per-device Pass, seed/real separation and
 * the Pro card are unchanged. Everything is stubbed: no live DB.
 * Run: node --test js/echo-pymk-safety.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var SRC = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
var VIEWER_USER = ["u", "viewer"].join("-");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

function uuid(n) {
  var hex = ("000000000000" + n.toString(16)).slice(-12);
  return "00000000-0000-4000-8000-" + hex;
}

/* opts.block: stub for window.CognationBlock; opts.social: stub for
   window.CognationSocialGraph; opts.signedOut: no live session. */
function loadSwipe(local, opts) {
  opts = opts || {};
  var listeners = {};
  var windowStub = {};
  if (!opts.signedOut) {
    windowStub.CognationSupabase = {
      getSession: function () { return { access_token: "t-" + VIEWER_USER, user: { id: VIEWER_USER } }; },
    };
  }
  windowStub.CognationDatingFlag = { enabled: function () { return true; } };
  if (opts.block) windowStub.CognationBlock = opts.block;
  if (opts.social) windowStub.CognationSocialGraph = opts.social;
  var documentStub = {
    readyState: "complete",
    querySelector: function () { return null; },
    addEventListener: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    dispatchEvent: function (ev) {
      (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); });
    },
  };
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: local,
    sessionStorage: memoryStorage(),
    console: console,
    CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    isFinite: isFinite,
    parseInt: parseInt,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Promise: Promise,
  });
  vm.runInContext(SRC, context);
  var api = windowStub.CognationCommuneSwipe;
  api.__fire = function (name, detail) {
    (listeners[name] || []).slice().forEach(function (fn) { fn({ type: name, detail: detail || {} }); });
  };
  return api;
}

/* Viewer "ada" (user VIEWER_USER) with one friend whose friends are the candidates. */
function stores(candidates, extra) {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
  var profiles = {
    ada: { id: "ada", kind: "personal", displayName: "Ada", user_id: VIEWER_USER, friendIds: ["friend"] },
    friend: { id: "friend", kind: "personal", displayName: "Friend", user_id: "u-friend", age: 30, friendIds: ["ada"] },
  };
  candidates.forEach(function (c) {
    profiles[c.id] = Object.assign({ kind: "personal", displayName: c.id.toUpperCase(), friendIds: ["friend"] }, c);
    profiles.friend.friendIds.push(c.id);
  });
  local.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  if (extra) extra(local);
  return local;
}

function ready(api, viewerAge, ids) {
  api.noteViewerSeedStatus(false);
  ["ada", "friend"].concat(ids).forEach(function (id) { api.noteProfileSeedStatus(id, false); });
  if (viewerAge !== undefined) api.setDatingBirthAge(viewerAge);
}

function knowIds(list) {
  return list.map(function (c) { return c.profileId; }).sort();
}

function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }

var MIXED = [
  { id: "kid", user_id: "u-kid", age: 11 },
  { id: "teen", user_id: "u-teen", age: 15 },
  { id: "eighteen", user_id: "u-eighteen", age: 18 },
  { id: "adult", user_id: "u-adult", age: 40 },
  { id: "noage", user_id: "u-noage" },
  { id: "zeroage", user_id: "u-zeroage", age: 0 },
];
var MIXED_IDS = MIXED.map(function (c) { return c.id; });

test("unknown viewer age shows nothing", function () {
  var api = loadSwipe(stores(MIXED));
  ready(api, undefined, MIXED_IDS);
  assert.deepStrictEqual(api.peopleYouMayKnow(), [], "user_birth not read yet");
  api.setDatingBirthAge(null);
  assert.deepStrictEqual(api.peopleYouMayKnow(), [], "no user_birth row");
});

test("signed-out viewer shows nothing", function () {
  var api = loadSwipe(stores(MIXED), { signedOut: true });
  ready(api, 30, MIXED_IDS);
  assert.deepStrictEqual(api.peopleYouMayKnow(), []);
});

test("adult viewer sees adults only; unknown candidate age is never shown", function () {
  var api = loadSwipe(stores(MIXED));
  ready(api, 30, MIXED_IDS);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["adult", "eighteen"]);
});

test("18-year-old viewer is on the adult side", function () {
  var api = loadSwipe(stores(MIXED));
  ready(api, 18, MIXED_IDS);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["adult", "eighteen"]);
});

test("minor viewer sees minors (13-17) only, never under-13", function () {
  var api = loadSwipe(stores(MIXED));
  ready(api, 16, MIXED_IDS);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["teen"]);
});

test("under-13 is never suggested, to anyone", function () {
  [11, 13, 17, 18, 50].forEach(function (age) {
    var api = loadSwipe(stores(MIXED));
    ready(api, age, MIXED_IDS);
    assert.ok(api.peopleYouMayKnow().every(function (c) { return c.profileId !== "kid"; }), "viewer age " + age);
  });
  var kidViewer = loadSwipe(stores(MIXED));
  ready(kidViewer, 11, MIXED_IDS);
  assert.deepStrictEqual(kidViewer.peopleYouMayKnow(), [], "an under-13 viewer has no same-band candidate");
});

test("candidate age as a string still reads; a bad string is unknown", function () {
  var api = loadSwipe(stores([{ id: "s1", user_id: "u-s1", age: "35" }, { id: "s2", user_id: "u-s2", age: "n/a" }]));
  ready(api, 30, ["s1", "s2"]);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["s1"]);
});

function blockStub(rows) {
  var calls = 0;
  var resolveFn;
  var stub = {
    listMyBlocks: function () {
      calls += 1;
      return new Promise(function (r) { resolveFn = r; });
    },
  };
  stub.answer = function () { resolveFn(rows); };
  stub.calls = function () { return calls; };
  return stub;
}

var ADULTS = [
  { id: "amy", user_id: "u-amy", handle: "amy", age: 30 },
  { id: "bob", user_id: "u-bob", handle: "bob", age: 31 },
  { id: "cal", userId: "u-cal", handle: "cal", age: 32 },
  { id: "dee", user_id: "u-dee", handle: "dee", age: 33 },
];
var ADULT_IDS = ADULTS.map(function (c) { return c.id; });

test("nothing shows until the block list answers; then blocked people stay out", async function () {
  var block = blockStub([{ user_id: "u-bob", handle: "bob" }, { user_id: "u-cal", handle: "cal" }]);
  var api = loadSwipe(stores(ADULTS), { block: block });
  ready(api, 30, ADULT_IDS);
  assert.deepStrictEqual(api.peopleYouMayKnow(), [], "block list not answered yet");
  assert.ok(block.calls() >= 1, "asked list_my_blocks");
  block.answer();
  await flush();
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["amy", "dee"]);
});

test("a person blocked in a live room is excluded", async function () {
  var block = blockStub([]);
  var api = loadSwipe(stores(ADULTS), { block: block });
  ready(api, 30, ADULT_IDS);
  api.peopleYouMayKnow();
  block.answer();
  await flush();
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ADULT_IDS.slice().sort());
  api.hideLiveMessagesFromAuthor("u-dee");
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["amy", "bob", "cal"]);
});

test("the block list is read again for each new sign-in", async function () {
  var block = blockStub([]);
  var api = loadSwipe(stores(ADULTS), { block: block });
  ready(api, 30, ADULT_IDS);
  api.peopleYouMayKnow();
  block.answer();
  await flush();
  var before = block.calls();
  api.__fire("cognation:session-started", {});
  assert.ok(block.calls() > before, "session-started re-reads list_my_blocks");
  assert.deepStrictEqual(api.peopleYouMayKnow(), [], "held until the new list answers");
});

test("people with a pending request to me are excluded (local incoming)", function () {
  var local = stores(ADULTS, function (l) {
    l.setItem("cognation.friend.requests.v1", JSON.stringify({
      outgoing: [],
      incoming: [{ fromId: "bob", toId: "ada", at: 1 }, { fromId: "amy", toId: "someone-else", at: 1 }],
    }));
  });
  var api = loadSwipe(local);
  ready(api, 30, ADULT_IDS);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["amy", "cal", "dee"]);
});

test("people with a pending request to me are excluded (remote notifications)", function () {
  var api = loadSwipe(stores(ADULTS));
  ready(api, 30, ADULT_IDS);
  api.__fire("cognation:remote-notifications-loaded", {
    notifications: [],
    requests: [{ id: "r1", sender_user_id: "u-amy" }, { id: "r2", sender_user_id: "u-cal" }],
  });
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["bob", "dee"]);
  api.__fire("cognation:session-ended", {});
  ready(api, 30, ADULT_IDS);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ADULT_IDS.slice().sort(), "cleared on sign-out");
});

test("seed/real separation unchanged", function () {
  var api = loadSwipe(stores(ADULTS));
  ready(api, 30, ADULT_IDS);
  api.noteProfileSeedStatus("bob", true);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["amy", "cal", "dee"], "real viewer never sees a seed");
  api.noteViewerSeedStatus(true);
  assert.deepStrictEqual(knowIds(api.peopleYouMayKnow()), ["bob"], "seed viewer sees seeds only");
});

test("wording, rotation and per-device Pass unchanged", function () {
  var api = loadSwipe(stores(ADULTS));
  ready(api, 30, ADULT_IDS);
  var cards = api.peopleYouMayKnow();
  assert.ok(cards.length);
  cards.forEach(function (c) {
    assert.strictEqual(c.type, "know");
    assert.strictEqual(c.id, "know-" + c.profileId);
    assert.strictEqual(c.body, "A personal profile you may know.");
  });
  assert.ok(/REPEATABLE\[TYPE\.KNOW\] = true;/.test(SRC), "KNOW stays repeatable");
  var deck = api.sampleDeck(24);
  assert.ok(deck.some(function (c) { return c.type === "know"; }), "KNOW still in the Personal mix");
  api.settleSwipe({ id: "know-amy", type: "know", profileId: "amy" }, "left");
  assert.ok(api.sampleDeck(24).every(function (c) { return c.id !== "know-amy"; }), "Pass hides it on this device");
});

function socialStub(behavior) {
  var calls = [];
  return {
    calls: calls,
    isReady: function () { return true; },
    isRemoteProfileId: function (id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(String(id)); },
    act: function (id, kind) {
      calls.push([id, kind]);
      return behavior(id);
    },
  };
}

test("friend request is awaited: failure shows the real status, never 'sent'", async function () {
  var target = uuid(7);
  var social = socialStub(function () { return Promise.reject(new Error("blocked")); });
  var api = loadSwipe(stores([{ id: target, user_id: "u-t", age: 30 }]), { social: social });
  ready(api, 30, [target]);
  var sync = api.sendPersonalFriendRequest(target);
  assert.notStrictEqual(sync.message, "Friend request sent.", "no success text before the server answers");
  var result = await api.sendKnowFriendRequest(target);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.message, "Could not send that request.");
  assert.ok(social.calls.length >= 1 && social.calls[0][0] === target && social.calls[0][1] === "personal");
});

test("friend request success still says 'Friend request sent.'", async function () {
  var target = uuid(8);
  var social = socialStub(function () { return Promise.resolve({ mode: "requested" }); });
  var api = loadSwipe(stores([{ id: target, user_id: "u-t", age: 30 }]), { social: social });
  ready(api, 30, [target]);
  var result = await api.sendKnowFriendRequest(target);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.message, "Friend request sent.");
});

test("a live session that cannot reach the server never claims 'sent'", async function () {
  var target = uuid(9);
  var notReady = socialStub(function () { return Promise.resolve({ mode: "requested" }); });
  notReady.isReady = function () { return false; };
  var api = loadSwipe(stores([{ id: target, user_id: "u-t", age: 30 }]), { social: notReady });
  ready(api, 30, [target]);
  var result = await api.sendKnowFriendRequest(target);
  assert.strictEqual(result.message, "Could not send that request.");
  var none = loadSwipe(stores([{ id: target, user_id: "u-t", age: 30 }]));
  ready(none, 30, [target]);
  assert.strictEqual((await none.sendKnowFriendRequest(target)).message, "Could not send that request.");
});

test("the swipe handler shows the awaited result, not a sync 'sent'", function () {
  var start = SRC.indexOf('if (dir === "right" && card.type === TYPE.KNOW)');
  assert.ok(start > 0);
  var block = SRC.slice(start, SRC.indexOf('friction("begin"', start));
  assert.ok(/sendKnowFriendRequest\(/.test(block), "KNOW swipe uses the awaited send");
  assert.ok(!/"Friend request sent\."/.test(block), "no hard-coded success text in the swipe handler");
});

test("no new user-facing strings", function () {
  ["Could not send that request.", "Friend request sent.", "This list is full.", "You're already friends.",
    "A personal profile you may know.", "People you may know"].forEach(function (s) {
    assert.ok(SRC.indexOf('"' + s + '"') >= 0, "existing string kept: " + s);
  });
});
