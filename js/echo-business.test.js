/** Professional Echo Business chatroom. Run: node js/echo-business.test.js */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function mem() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function load(local, session) {
  var w = {};
  vm.runInContext(src("js/echo-business.js") + "\n" + src("js/commune-swipe.js"), vm.createContext({
    window: w, localStorage: local, sessionStorage: session, console: console,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {}, createElement: function () { return { setAttribute: function () {}, classList: { add: function () {} } }; } },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  }));
  return w;
}
function who(local, id) { local.setItem("cognation.session.v2", JSON.stringify({ username: id, activeProfileId: id, profileDisplayName: id })); }
function profile(local, interests) { local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 34, field: "Nursing", interests: interests })); }
assert.ok(!/getUserMedia|RTCPeerConnection|software engineering/i.test(src("js/echo-business.js")));
assert.ok(src("index.html").indexOf("js/echo-business.js") < src("index.html").indexOf("js/commune-swipe.js"));
var local = mem(), session = mem();
session.setItem("cognation.commune.mode", "professional");
var win = load(local, session), api = win.CognationCommuneSwipe, biz = win.CognationEchoBusiness;
assert.strictEqual(api.siteRoomCatalog().length, 16);
profile(local, ["nursing"]); who(local, "ada");
var stray = api.renderCard({ id: "pro-business-stray", type: "pro-business", title: "Business", why: "You listed Business as an interest.", body: "Up to 100 people. Chat log. Up to 15 camera requests. No presenter and no calendar event." });
assert.ok(api.buildProfessionalLanes()["pro-business"].length === 0 && stray.innerHTML.indexOf("listed Business") < 0);
api.settleSwipe({ id: "pro-business-stray", type: "pro-business" }, "left");
assert.strictEqual(api.omitPassed([{ id: "pro-business-stray" }]).length, 0);
profile(local, ["business"]);
assert.ok(api.sampleDeck(24).some(function (c) { return c.type === "pro-business" && c.topic === "business" && c.presenter === false && c.calendar === false && c.cap === 100 && c.cameraCap === 15; }));
assert.ok(api.renderCard({ id: "pro-business-1", type: "pro-business", title: "Business", why: "You listed Business as an interest.", body: "chat" }).innerHTML.indexOf("listed Business") >= 0);
api.setMode("personal");
assert.ok(api.sampleDeck(12).every(function (c) { return c.type !== "pro-business"; }));
api.setMode("professional"); var roomA = biz.cards(["business"])[0].roomId;
who(local, "author"); assert.ok(biz.join(roomA).ok && biz.post(roomA, "shift notes").ok);
var msgId = JSON.parse(local.getItem(biz.KEY)).rooms[roomA].messages[0].id;
who(local, "rep0"); assert.strictEqual(biz.report(roomA, msgId).reports, 1);
assert.strictEqual(biz.report(roomA, msgId).reports, 1);
for (var i = 1; i < 100; i++) { who(local, "p" + i); assert.ok(biz.join(roomA).ok); }
who(local, "overflow"); assert.ok(biz.join(roomA).full);
var roomB = biz.cards(["business"]).filter(function (c) { return c.roomId !== roomA && c.topic === "business" && c.cap === 100; })[0].roomId;
for (var r = 1; r < 9; r++) { who(local, "rep" + r); assert.ok(!biz.report(roomA, msgId).kicked); }
who(local, "rep9"); assert.ok(biz.report(roomA, msgId).kicked);
who(local, "author");
assert.ok(biz.join(roomA).kicked && !biz.post(roomA, "x").ok && biz.join(roomB).ok);
for (var c = 0; c < 15; c++) { who(local, "cam" + c); assert.ok(biz.join(roomB).ok && biz.requestCamera(roomB).ok); }
who(local, "camx"); assert.ok(biz.join(roomB).ok && biz.requestCamera(roomB).full);
var nodes = { "[data-commune-room-title]": { textContent: "" }, "[data-commune-room-topic]": { textContent: "" }, "[data-commune-room-log]": { innerHTML: "" }, ".commune-card-kicker": { textContent: "" } };
biz.post(roomB, "a note");
biz.paint({ querySelector: function (s) { return nodes[s] || null; }, setAttribute: function () {}, getAttribute: function () { return "1"; }, addEventListener: function () {} }, roomB);
assert.ok(nodes["[data-commune-room-log]"].innerHTML.indexOf(">Report<") >= 0 && /No presenter\. No calendar event\./.test(nodes["[data-commune-room-topic]"].textContent));
console.log("echo-business.test.js: OK");
