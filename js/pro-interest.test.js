/* Professional interest algorithms: licensure fills Echo, left swipe passes. */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var root = path.join(__dirname, "..");
function mem() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}
function load(interests) {
  var local = mem();
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, field: "Nursing", interests: interests }));
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
  local.setItem("cognation.profiles.v1", JSON.stringify({ profiles: {
    ada: { id: "ada", kind: "personal", displayName: "Ada" },
    ward: {
      id: "ward", kind: "professional", displayName: "Harbor Nursing", accountKind: "real",
      podcasts: [{ id: "pod", title: "Licensure podcast", body: "A podcast on nursing licensure renewal." }],
      posts: [{ id: "note", title: "Board note", body: "Nursing licensure rules for this season." }],
    },
    mine: {
      id: "ada-pro", kind: "professional", displayName: "Ada Pro", accountUsername: "ada", accountKind: "real",
      podcasts: [{ id: "own", title: "My licensure podcast", body: "My own license notes." }],
    },
  } }));
  var w = {};
  var ctx = vm.createContext({
    window: w, localStorage: local, sessionStorage: mem(), console: console,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {} },
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  });
  vm.runInContext(fs.readFileSync(root + "/js/pro-interest.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync(root + "/js/commune-swipe.js", "utf8"), ctx);
  w.CognationCommuneSwipe.noteViewerSeedStatus(false);
  w.CognationCommuneSwipe.noteProfileSeedStatus("ward", false);
  w.CognationCommuneSwipe.noteProfileSeedStatus("ada-pro", false);
  w.CognationCommuneSwipe.setMode("professional");
  return w;
}
var off = load(["nursing"]);
var offDeck = off.CognationCommuneSwipe.sampleDeck(12);
assert.ok(offDeck.every(function (c) { return c.interest !== "licensure" && c.type !== "pro-licensure"; }), "nursing is not licensure");
assert.ok(!/you listed licensure/i.test(offDeck.map(function (c) { return c.why || ""; }).join(" ")), "does not claim a listed interest");
off.CognationCommuneSwipe.settleSwipe({ id: "pro-interest-licensure-room", type: "pro-licensure", title: "Licensure", interest: "licensure" }, "left");
assert.strictEqual(off.CognationCommuneSwipe.omitPassed([{ id: "pro-interest-licensure-room" }]).length, 0, "left swipe passes");
assert.strictEqual(off.CognationProInterest.has("licensure"), false, "a pass does not create the algorithm");

var learned = load(["nursing"]);
learned.CognationCommuneSwipe.settleSwipe({ id: "pro-interest-licensure-room", type: "pro-licensure", title: "Licensure", body: "Licensure chatroom.", interest: "licensure", keepOnly: true }, "right");
assert.strictEqual(learned.CognationProInterest.has("licensure"), true, "showing interest in the chatroom");
assert.strictEqual(learned.CognationProInterest.whyFor("licensure"), "You showed interest in the Licensure chatroom.");
var learnedDeck = learned.CognationCommuneSwipe.sampleDeck(18);
var pod = learnedDeck.filter(function (c) { return c.type === "pro-podcast" && c.interest === "licensure"; })[0];
assert.ok(pod && /Licensure podcast/.test(pod.title) && /Harbor Nursing/.test(pod.body), "other profile's licensure podcast");
assert.ok(learnedDeck.some(function (c) { return c.type === "pro-licensure"; }), "licensure chatroom");
assert.ok(learnedDeck.some(function (c) { return c.type === "pro-field" && c.interest === "licensure"; }), "same kind of licensure content");
assert.ok(learnedDeck.every(function (c) { return c.profileId !== "ada-pro" && !/You listed/.test(c.why || ""); }), "not own content, and no false listed claim");

var listed = load(["licensure"]);
assert.strictEqual(listed.CognationProInterest.whyFor("licensure"), "You listed licensure.");
assert.ok(listed.CognationCommuneSwipe.sampleDeck(12).some(function (c) { return c.interest === "licensure" && c.type === "pro-podcast"; }));
console.log("pro-interest.test.js ok");
