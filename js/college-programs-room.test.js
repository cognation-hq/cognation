/* College programs chatroom: interest gate, left-swipe pass, room limits. */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
function mem() {
  var data = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
}
function load(profile) {
  var local = mem();
  local.setItem("cognation.member.profile.v1", JSON.stringify(profile));
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada" }));
  var w = {};
  var ctx = vm.createContext({
    window: w, localStorage: local, sessionStorage: mem(), console: console,
    document: {
      readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {},
      createElement: function () { return { className: "", innerHTML: "", setAttribute: function () {}, classList: { add: function () {} } }; }
    },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number
  });
  vm.runInContext(fs.readFileSync(root + "/js/college-programs-room.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync(root + "/js/commune-swipe.js", "utf8"), ctx);
  return w;
}
var nursing = { age: 30, field: "nursing", interests: ["public health"] };
var off = load(nursing);
off.CognationCommuneSwipe.setMode("professional");
assert.ok(off.CognationCommuneSwipe.sampleDeck(12).every(function (c) { return c.type !== "pro-college"; }), "no interest, not in the algorithm");
var strayHtml = off.CognationCommuneSwipe.renderCard({
  id: "college-programs-stray", type: "pro-college", title: "College programs",
  body: "College programs chatroom on professional Echo cards.",
  why: "You listed College programs as an interest.", rating: "G"
}).innerHTML;
assert.ok(strayHtml.indexOf("listed College programs") < 0, "shown anyway, card does not say they listed it");
off.CognationCommuneSwipe.settleSwipe({ id: "college-programs-stray", type: "pro-college" }, "left");
assert.strictEqual(off.CognationCommuneSwipe.omitPassed([{ id: "college-programs-stray" }]).length, 0, "shown anyway, left swipe passes");
var on = load({ age: 30, field: "nursing", interests: ["College programs"] });
var swipe = on.CognationCommuneSwipe, room = on.CognationCollegePrograms;
swipe.setMode("personal");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.type !== "pro-college"; }), "personal deck stays clear");
swipe.setMode("professional");
var card = swipe.sampleDeck(12).filter(function (c) { return c.type === "pro-college"; })[0];
assert.strictEqual(card && card.id, "college-programs-1");
assert.ok(/You listed College programs\./.test(swipe.renderCard(card).innerHTML));
swipe.settleSwipe(card, "left");
assert.strictEqual(swipe.omitPassed([card]).length, 0, "left swipe passes it");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.id !== card.id; }));
assert.strictEqual(room.CAP, 100); assert.strictEqual(room.CAMERA, 15); assert.strictEqual(room.KICK, 10);
assert.strictEqual(room.presenter, false); assert.strictEqual(room.calendar, false);
for (var i = 0; i < 100; i++) room.join("college-programs-1", "u" + i);
assert.strictEqual(room.join("college-programs-1", "extra").full, true);
assert.ok(room.cards().some(function (c) { return c.id === "college-programs-2" && c.title === "College programs"; }), "100 people generate another card");
assert.strictEqual(room.join("college-programs-2", "u0").ok, true);
for (var k = 0; k < 15; k++) room.requestCamera("college-programs-1", "u" + k);
assert.strictEqual(room.requestCamera("college-programs-1", "u20").full, true);
var posted = room.comment("college-programs-1", "u0", "Ada", "clinical hours");
for (var r = 1; r <= 10; r++) room.report("college-programs-1", posted.comment.id, "rep" + r);
assert.strictEqual(room.join("college-programs-1", "u0").kicked, true);
assert.strictEqual(room.join("college-programs-2", "u0").ok, true, "kick stays in that chatroom");
var nodes = { "[data-commune-room-title]": { textContent: "" }, "[data-commune-room-topic]": { textContent: "" }, "[data-commune-room-log]": { innerHTML: "" }, ".commune-card-kicker": { textContent: "" } };
room.comment("college-programs-2", "u1", "Bea", "a note");
room.paint({ querySelector: function (s) { return nodes[s] || null; } }, "college-programs-2");
assert.ok(nodes["[data-commune-room-log]"].innerHTML.indexOf(">Report<") >= 0);
assert.ok(/no presenter · no calendar/.test(nodes["[data-commune-room-topic]"].textContent));
assert.ok(!/software engineering/i.test(fs.readFileSync(root + "/js/college-programs-room.js", "utf8")));
assert.ok(!/getUserMedia|MediaStream|RTCPeer/.test(fs.readFileSync(root + "/js/college-programs-room.js", "utf8")));
console.log("college-programs-room.test.js ok");
