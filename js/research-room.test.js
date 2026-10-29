/* Research chat: interest gate, left-swipe pass, room limits. */
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
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}
/* Signed in (#309: a signed-out viewer's gates see age 0): a live session, and
   the age comes from user_birth (setDatingBirthAge), not the local profile. */
var VIEWER_ID = ["u", "viewer"].join("-");
function load(local, interests) {
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada" }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: interests }));
  var windowStub = { CognationSupabase: { getSession: function () { return { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } }; } } };
  var documentStub = { addEventListener: function () {}, querySelector: function () { return null; }, body: { classList: { add: function () {}, remove: function () {} } } };
  var context = vm.createContext({
    window: windowStub, document: documentStub, localStorage: local, sessionStorage: memoryStorage(),
    console: console, CustomEvent: function CustomEvent(n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number,
  });
  vm.runInContext(src("js/research-room.js"), context);
  vm.runInContext(src("js/commune-swipe.js"), context);
  windowStub.CognationCommuneSwipe.setDatingBirthAge(30);
  return { swipe: windowStub.CognationCommuneSwipe, room: windowStub.CognationResearchRoom };
}
var roomSrc = src("js/research-room.js");
assert.ok(!/getUserMedia|RTCPeerConnection|mediaDevices/.test(roomSrc), "no media server");
assert.ok(/no presenter/.test(roomSrc) && /no calendar/.test(roomSrc), "no presenter, no calendar");
assert.ok(/data-research-report/.test(roomSrc) && /"Report"/.test(roomSrc), "report button on a comment");

var off = load(memoryStorage(), ["pottery"]);
off.swipe.setMode("professional");
assert.ok(!off.swipe.sampleDeck(12).some(function (c) { return c.type === "pro-research"; }), "no research interest, hidden");
off.swipe.settleSwipe({ id: "research-1", type: "pro-research", interests: ["research"], title: "Research" }, "left");
off.swipe.setMemberProfile({ age: 30, interests: ["research"] });
assert.ok(!off.swipe.sampleDeck(12).some(function (c) { return c.id === "research-1"; }), "left swipe passes it if it was shown");

var on = load(memoryStorage(), ["research"]);
on.swipe.setMode("professional");
var research = on.swipe.sampleDeck(18).filter(function (c) { return c.type === "pro-research"; });
assert.strictEqual(research.length, 1);
assert.ok(/new articles/.test(research[0].body));
on.swipe.settleSwipe(research[0], "left");
assert.ok(!on.swipe.sampleDeck(18).some(function (c) { return c.id === research[0].id; }), "left swipe passes the card");

var local = memoryStorage(), full = [];
for (var i = 0; i < 100; i++) full.push("p" + i);
local.setItem("cognation.research.rooms.v1", JSON.stringify({ rooms: [{ id: "research-1", n: 1, members: full, kicked: [], cam: [], msgs: [{ id: "c1", by: "p0", name: "Ada", body: "Study heat and night shifts", reports: [] }] }] }));
var api = load(local, ["research"]).room;
var cards = api.cards();
assert.ok(cards.length === 2 && cards[0].full && cards[0].body === cards[1].body, "full room opens another card");
var saved = JSON.parse(local.getItem(api.KEY));
saved.rooms[1].members.push("p0");
local.setItem(api.KEY, JSON.stringify(saved));
for (var n = 0; n < 15; n++) assert.ok(api.requestCamera("research-2", "c" + n).ok);
assert.ok(api.requestCamera("research-2", "extra").full, "camera cap 15");
for (var r = 0; r < 10; r++) api.report("research-1", "c1", "u" + r);
saved = JSON.parse(local.getItem(api.KEY));
assert.ok(saved.rooms[0].members.indexOf("p0") < 0 && saved.rooms[1].members.indexOf("p0") >= 0, "kicked from that room only");
console.log("research-room ok");
