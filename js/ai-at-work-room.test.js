/* AI at work chatroom: interest gate, left-swipe pass, room limits. Not Tech/AI. */
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
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {} },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number
  });
  vm.runInContext(fs.readFileSync(root + "/js/ai-at-work-room.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync(root + "/js/commune-swipe.js", "utf8"), ctx);
  return w;
}
var src = fs.readFileSync(root + "/js/ai-at-work-room.js", "utf8");
assert.ok(!/software engineering/i.test(src) && !/getUserMedia|MediaStream|RTCPeer/.test(src));
var off = load({ age: 30, field: "Nursing", interests: ["nursing"] });
off.CognationCommuneSwipe.setMode("professional");
assert.ok(off.CognationCommuneSwipe.sampleDeck(12).every(function (c) { return c.type !== "pro-ai-work"; }), "no AI at work interest, not in the algorithm");
assert.ok(off.CognationCommuneSwipe.siteRoomCatalog().some(function (r) { return r.slug === "tech-ai" && r.title === "Tech/AI"; }), "Tech/AI room stays");
var tech = load({ age: 30, field: "Nursing", interests: ["tech", "ai", "artificial intelligence"] });
tech.CognationCommuneSwipe.setMode("professional");
assert.ok(tech.CognationCommuneSwipe.sampleDeck(12).every(function (c) { return c.type !== "pro-ai-work"; }), "Tech/AI interest does not open this card");
var on = load({ age: 30, field: "Nursing", interests: ["AI at work"] }), swipe = on.CognationCommuneSwipe, room = on.CognationAiAtWork;
swipe.setMode("personal");
assert.ok(swipe.sampleDeck(12).every(function (c) { return c.type !== "pro-ai-work"; }), "personal deck stays clear");
swipe.setMode("professional");
var card = swipe.sampleDeck(12).filter(function (c) { return c.type === "pro-ai-work"; })[0];
assert.strictEqual(card && card.id, "ai-at-work-1");
assert.strictEqual(card.topic, "AI at work");
assert.ok(!/listed/i.test(card.why), "does not say they listed the interest");
assert.strictEqual(room.displayWhy("You listed AI at work as an interest.", false), "Professional Echo chatroom.");
swipe.settleSwipe(card, "left");
assert.strictEqual(swipe.omitPassed([card]).length, 0, "left swipe passes it");
var stray = load({ age: 30, field: "Nursing", interests: ["nursing"] });
stray.CognationCommuneSwipe.setMode("professional");
stray.CognationCommuneSwipe.settleSwipe({ id: "ai-at-work-stray", type: "pro-ai-work", why: "You listed AI at work as an interest." }, "left");
assert.strictEqual(stray.CognationCommuneSwipe.omitPassed([{ id: "ai-at-work-stray" }]).length, 0, "shown anyway, left swipe passes");
assert.strictEqual(room.CAP, 100); assert.strictEqual(room.CAMERA, 15); assert.strictEqual(room.KICK, 10);
assert.strictEqual(room.presenter, false); assert.strictEqual(room.calendar, false);
for (var i = 0; i < 100; i++) room.join("ai-at-work-1", "u" + i);
assert.strictEqual(room.join("ai-at-work-1", "extra").full, true);
var next = room.cards().filter(function (c) { return c.id === "ai-at-work-2"; })[0];
assert.ok(next && next.topic === "AI at work", "100 people generate another card for the same topic");
assert.strictEqual(room.join("ai-at-work-2", "u0").ok, true);
for (var k = 0; k < 15; k++) room.requestCamera("ai-at-work-1", "u" + k);
assert.strictEqual(room.requestCamera("ai-at-work-1", "u20").full, true);
var posted = room.comment("ai-at-work-1", "u0", "Ada", "hello");
for (var r = 1; r <= 10; r++) room.report("ai-at-work-1", posted.comment.id, "rep" + r);
assert.strictEqual(room.join("ai-at-work-1", "u0").kicked, true);
assert.strictEqual(room.join("ai-at-work-2", "u0").ok, true, "kick stays in that chatroom");
var nodes = { "[data-commune-room-title]": { textContent: "" }, "[data-commune-room-topic]": { textContent: "" }, "[data-commune-room-log]": { innerHTML: "" }, ".commune-card-kicker": { textContent: "" } };
room.comment("ai-at-work-2", "u1", "Bea", "a note");
room.paint({ querySelector: function (s) { return nodes[s] || null; } }, "ai-at-work-2");
assert.ok(nodes["[data-commune-room-log]"].innerHTML.indexOf(">Report<") >= 0);
assert.ok(/no presenter · no calendar/.test(nodes["[data-commune-room-topic]"].textContent));
assert.ok(/Chat log/.test(nodes["[data-commune-room-topic]"].textContent));
console.log("ai-at-work-room.test.js ok");
