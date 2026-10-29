/* Peer Review interest gate, left-swipe pass, and room caps. */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
function mem() { var d = {}; return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; }
function load(local, session, signedIn) {
  /* 18+ Peer Review needs a signed-in viewer whose user_birth age is known
     (a signed-out or pending viewer fails closed), so boot() signs in. */
  var win = signedIn ? { CognationSupabase: { getSession: function () { return { access_token: "session", user: { id: "u-ada" } }; } } } : {}, ctx = vm.createContext({
    window: win, localStorage: local, sessionStorage: session, console: console,
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {}, createElement: function () { return {}; } },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js/peer-review-room.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8"), ctx);
  return win;
}
function boot(field, interests, age) {
  var local = mem(), session = mem();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada" }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ field: field, interests: interests }));
  session.setItem("cognation.commune.mode", "professional");
  var api = load(local, session, true).CognationCommuneSwipe;
  api.setDatingBirthAge(age); /* the user_birth age, as hydrate sets it */
  return { api: api, local: local };
}
var src = fs.readFileSync(path.join(root, "js/peer-review-room.js"), "utf8");
assert.ok(!/getUserMedia|RTCPeerConnection|software engineering/i.test(src) && /no presenter/.test(src) && /no calendar/.test(src) && /data-peer-report/.test(src));
var miss = boot("Law", [], 30);
assert.ok(miss.api.sampleDeck(8).every(function (c) { return c.type !== "pro-peer-review"; }), "hidden without the interest");
miss.api.settleSwipe({ id: "peer-stray", type: "pro-peer-review", peerReview: true, field: "Law", interest: "law" }, "left");
assert.ok(JSON.parse(miss.local.getItem("cognation.commune.swipe.dismissed.v1")).ada.indexOf("peer-stray") >= 0, "left swipe passes it");
var hit = boot("Nursing", ["nursing"], 30), deck = hit.api.sampleDeck(8);
assert.strictEqual(deck[0].type + ":" + deck[0].field, "pro-peer-review:Nursing");
hit.api.settleSwipe(deck[0], "left");
assert.ok(hit.api.sampleDeck(8).every(function (c) { return c.id !== deck[0].id; }));
var local = mem(), api = load(local, mem()).CognationPeerReview, i;
api.cards({ field: "Nursing", interests: ["nursing"], age: 40 });
for (i = 0; i < 97; i++) api.join("nursing", "nursing-1", "p" + i);
assert.strictEqual(api.cards({ field: "Nursing", interests: ["nursing"], age: 40 }).length, 2);
for (i = 0; i < 10; i++) api.report("nursing", "nursing-1", "a", "r" + i);
var doc = JSON.parse(local.getItem("cognation.peer.review.v1"));
assert.ok(doc.fields.nursing.rooms[0].kicked.mina && !doc.fields.nursing.rooms[1].kicked.mina);
for (i = 0; i < 15; i++) api.requestCamera("nursing", "nursing-2", "c" + i);
assert.strictEqual(api.requestCamera("nursing", "nursing-2", "extra").reason, "camera_full");
console.log("peer-review-room ok");
