/* Industry chatroom: interest gate, left-swipe pass, room limits. Sample field is nursing. */
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
      createElement: function () { return { className: "", setAttribute: function () {}, innerHTML: "" }; }
    },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number
  });
  vm.runInContext(fs.readFileSync(root + "/js/industry-room.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync(root + "/js/commune-swipe.js", "utf8"), ctx);
  return w;
}
var nurse = load({ age: 34, field: "Nursing", interests: ["nursing"] });
nurse.CognationCommuneSwipe.setMode("professional");
assert.ok(nurse.CognationCommuneSwipe.sampleDeck(12).every(function (c) { return c.type !== "pro-industry"; }), "nursing, no Industry interest, not in the algorithm");
var strayHtml = nurse.CognationCommuneSwipe.renderCard({ id: "industry-stray", type: "pro-industry", title: "Industry", topic: "industry advancements", why: "You listed Industry as an interest.", body: "Industry advancements." }).innerHTML;
assert.ok(strayHtml.indexOf("You listed Industry as an interest") < 0, "shown anyway, the card does not claim the interest");
assert.ok(strayHtml.indexOf("Nursing") < 0);
nurse.CognationCommuneSwipe.settleSwipe({ id: "industry-stray", type: "pro-industry" }, "left");
assert.strictEqual(nurse.CognationCommuneSwipe.omitPassed([{ id: "industry-stray" }]).length, 0, "left swipe passes it");
var on = load({ age: 34, field: "Nursing", interests: ["industry"] }), swipe = on.CognationCommuneSwipe, room = on.CognationIndustry;
swipe.setMode("personal");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.type !== "pro-industry"; }), "personal deck stays clear");
swipe.setMode("professional");
var card = swipe.sampleDeck(12).filter(function (c) { return c.type === "pro-industry"; })[0];
assert.strictEqual(card && card.id, "industry-1");
assert.strictEqual(card.topic, "industry advancements");
assert.ok(swipe.renderCard(card).innerHTML.indexOf("You listed Industry as an interest") >= 0, "interest keeps the why line");
swipe.settleSwipe(card, "left");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.id !== card.id; }));
assert.strictEqual(room.CAP, 100); assert.strictEqual(room.CAMERA, 15); assert.strictEqual(room.KICK, 10);
assert.strictEqual(room.presenter, false); assert.strictEqual(room.calendar, false);
for (var i = 0; i < 100; i++) room.join("industry-1", "u" + i);
assert.strictEqual(room.join("industry-1", "extra").full, true);
var next = room.cards().filter(function (c) { return c.id === "industry-2"; })[0];
assert.ok(next && next.topic === card.topic && next.presenter === false && next.calendar === false, "100 people generate another card, same topic");
assert.strictEqual(room.join("industry-2", "u0").ok, true);
for (var k = 0; k < 15; k++) room.requestCamera("industry-1", "u" + k);
assert.strictEqual(room.requestCamera("industry-1", "u20").full, true);
var posted = room.comment("industry-1", "u0", "Ada", "A nursing advancement note");
for (var r = 1; r <= 10; r++) room.report("industry-1", posted.comment.id, "rep" + r);
assert.strictEqual(room.join("industry-1", "u0").kicked, true);
assert.strictEqual(room.join("industry-2", "u0").ok, true, "kick stays in that chatroom");
var nodes = { "[data-commune-room-title]": { textContent: "" }, "[data-commune-room-topic]": { textContent: "" }, "[data-commune-room-log]": { innerHTML: "" }, ".commune-card-kicker": { textContent: "" } };
room.comment("industry-2", "u1", "Bea", "Ward update");
room.paint({ querySelector: function (s) { return nodes[s] || null; } }, "industry-2");
assert.ok(nodes["[data-commune-room-log]"].innerHTML.indexOf(">Report<") >= 0);
assert.ok(/industry advancements/.test(nodes["[data-commune-room-topic]"].textContent));
assert.ok(/no presenter · no calendar/.test(nodes["[data-commune-room-topic]"].textContent));
var src = fs.readFileSync(root + "/js/industry-room.js", "utf8");
assert.ok(!/getUserMedia|MediaStream|RTCPeer/i.test(src));
console.log("industry-room.test.js ok");
