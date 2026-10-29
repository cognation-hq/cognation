/** Professional Echo Mogul chatroom. Run: node js/echo-mogul.test.js */
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
  vm.runInContext(src("js/echo-mogul.js") + "\n" + src("js/commune-swipe.js"), vm.createContext({
    window: w, localStorage: local, sessionStorage: session, console: console,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {}, createElement: function () { return { setAttribute: function () {}, classList: { add: function () {} } }; } },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  }));
  return w;
}
function who(local, id) { local.setItem("cognation.session.v2", JSON.stringify({ username: id, activeProfileId: id, profileDisplayName: id })); }
function profile(local, interests, age) { local.setItem("cognation.member.profile.v1", JSON.stringify({ age: age == null ? 30 : age, interests: interests })); if (win) win.CognationCommuneSwipe.setDatingBirthAge(age == null ? 30 : age); }
assert.ok(!/getUserMedia|RTCPeerConnection|payout|wealth|\bcourse\b/i.test(src("js/echo-mogul.js")));
assert.ok(src("index.html").indexOf("js/echo-mogul.js") < src("index.html").indexOf("js/commune-swipe.js"));
var local = mem(), session = mem();
session.setItem("cognation.commune.mode", "professional");
var win = load(local, session), api = win.CognationCommuneSwipe, mogul = win.CognationEchoMogul;
assert.strictEqual(api.siteRoomCatalog().length, 16);
profile(local, ["insurance"], 30); who(local, "ada");
assert.ok(api.buildProfessionalLanes()["pro-mogul"].length === 0 && api.renderCard({ id: "pro-mogul-stray", type: "pro-mogul", title: "Mogul", why: "Your interests include Mogul.", body: "chat" }).innerHTML.indexOf("Your interests include Mogul") < 0);
api.settleSwipe({ id: "pro-mogul-stray", type: "pro-mogul" }, "left");
assert.strictEqual(api.omitPassed([{ id: "pro-mogul-stray" }]).length, 0);
profile(local, ["mogul"], 30);
assert.ok(api.sampleDeck(24).some(function (c) { return c.type === "pro-mogul" && c.presenter === false && c.calendar === false; }) && api.renderCard({ id: "pro-mogul-1", type: "pro-mogul", title: "Mogul", why: "Your interests include Mogul.", body: "chat" }).innerHTML.indexOf("Your interests include Mogul") >= 0);
api.setMode("personal");
assert.ok(api.sampleDeck(12).every(function (c) { return c.type !== "pro-mogul"; }));
api.setMode("professional"); profile(local, ["mogul"], 12);
assert.ok(api.sampleDeck(8).every(function (c) { return c.type !== "pro-mogul"; }));
profile(local, ["mogul"], 30);
var roomA = mogul.cards(["mogul"])[0].roomId;
who(local, "author"); assert.ok(mogul.join(roomA).ok && mogul.post(roomA, "hello").ok);
var msgId = JSON.parse(local.getItem(mogul.KEY)).rooms[roomA].messages[0].id;
who(local, "rep0");
assert.strictEqual(mogul.report(roomA, msgId).reports, 1);
assert.strictEqual(mogul.report(roomA, msgId).reports, 1);
for (var i = 1; i < 100; i++) { who(local, "p" + i); assert.ok(mogul.join(roomA).ok); }
who(local, "overflow"); assert.ok(mogul.join(roomA).full);
var roomB = mogul.cards(["mogul"]).filter(function (c) { return c.roomId !== roomA; })[0].roomId;
for (var r = 1; r < 9; r++) { who(local, "rep" + r); assert.ok(!mogul.report(roomA, msgId).kicked); }
who(local, "rep9"); assert.ok(mogul.report(roomA, msgId).kicked);
who(local, "author");
assert.ok(mogul.join(roomA).kicked && !mogul.post(roomA, "x").ok && mogul.join(roomB).ok);
for (var c = 0; c < 15; c++) { who(local, "cam" + c); assert.ok(mogul.join(roomB).ok && mogul.requestCamera(roomB).ok); }
who(local, "camx"); assert.ok(mogul.join(roomB).ok && mogul.requestCamera(roomB).full);
console.log("echo-mogul.test.js: OK");
