/**
 * Dating-match Tower message: one live local Cognation event line (not a new card).
 * Run: node js/dating-match-event-line.test.js
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

function loadMessages(localStorage) {
  var windowStub = { localStorage: localStorage };
  var refreshCalls = 0;
  var documentStub = {
    readyState: "complete",
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    dispatchEvent: function () { refreshCalls += 1; },
  };
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: localStorage,
    console: console,
    CustomEvent: function CustomEvent(name, init) {
      this.type = name;
      this.detail = init && init.detail;
    },
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js/commune-messages.js"), "utf8"), context);
  return { store: windowStub.CognationMessageStore, refreshCalls: function () { return refreshCalls; } };
}

function futureIso(days) {
  var d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10) + "T18:00:00";
}

function testPickPrefersPublicSkipsCalDemo() {
  var local = memoryStorage();
  local.setItem(
    "cognation.profiles.v1",
    JSON.stringify({
      profiles: {
        pro: {
          id: "pro",
          kind: "professional",
          handle: "studio",
          displayName: "Studio",
          city: "Austin",
          state: "TX",
          calendarEvents: [
            {
              id: "cal-demo-1",
              title: "Coffee with Jordan",
              date: futureIso(2).slice(0, 10),
              time: "10:00",
              public: true,
            },
            {
              id: "live-yoga",
              title: "Free park yoga",
              date: futureIso(3).slice(0, 10),
              time: "09:00",
              where: "Zilker",
              public: true,
            },
          ],
        },
      },
    })
  );
  local.setItem(
    "cognation.member.profile.v1",
    JSON.stringify({ city: "Austin", state: "TX", age: 28 })
  );
  var api = loadSwipe(local, memoryStorage());
  var events = api.publicEvents();
  assert.ok(
    events.every(function (e) { return String(e.id).indexOf("cal-demo") === -1; }),
    "publicEvents must skip cal-demo seeds"
  );
  assert.ok(
    events.some(function (e) { return e.title === "Free park yoga"; }),
    "real public event should surface"
  );
  var line = api.pickLocalEventLine();
  assert.ok(line.indexOf("Local event:") === 0, "line prefix");
  assert.ok(line.indexOf("Free park yoga") !== -1, "uses real public event");
  assert.ok(line.toLowerCase().indexOf("coffee with jordan") === -1, "must not use cal-demo copy");
}

function testCuratedFallbackWhenNoPublic() {
  var local = memoryStorage();
  local.setItem("cognation.profiles.v1", JSON.stringify({ profiles: {} }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 28 }));
  var api = loadSwipe(local, memoryStorage());
  assert.strictEqual(api.publicEvents().length, 0);
  var line = api.pickLocalEventLine();
  assert.ok(line.indexOf("Local event:") === 0, "curated Cognation free line");
  assert.ok(line.indexOf("Cognation") !== -1, "curated rows are Cognation platform events");
  assert.ok(line.toLowerCase().indexOf("cal-demo") === -1);
}

function testOpenMatchStoresAndOmits() {
  var local = memoryStorage();
  var loaded = loadMessages(local);
  var store = loaded.store;

  var withLine = store.openMatch(
    { id: "you", name: "You" },
    { id: "sam", name: "Sam" },
    { eventLine: "Local event: Free park yoga · Zilker" }
  );
  assert.ok(withLine);
  assert.strictEqual(withLine.messages.length, 1);
  assert.strictEqual(withLine.messages[0].eventLine, "Local event: Free park yoga · Zilker");
  assert.ok(withLine.messages[0].mutualMatch);
  assert.ok(withLine.messages[0].body.indexOf("You both swiped right") !== -1);

  var local2 = memoryStorage();
  var store2 = loadMessages(local2).store;
  var bare = store2.openMatch({ id: "you", name: "You" }, { id: "pat", name: "Pat" }, {});
  assert.ok(bare);
  assert.strictEqual(bare.messages[0].eventLine, undefined);

  var local3 = memoryStorage();
  var store3 = loadMessages(local3).store;
  var blocked = store3.openMatch(
    { id: "you", name: "You" },
    { id: "lee", name: "Lee" },
    { eventLine: "Local event: Coffee with Jordan cal-demo-1" }
  );
  assert.strictEqual(blocked.messages[0].eventLine, undefined, "cal-demo eventLine stripped");
}

function testDatingPathOnlyWiresEventLine() {
  var swipeSrc = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
  var msgSrc = fs.readFileSync(path.join(root, "js/commune-messages.js"), "utf8");
  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

  var settleIdx = swipeSrc.indexOf("function settleSwipe");
  assert.ok(settleIdx !== -1, "settleSwipe helper");
  var datingIdx = swipeSrc.indexOf("if (card.type === TYPE.DATING)", settleIdx);
  assert.ok(datingIdx !== -1, "dating settle branch");
  var datingChunk = swipeSrc.slice(datingIdx, datingIdx + 1200);
  assert.ok(datingChunk.indexOf("pickLocalEventLine") !== -1, "dating match picks event line");
  assert.ok(datingChunk.indexOf("eventLine:") !== -1, "dating match passes eventLine");

  var friendIdx = swipeSrc.indexOf("if (card.type === TYPE.FRIEND || card.type === TYPE.EVENT");
  assert.ok(friendIdx !== -1);
  var friendChunk = swipeSrc.slice(friendIdx, friendIdx + 500);
  assert.ok(friendChunk.indexOf("openMatch") === -1, "friend/event swipe must not openMatch");
  assert.ok(friendChunk.indexOf("pickLocalEventLine") === -1, "friend path must not pick event line");

  assert.ok(msgSrc.indexOf("data-match-event-line") !== -1, "render event line inside match message");
  assert.ok(msgSrc.indexOf("tower-msg-event-line") !== -1);
  assert.ok(css.indexOf(".tower-msg-event-line") !== -1, "CSS for in-message line");

  var hydrate = fs.readFileSync(path.join(root, "js/seedops-dating-hydrate.js"), "utf8");
  assert.ok(hydrate.indexOf("eventLine") === -1, "seed dating hydrate must not invent eventLine");
  assert.ok(hydrate.indexOf("Local event:") === -1, "seed dating hydrate must not invent event copy");
  assert.ok(hydrate.indexOf("openMatch") === -1, "seed dating hydrate must not open match threads");
}

function testSettleSwipeDatingCallsOpenMatchWithLine() {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({
    username: "ada",
    activeProfileId: "ada",
    source: "demo",
  }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({
    age: 28,
    city: "Austin",
    state: "TX",
  }));
  local.setItem("cognation.commune.seeDating.v1", "true");
  local.setItem(
    "cognation.profiles.v1",
    JSON.stringify({
      profiles: {
        ada: {
          id: "ada",
          kind: "personal",
          displayName: "Ada",
          city: "Austin",
          state: "TX",
        },
        sam: {
          id: "sam",
          kind: "personal",
          displayName: "Sam",
          city: "Austin",
          state: "TX",
          datingContent: true,
          avatarDataUrl: "data:image/png;base64,xx",
        },
        pro: {
          id: "pro",
          kind: "professional",
          handle: "studio",
          displayName: "Studio",
          city: "Austin",
          state: "TX",
          publicEvents: [
            {
              id: "live-market",
              title: "East Side market",
              when: futureIso(5),
              where: "Plaza",
            },
          ],
        },
      },
    })
  );
  /* Mutual right already on file so settleSwipe opens the match. */
  local.setItem(
    "cognation.commune.dating.rights.v1",
    JSON.stringify({ "sam|ada": Date.now() })
  );

  var opened = null;
  var windowStub = {
    CognationMessageStore: {
      openMatch: function (a, b, opts) {
        opened = { a: a, b: b, opts: opts || {} };
        return { id: "match-test" };
      },
    },
  };
  var documentStub = {
    readyState: "complete",
    querySelector: function () { return null; },
    addEventListener: function () {},
    dispatchEvent: function () {},
  };
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: local,
    sessionStorage: memoryStorage(),
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
  var api = windowStub.CognationCommuneSwipe;
  api.settleSwipe(
    {
      id: "date-sam",
      type: "dating",
      profileId: "sam",
      name: "Sam",
      dating: true,
    },
    "right"
  );
  assert.ok(opened, "dating mutual match must call openMatch");
  assert.ok(opened.opts.eventLine, "eventLine passed on dating match");
  assert.ok(opened.opts.eventLine.indexOf("East Side market") !== -1, "uses public event");
}

testPickPrefersPublicSkipsCalDemo();
testCuratedFallbackWhenNoPublic();
testOpenMatchStoresAndOmits();
testDatingPathOnlyWiresEventLine();
testSettleSwipeDatingCallsOpenMatchWithLine();
console.log("dating-match-event-line.test.js ok");
