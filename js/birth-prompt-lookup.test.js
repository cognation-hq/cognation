/**
 * Birth prompt lookup: user_birth is queried as table + query (not a URL-encoded
 * "user_birth?select=..." table name, which 404s), a found row never opens the
 * ask, and a failed lookup never opens a page-covering modal.
 * Run: node js/birth-prompt-lookup.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var src = fs.readFileSync(path.join(__dirname, "birth-prompt.js"), "utf8");

function run(restImpl) {
  var opened = 0, calls = [];
  var store = {};
  var body = { classList: { add: function () {}, remove: function () {} }, appendChild: function () {} };
  var ctx = {
    setTimeout: function (fn) { fn(); },
    sessionStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } },
    document: {
      readyState: "complete", body: body,
      addEventListener: function () {},
      querySelector: function () { return null; },
      getElementById: function () { return null; },
      createElement: function () {
        opened++;
        return { setAttribute: function () {}, querySelector: function () { return null; }, isConnected: true };
      },
    },
    window: {},
  };
  ctx.window.CognationAuth = { getSession: function () { return { source: "supabase", supabaseUserId: "u-1", username: "alexa" }; } };
  ctx.window.CognationSupabase = { rest: function (t, o) { calls.push([t, o]); return restImpl(t, o); } };
  vm.runInNewContext(src, ctx);
  return ctx.window.CognationBirthPrompt.maybePrompt === undefined ? null : new Promise(function (res) {
    setImmediate(function () { setImmediate(function () { res({ opened: opened, calls: calls }); }); });
  });
}

Promise.all([
  run(function () { return Promise.resolve([{ birth_year: 1990, birth_month: 5 }]); }),
  run(function () { return Promise.reject(new Error("404")); }),
  run(function () { return Promise.resolve([]); }),
]).then(function (r) {
  var hasRow = r[0], failed = r[1], noRow = r[2];
  assert.strictEqual(hasRow.calls[0][0], "user_birth", "table name alone (rest() URL-encodes it)");
  assert.ok(/^select=birth_year,birth_month&user_id=eq\.u-1&limit=1$/.test(hasRow.calls[0][1].query), "filters passed as query");
  assert.strictEqual(hasRow.opened, 0, "existing birth row: no ask");
  assert.strictEqual(failed.opened, 0, "failed lookup: no page-covering ask");
  assert.ok(noRow.opened > 0, "truly no birth row: ask once");
  console.log("birth-prompt-lookup.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
