/** Professional Echo Executives chatroom. Run: node js/echo-executives.test.js */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function mem() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
/* Signed in (#309: a signed-out viewer's gates see age 0): a live session, and
   the age comes from user_birth (setDatingBirthAge), not the local profile. */
var VIEWER_ID = ["u", "viewer"].join("-");
function load(local, session) {
  var w = { CognationSupabase: { getSession: function () { return { access_token: "t-" + VIEWER_ID, user: { id: VIEWER_ID } }; } } };
  vm.runInContext(src("js/echo-executives.js") + "\n" + src("js/commune-swipe.js"), vm.createContext({
    window: w, localStorage: local, sessionStorage: session, console: console,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {}, createElement: function () { return { setAttribute: function () {}, classList: { add: function () {} } }; } },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  }));
  return w;
}
function who(local, id) { local.setItem("cognation.session.v2", JSON.stringify({ username: id, activeProfileId: id, profileDisplayName: id })); }
function profile(local, interests, age) { local.setItem("cognation.member.profile.v1", JSON.stringify({ age: age == null ? 30 : age, field: "Nursing", interests: interests })); if (win) win.CognationCommuneSwipe.setDatingBirthAge(age == null ? 30 : age); }
assert.ok(!/getUserMedia|RTCPeerConnection/i.test(src("js/echo-executives.js")));
assert.ok(src("index.html").indexOf("js/echo-executives.js") < src("index.html").indexOf("js/commune-swipe.js"));
var local = mem(), session = mem();
session.setItem("cognation.commune.mode", "professional");
var win = load(local, session), api = win.CognationCommuneSwipe, room = win.CognationEchoExecutives;
assert.strictEqual(api.siteRoomCatalog().length, 16);
profile(local, ["nursing"], 30); who(local, "ada");
assert.ok(api.buildProfessionalLanes()["pro-executives"].length === 0 && api.renderCard({ id: "pro-exec-stray", type: "pro-executives", title: "Executives", why: "Your interests include Executives.", body: "chat" }).innerHTML.indexOf("Your interests include Executives") < 0);
api.settleSwipe({ id: "pro-exec-stray", type: "pro-executives" }, "left");
assert.strictEqual(api.omitPassed([{ id: "pro-exec-stray" }]).length, 0);
profile(local, ["Executives"], 30);
assert.ok(api.sampleDeck(24).some(function (c) { return c.type === "pro-executives" && c.topic === "executives" && c.presenter === false && c.calendar === false; }) && api.renderCard({ id: "pro-exec-1", type: "pro-executives", title: "Executives", why: "Your interests include Executives.", body: "chat" }).innerHTML.indexOf("Your interests include Executives") >= 0);
api.setMode("personal");
assert.ok(api.sampleDeck(12).every(function (c) { return c.type !== "pro-executives"; }));
api.setMode("professional"); profile(local, ["Executives"], 12);
assert.ok(api.sampleDeck(8).every(function (c) { return c.type !== "pro-executives"; }));
profile(local, ["Executives"], 30);
var roomA = room.cards(["executives"])[0].roomId;
who(local, "author"); assert.ok(room.join(roomA).ok && room.post(roomA, "hello").ok);
var msgId = JSON.parse(local.getItem(room.KEY)).rooms[roomA].messages[0].id;
who(local, "rep0");
assert.strictEqual(room.report(roomA, msgId).reports, 1);
assert.strictEqual(room.report(roomA, msgId).reports, 1);
for (var i = 1; i < 100; i++) { who(local, "p" + i); assert.ok(room.join(roomA).ok); }
who(local, "overflow"); assert.ok(room.join(roomA).full);
var roomB = room.cards(["executives"]).filter(function (c) { return c.roomId !== roomA && c.topic === "executives"; })[0].roomId;
for (var r = 1; r < 9; r++) { who(local, "rep" + r); assert.ok(!room.report(roomA, msgId).kicked); }
who(local, "rep9"); assert.ok(room.report(roomA, msgId).kicked);
who(local, "author");
assert.ok(room.join(roomA).kicked && !room.post(roomA, "x").ok && room.join(roomB).ok);
for (var c = 0; c < 15; c++) { who(local, "cam" + c); assert.ok(room.join(roomB).ok && room.requestCamera(roomB).ok); }
who(local, "camx"); assert.ok(room.join(roomB).ok && room.requestCamera(roomB).full);
console.log("echo-executives.test.js: OK");
