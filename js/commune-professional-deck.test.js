/**
 * Commune Personal | Professional pipe switch + Professional deck (Alexa GO 2026-10-07).
 * Run: node js/commune-professional-deck.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

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

/* Signed in (#309: a signed-out or demo viewer's gates see age 0). With an age,
   the stored session is a Supabase sign-in, the member profile is this user's,
   and the age comes from user_birth (setDatingBirthAge), not the local profile.
   No live Supabase session, so the local page registry still feeds the deck. */
var VIEWER_ID = ["u", "viewer"].join("-");
function signInAs(localStorage) {
  var sess = JSON.parse(localStorage.getItem("cognation.session.v2") || "{}");
  sess.source = "supabase"; sess.supabaseUserId = VIEWER_ID;
  if (!sess.username) { sess.username = "ada"; sess.activeProfileId = "ada"; }
  localStorage.setItem("cognation.session.v2", JSON.stringify(sess));
  var prof = JSON.parse(localStorage.getItem("cognation.member.profile.v1") || "{}");
  prof.ownerUserId = VIEWER_ID;
  localStorage.setItem("cognation.member.profile.v1", JSON.stringify(prof));
}
function loadSwipe(localStorage, sessionStorage, age) {
  if (age != null) signInAs(localStorage);
  var windowStub = {};
  var documentStub = {
    readyState: "complete",
    querySelector: function () { return null; },
    addEventListener: function () {},
    dispatchEvent: function () {},
    createElement: function () {
      var el = { className: "", innerHTML: "" };
      el.setAttribute = function () {};
      el.classList = { add: function () {} };
      return el;
    },
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
  vm.runInContext(src("js/content-creator-room.js"), context);
  vm.runInContext(src("js/age-floor-keywords.js"), context);
  vm.runInContext(src("js/commune-swipe.js"), context);
  if (age != null) windowStub.CognationCommuneSwipe.setDatingBirthAge(age);
  windowStub.CognationCommuneSwipe.contentCreator = windowStub.CognationContentCreator;
  return windowStub.CognationCommuneSwipe;
}

var html = src("index.html");
var css = src("css/styles.css");
var swipeSrc = src("js/commune-swipe.js");

/* Pipe switch markup: same chrome as SIGNAL News | Feed (signal-subtabs + site-switch). */
var switchMatch = html.match(/<div class="commune-mode-switch[^"]*"[\s\S]*?<\/div>/);
assert.ok(switchMatch, "Commune Personal|Professional switch present");
var sw = switchMatch[0];
assert.ok(/signal-subtabs/.test(sw) && /site-switch/.test(sw), "switch reuses signal-subtabs + site-switch shell");
assert.ok(/data-commune-mode-btn="personal"[^>]*aria-selected="true"/.test(sw) || /aria-selected="true"[^>]*data-commune-mode-btn="personal"/.test(sw), "Personal active by default");
assert.ok(/class="[^"]*site-switch-side[^"]*is-active[^"]*"[^>]*>Personal</.test(sw), "active side carries site-switch-side is-active");
assert.ok(/data-commune-mode-btn="professional"/.test(sw) && />Professional</.test(sw), "Professional side present");
assert.ok(/site-switch-sep[^>]*>\|</.test(sw), "pipe separator");
assert.ok(html.indexOf("data-commune-mode-switch") < html.indexOf("data-commune-see-dating"), "switch sits in the Commune header");
assert.ok(/\.signal-subtab\.is-selected[\s\S]*?linear-gradient/.test(css), "lilac ombre active chrome exists for the shared class");
assert.ok(/\[data-commune-mode="professional"\] \.commune-dating-toggle-row/.test(css), "dating toggle hidden on Professional");
assert.ok(/\.commune-type-mark\[data-type-mark="popculture"\]/.test(css), "type marks styled on dark shell");

/* Personal stays default and unchanged. */
var api = loadSwipe(memoryStorage(), memoryStorage());
assert.strictEqual(api.getMode(), "personal");
assert.strictEqual(api.FEATURED_ORDER.join(","), "classroom,ad,chatroom,dating,content", "Personal 1:1 order unchanged");
assert.strictEqual(api.AD_MAX_MS, 3000, "ads max 3s");
assert.strictEqual(
  api.PRO_ORDER.join(","),
  "pro-webinar,pro-know,pro-research,pro-auction,pro-podcast,pro-ethics,pro-doctoral,pro-business,pro-executives,pro-mogul,pro-field,pro-popculture,pro-creator",
  "Professional types"
);
var marks = api.PRO_ORDER.map(function (t) { return api.PRO_MARK[t]; });
assert.strictEqual(marks.join("|"), "Webinar|Professionals you might know|Research|Auction|Podcast|Ethics board|Doctoral degrees|Business|Executives|Mogul|Field|Pop-culture|Content Creator", "visible type marks");

/* Adult viewer with friends, a dating pool, ads, and professional pages. */
function adultStores() {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, field: "Nursing", interests: ["public health", "insurance"] }));
  local.setItem("cognation.commune.seeDating.v1", "1");
  local.setItem("cognation.profiles.v1", JSON.stringify({
    profiles: {
      ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: ["friend"] },
      friend: { id: "friend", kind: "personal", displayName: "Friend", friendIds: ["ada", "sam"] },
      sam: { id: "sam", kind: "personal", displayName: "Sam", friendIds: ["friend"] },
      clinic: {
        id: "clinic",
        kind: "professional",
        handle: "clinic",
        displayName: "Clinic Studio",
        headline: "Public health education",
        accountKind: "real",
        marketingAd: { title: "Ad", body: "Book", videoUrl: "https://example.com/a.mp4" },
      },
      lab: { id: "lab", kind: "professional", handle: "lab", displayName: "Lab Works", headline: "Insurance research", accountKind: "real" },
    },
  }));
  return { local: local, session: memoryStorage() };
}

