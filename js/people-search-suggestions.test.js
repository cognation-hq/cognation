/**
 * Top-right search suggests commonly typed names. Personal and professional
 * pages share one list. The letter P examples are a starting mix, not a
 * closed directory: a name someone types can be suggested later.
 * Run: node js/people-search-suggestions.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
}

var storage = memoryStorage();
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
var dir = ctx.window.CognationPeopleDirectory;

function names(rows) {
  return Array.prototype.map.call(rows, function (row) { return String(row.name); });
}
var typedP = dir.search("p");
assert.strictEqual(names(typedP).slice(0, 3).join("|"), "Peter Thomas Roth|Prada|Pablo Thompson");
assert.strictEqual(typedP[0].kind, "professional");
assert.strictEqual(typedP[1].kind, "professional");
assert.strictEqual(typedP[2].kind, "personal");
assert.ok(typedP.length > 3, "P suggests more than the three examples");

assert.ok(names(dir.search("pr")).indexOf("Prada") !== -1);
assert.ok(names(dir.search("pe")).indexOf("Peter Thomas Roth") !== -1);
assert.ok(names(dir.search("pa")).indexOf("Pablo Thompson") !== -1);

dir.remember("Nia Okoye");
assert.ok(names(dir.search("ni")).indexOf("Nia Okoye") !== -1, "a typed name can be suggested");
assert.ok(names(dir.search("a")).indexOf("Alex Rivera") !== -1);

console.log("people-search-suggestions.test.js ok");
