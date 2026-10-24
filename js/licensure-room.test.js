/* Licensure chatroom: interest gate, left-swipe pass, room limits. */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
function mem() {
  var data = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
}
function load(interests) {
  var local = mem();
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: interests }));
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada" }));
  var w = {};
  var ctx = vm.createContext({
    window: w, localStorage: local, sessionStorage: mem(), console: console,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {} },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number
  });
  vm.runInContext(fs.readFileSync(root + "/js/licensure-room.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync(root + "/js/commune-swipe.js", "utf8"), ctx);
  return w;
}
var off = load(["nursing"]);
off.CognationCommuneSwipe.setMode("professional");
assert.ok(off.CognationCommuneSwipe.sampleDeck(12).every(function (c) { return c.type !== "pro-licensure"; }), "no interest, not in the algorithm");
var on = load(["licensure"]), swipe = on.CognationCommuneSwipe, room = on.CognationLicensure;
swipe.setMode("personal");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.type !== "pro-licensure"; }), "personal deck stays clear");
swipe.setMode("professional");
var card = swipe.sampleDeck(12).filter(function (c) { return c.type === "pro-licensure"; })[0];
assert.strictEqual(card && card.id, "licensure-1");
swipe.settleSwipe(card, "left");
assert.strictEqual(swipe.omitPassed([card]).length, 0, "left swipe passes it");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.id !== card.id; }));
var stray = load(["pottery"]);
stray.CognationCommuneSwipe.setMode("professional");
stray.CognationCommuneSwipe.settleSwipe({ id: "licensure-stray", type: "pro-licensure" }, "left");
assert.strictEqual(stray.CognationCommuneSwipe.omitPassed([{ id: "licensure-stray" }]).length, 0, "shown anyway, left swipe passes");
assert.strictEqual(room.CAP, 100); assert.strictEqual(room.CAMERA, 15); assert.strictEqual(room.KICK, 10);
assert.strictEqual(room.presenter, false); assert.strictEqual(room.calendar, false);
for (var i = 0; i < 100; i++) room.join("licensure-1", "u" + i);
assert.strictEqual(room.join("licensure-1", "extra").full, true);
assert.ok(room.cards().some(function (c) { return c.id === "licensure-2"; }), "100 people generate another card");
assert.strictEqual(room.join("licensure-2", "u0").ok, true);
for (var k = 0; k < 15; k++) room.requestCamera("licensure-1", "u" + k);
assert.strictEqual(room.requestCamera("licensure-1", "u20").full, true);
var posted = room.comment("licensure-1", "u0", "Ada", "hello");
for (var r = 1; r <= 10; r++) room.report("licensure-1", posted.comment.id, "rep" + r);
assert.strictEqual(room.join("licensure-1", "u0").kicked, true);
assert.strictEqual(room.join("licensure-2", "u0").ok, true, "kick stays in that chatroom");
var nodes = { "[data-commune-room-title]": { textContent: "" }, "[data-commune-room-topic]": { textContent: "" }, "[data-commune-room-log]": { innerHTML: "" }, ".commune-card-kicker": { textContent: "" } };
room.comment("licensure-2", "u1", "Bea", "a note");
room.paint({ querySelector: function (s) { return nodes[s] || null; } }, "licensure-2");
assert.ok(nodes["[data-commune-room-log]"].innerHTML.indexOf(">Report<") >= 0);
assert.ok(/no presenter · no calendar/.test(nodes["[data-commune-room-topic]"].textContent));
assert.ok(!/getUserMedia|MediaStream|RTCPeer/.test(fs.readFileSync(root + "/js/licensure-room.js", "utf8")));
console.log("licensure-room.test.js ok");