var stores = adultStores();
var adult = loadSwipe(stores.local, stores.session, 30);
if (adult.noteViewerSeedStatus) adult.noteViewerSeedStatus(false);
if (adult.noteProfileSeedStatus) {
  adult.noteProfileSeedStatus("ada", false);
  adult.noteProfileSeedStatus("friend", false);
  adult.noteProfileSeedStatus("sam", false);
}
var personalDeck = adult.sampleDeck(24);
assert.ok(personalDeck.some(function (c) { return c.type === "know"; }), "Personal keeps people you may know");
assert.ok(personalDeck.every(function (c) { return !/^pro-/.test(c.type); }), "Personal has no Professional cards");

assert.strictEqual(adult.setMode("professional"), "professional");
assert.strictEqual(adult.getMode(), "professional");
assert.strictEqual(stores.session.getItem(adult.MODE_KEY), "professional", "mode stored for the session");

/* No Professional page is live and no real feed exists for Research, Auction, Field or
   Pop culture: the real "you might know" pages and the four Podcast cards show, each once, 1:1. */
var proDeck = adult.sampleDeck(18);
assert.strictEqual(proDeck.map(function (c) { return c.type; }).join(","),
  "pro-know,pro-podcast,pro-podcast,pro-podcast,pro-podcast", "one people card, then the Podcast cards, no filler: " + proDeck.map(function (c) { return c.id; }));
assert.ok(proDeck.every(function (c) { return c.type !== "pro-webinar"; }), "no Webinar card while nothing is live");
var banned = ["dating", "know", "friend", "ad", "classroom", "chatroom", "fact", "wellness", "event", "content"];
proDeck.forEach(function (c) {
  assert.ok(/^pro-/.test(c.type), "Professional deck only: " + c.type);
  assert.ok(banned.indexOf(c.type) < 0, "no Personal / dating / friends cards on Professional");
  assert.ok(api.PRO_MARK[c.type], "each card has a type mark");
  assert.ok(c.why, "transparent: each card says why it shows");
  assert.ok(!c.demo, "no placeholder card: " + c.id);
  assert.ok(!/-r\d+$/.test(c.id), "no repeated card: " + c.id);
});
var lanes0 = adult.buildProfessionalLanes();
["pro-research", "pro-auction", "pro-field", "pro-popculture"].forEach(function (t) {
  assert.strictEqual(lanes0[t].length, 0, "no real data: empty lane " + t);
});

/* Professionals you might know = one card of real professional pages, ranked by shared interest;
   never personal friends. */
var know = proDeck.filter(function (c) { return c.type === "pro-know"; });
assert.strictEqual(know.length, 1, "one people card");
assert.strictEqual(know[0].people.map(function (r) { return r.profileId; }).join(","), "clinic,lab", "professional pages only, best match first");
assert.strictEqual(know[0].why, "Matched to your field and interests.", "why line (Designer v2)");

var podcasts = lanes0["pro-podcast"].map(function (c) { return c.title + " " + c.body; }).join(" ");
assert.ok(/not only Cognation experts/.test(podcasts) && /Ethical/i.test(podcasts) && /async/i.test(podcasts) && /Continuing education/i.test(podcasts), "podcast topics");
assert.ok(!/Demo · placeholder/.test(swipeSrc) && !/proPlaceholder/.test(swipeSrc), "no placeholder card builder or label");
assert.ok(/data-type-mark=/.test(swipeSrc) && /Why you see this:/.test(swipeSrc), "type mark + why line rendered");

/* Swipe right keeps the people card: it follows nobody in bulk (each row opens that page)
   and never sends a friend request. */
