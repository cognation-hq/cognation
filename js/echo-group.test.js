/**
 * #group / #groups feed posts: one Echo card each, public comment notifies the author.
 * Run: node js/echo-group.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function memoryStorage(seed) {
  var data = seed || {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
  };
}

function load(local) {
  var windowStub = {
    CognationTowerStore: {
      list: function () {
        return [
          { id: "lion", body: "when does lion king come to lyric theatre next? #group", authorName: "Maya", authorProfileId: "maya" },
          { id: "again", body: "same question #groups", authorName: "Maya", authorProfileId: "maya" },
          { id: "plain", body: "a regular feed note", authorName: "Maya", authorProfileId: "maya" },
          { id: "lion", body: "when does lion king come to lyric theatre next? #group", authorName: "Maya", authorProfileId: "maya" },
        ];
      },
    },
  };
  var documentStub = { dispatchEvent: function () {}, addEventListener: function () {} };
  var context = vm.createContext({
    window: windowStub, document: documentStub, localStorage: local,
    console: console, CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
    JSON: JSON, Object: Object, Array: Array, String: String, Date: Date,
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js/echo-group.js"), "utf8"), context);
  return windowStub.CognationEchoGroups;
}

var local = memoryStorage();
local.setItem("cognation.session.v2", JSON.stringify({ activeProfileId: "sam", profileDisplayName: "Sam" }));
var api = load(local);
var cards = api.cards();
assert.strictEqual(cards.length, 2, "one card per post, duplicate ignored");
assert.strictEqual(cards[0].id, "echo-group-lion");
assert.strictEqual(cards[1].id, "echo-group-again");
assert.ok(api.isGroupPost("#group") && api.isGroupPost("hi #groups") && !api.isGroupPost("#grouping"));
assert.strictEqual(api.addComment(cards[0], "Saturday matinee").ok, true);
var notices = JSON.parse(local.getItem("cognation.commune.notices.v1"));
assert.strictEqual(notices.byProfile.maya[0].body, api.NOTICE);
assert.strictEqual(api.comments("lion").length, 1);
assert.strictEqual(api.comments("lion")[0].authorName, "Sam");

local.setItem("cognation.session.v2", JSON.stringify({ activeProfileId: "maya", profileDisplayName: "Maya" }));
var before = JSON.parse(local.getItem("cognation.commune.notices.v1")).byProfile.maya.length;
assert.strictEqual(api.addComment(cards[0], "I posted this").ok, true);
var after = JSON.parse(local.getItem("cognation.commune.notices.v1")).byProfile.maya.length;
assert.strictEqual(after, before, "the author is not notified about their own comment");

var swipeSrc = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
assert.ok(/TYPE\.GROUP/.test(swipeSrc) && /groupLane\(/.test(swipeSrc), "group cards join the Echo deck");
assert.ok(!/REPEATABLE\[TYPE\.GROUP\]/.test(swipeSrc), "a group post is not repeated");

console.log("echo-group.test.js: ok");
