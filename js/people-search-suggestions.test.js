/* Signed-up personal and professional pages. Demo records are not suggested.
   Run: node js/people-search-suggestions.test.js */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function memoryStorage(seed) {
  var data = seed || {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
}

var profiles = {
  "prof-lana": { id: "prof-lana", kind: "personal", accountUsername: "lana", handle: "lana", displayName: "Lana Ortiz" },
  "prof-lumen": { id: "prof-lumen", kind: "professional", accountUsername: "lumen", handle: "lumen", displayName: "Lumen Studio" },
  "prof-demo-mira-pro": { id: "prof-demo-mira-pro", kind: "professional", accountUsername: "mira-demo", handle: "mira-wellness", displayName: "Mira Chen · Wellness" },
  "prof-alexa-personal": { id: "prof-alexa-personal", kind: "personal", accountUsername: "alexa", handle: "alexa", displayName: "Alexa" },
  "prof-seed": { id: "prof-seed", kind: "personal", accountUsername: "pat", handle: "seed-pat-1", displayName: "Chris Patel" }
};
var storage = memoryStorage({ "cognation.profiles.v1": JSON.stringify({ profiles: profiles }) });
var document = {
  readyState: "complete",
  addEventListener: function () {},
  querySelectorAll: function () { return []; }
};
var window = { document: document, localStorage: storage };
var ctx = vm.createContext({
  window: window, document: document, localStorage: storage,
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "people-search.js"), "utf8"), ctx);

function names(rows) {
  return Array.prototype.map.call(rows, function (row) { return String(row.name); });
}
var src = fs.readFileSync(path.join(__dirname, "people-search.js"), "utf8");
["Peter Thomas Roth", "Prada", "Pablo Thompson"].forEach(function (name) {
  assert.strictEqual(src.indexOf(name), -1, name + " is not shipped");
});

var listed = names(ctx.window.CognationPeopleDirectory.search("l"));
assert.deepStrictEqual(listed, ["Lana Ortiz", "Lumen Studio"]);
var kinds = {};
ctx.window.CognationPeopleDirectory.search("l").forEach(function (row) { kinds[String(row.name)] = String(row.kind); });
assert.strictEqual(kinds["Lana Ortiz"], "personal");
assert.strictEqual(kinds["Lumen Studio"], "professional");
assert.strictEqual(names(ctx.window.CognationPeopleDirectory.search("c")).indexOf("Chris Patel"), -1);
assert.strictEqual(names(ctx.window.CognationPeopleDirectory.search("m")).indexOf("Mira Chen · Wellness"), -1);
assert.strictEqual(names(ctx.window.CognationPeopleDirectory.search("a")).indexOf("Alexa"), -1);

console.log("people-search-suggestions.test.js ok");