adult.settleSwipe(know[0], "right");
var follows = JSON.parse(stores.local.getItem(adult.FOLLOWS_KEY) || "[]");
assert.strictEqual(follows.length, 0, "keeping the people card follows no one by itself");
assert.strictEqual(stores.local.getItem("cognation.friend.requests.v1"), null, "no friend request from Professional");

/* Switching back restores the unchanged Personal mix. */
adult.setMode("personal");
assert.ok(adult.sampleDeck(20).every(function (c) { return !/^pro-/.test(c.type); }), "Personal restored");

/* No professional pages yet → no "you might know" card and no invented people. */
var empty = loadSwipe(memoryStorage(), memoryStorage());
empty.setMode("professional");
assert.strictEqual(empty.buildProfessionalLanes()["pro-know"].length, 0, "no card when no professional pages");
assert.ok(!empty.buildProfessionalLanes()["pro-auction"].length, "no auction scheduled: no Auction card");
assert.ok(empty.sampleDeck(12).every(function (c) { return c.type === "pro-podcast"; }), "nothing else real: only the Podcast cards, no filler");

/* Under-13: G/PG only — no auction, no pro contact cards under 13. */
var kidLocal = memoryStorage();
kidLocal.setItem("cognation.member.profile.v1", JSON.stringify({ age: 12, interests: ["science"] }));
kidLocal.setItem("cognation.profiles.v1", stores.local.getItem("cognation.profiles.v1"));
var kidSession = memoryStorage();
kidSession.setItem("cognation.commune.mode", "professional");
var kid = loadSwipe(kidLocal, kidSession, 12);
assert.strictEqual(kid.getMode(), "professional");
var kidDeck = kid.sampleDeck(15);
assert.ok(kidDeck.length > 0 && kidDeck.every(function (c) { return c.type === "pro-podcast"; }), "under-13 gets the G Podcast cards only");
assert.ok(kidDeck.every(function (c) {
  return c.type !== "pro-auction" && c.type !== "pro-know" && ["G", "PG"].indexOf(c.rating) >= 0;
}), "under-13 Professional is G/PG only");

/* Content Creator is its own Professional room. No interest hides it; a left swipe passes it. */
var ccSrc = src("js/content-creator-room.js");
assert.ok(ccSrc.indexOf(">Report<") >= 0, "each comment can be reported");
assert.ok(!/getUserMedia|RTCPeer|payout|\bcourse\b/i.test(ccSrc), "no media server, course, or payout");
assert.strictEqual(adult.buildProfessionalLanes()["pro-creator"].length, 0, "without the interest the algorithm hides it");
adult.settleSwipe({ id: "content-creator-shown", type: "pro-creator", interests: ["content creator"], roomKind: "content-creator" }, "left");
assert.ok(JSON.parse(stores.local.getItem("cognation.commune.swipe.dismissed.v1")).ada.indexOf("content-creator-shown") >= 0, "left swipe passes it");
var passedCard = adult.renderCard({ id: "content-creator-shown", type: "pro-creator", title: "Content Creator", body: "Chatroom for people who make things. Up to 100 people.", why: "You listed Content Creator as an interest.", roomKind: "content-creator", interests: ["content creator"] });
assert.ok(passedCard.innerHTML.indexOf("You listed Content Creator as an interest") < 0, "passed card does not claim the interest");
var makerLocal = memoryStorage();
makerLocal.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: ["content creator"] }));
var makerSession = memoryStorage();
makerSession.setItem("cognation.commune.mode", "professional");
var maker = loadSwipe(makerLocal, makerSession, 30);
var makerCard = maker.sampleDeck(8).filter(function (c) { return c.type === "pro-creator" && c.roomKind === "content-creator"; })[0];
assert.ok(makerCard, "interest shows the card");
assert.ok(maker.renderCard(makerCard).innerHTML.indexOf("You listed Content Creator as an interest") >= 0, "interest keeps the why line");
var cc = maker.contentCreator;
var room = cc.cards(true)[0];
var msg = cc.send(room.id, "bad", "Bad", "spam");
cc.send(room.id, "ok", "Ok", "hi");
for (var ri = 0; ri < 10; ri++) cc.report(room.id, msg.room.log[0].id, "rep" + ri);
assert.strictEqual(cc.enter(room.id, "bad").error, "kicked", "ten reports kick");
assert.strictEqual(cc.enter("content-creator-9", "bad").ok, true, "kick is this chatroom only");
for (var ci = 0; ci < cc.CAM; ci++) cc.camera(room.id, "cam" + ci);
assert.strictEqual(cc.camera(room.id, "cam-extra").error, "camera_full", "15 camera requests");
for (var pi = cc.read().rooms[room.id].members.length; pi < cc.CAP; pi++) cc.enter(room.id, "p" + pi);
assert.strictEqual(cc.cards(true)[0].id, "content-creator-2", "a full room mints another card");

console.log("commune-professional-deck.test.js: OK");
