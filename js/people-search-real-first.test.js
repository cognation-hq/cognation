/**
 * People search: within the cap of 8, real accounts first, then Demo accounts
 * (seed / ops), each newest first. The profiles list is two capped fetches
 * (real, and not real), each newest first, merged, so a large seed fleet can't
 * push real people out of the 400-row cache before ranking.
 * Sage (seed-0248, the u13 test viewer) stays out of search. Rule line under
 * the search box: "Real people first, then Demo accounts, newest first."
 * Run: node js/people-search-real-first.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function mem() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

function ts(minute) { return new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(); }
function rows() {
  var out = [];
  /* Three real people, all older than every seed. */
  out.push({ id: "p-real-1", user_id: "u-r1", kind: "personal", handle: "sam-r1", display_name: "Sam Rivers", account_kind: "real", seed_fleet_id: null, created_at: ts(1) });
  out.push({ id: "p-real-2", user_id: "u-r2", kind: "personal", handle: "sam-r2", display_name: "Samira Holt", account_kind: "real", seed_fleet_id: null, created_at: ts(3) });
  out.push({ id: "p-real-3", user_id: "u-r3", kind: "professional", handle: "sam-r3", display_name: "Sam's Bakery", account_kind: "real", seed_fleet_id: null, created_at: ts(2) });
  /* A seed fleet bigger than the 400-row cache, all newer. */
  for (var i = 1; i <= 450; i++) {
    var n = ("000" + i).slice(-4);
    out.push({ id: "p-seed-" + n, user_id: "u-s" + n, kind: "personal", handle: "seed-" + n, display_name: "Sam " + n, account_kind: "seed", seed_fleet_id: "seed-" + n, created_at: ts(100 + i) });
  }
  /* Sage: seed-0248's row is the test viewer; give her a matching name. */
  out.forEach(function (r) { if (r.id === "p-seed-0248") { r.display_name = "Sage"; r.handle = "sage"; } });
  /* An ops account, newest of all. */
  out.push({ id: "p-ops-1", user_id: "u-o1", kind: "personal", handle: "ops-sam", display_name: "Ops Sam", account_kind: "ops", seed_fleet_id: null, created_at: ts(900) });
  return out;
}

/* PostgREST-ish: account_kind eq/neq, or= Sage filter, order=col.desc, limit. */
function serve(query) {
  var list = rows();
  var kindEq = (query.match(/account_kind=eq\.([a-z]+)/) || [])[1];
  var kindNeq = (query.match(/account_kind=neq\.([a-z]+)/) || [])[1];
  if (kindEq) list = list.filter(function (r) { return r.account_kind === kindEq; });
  if (kindNeq) list = list.filter(function (r) { return r.account_kind !== kindNeq; });
  if (query.indexOf("or=(seed_fleet_id.is.null,seed_fleet_id.neq.seed-0248)") !== -1) {
    list = list.filter(function (r) { return r.seed_fleet_id == null || r.seed_fleet_id !== "seed-0248"; });
  }
  var order = (query.match(/order=([^&]+)/) || [])[1] || "";
  var keys = order.split(",").filter(Boolean).map(function (k) { var p = k.split("."); return { col: p[0], desc: p[1] === "desc" }; });
  list.sort(function (a, b) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var va = a[k.col];
      var vb = b[k.col];
      if (va === vb) continue;
      var c = va < vb ? -1 : 1;
      return k.desc ? -c : c;
    }
    return 0;
  });
  var limit = parseInt((query.match(/limit=(\d+)/) || [])[1] || "1000", 10);
  var select = ((query.match(/select=([^&]+)/) || [])[1] || "").split(",");
  return list.slice(0, limit).map(function (r) {
    var o = {};
    select.forEach(function (c) { if (c in r) o[c] = r[c]; });
    return o;
  });
}

function boot() {
  var queries = [];
  var doc = { readyState: "complete", addEventListener: function () {}, dispatchEvent: function () { return true; }, querySelectorAll: function () { return []; } };
  var win = {
    document: doc, localStorage: mem(), addEventListener: function () {}, CustomEvent: CustomEvent,
    CognationAuth: { getSession: function () { return { source: "supabase", supabaseUserId: "u-viewer", activeProfileId: "p-viewer" }; }, whenReady: { then: function () {} } },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, o) {
        var q = (o && o.query) || "";
        queries.push(table + "?" + q);
        if (table === "profiles" && /limit=400/.test(q)) return Promise.resolve(serve(q));
        if (table === "tower_posts") {
          /* A feed row's embedded author carries no account_kind / created_at. */
          return Promise.resolve([{ id: "post-1", author_profile_id: "p-real-1", body: "hi", visibility: "public", attachments: [], created_at: ts(950),
            author: { id: "p-real-1", user_id: "u-r1", kind: "personal", handle: "sam-r1", display_name: "Sam Rivers", bio: "", seed_fleet_id: null }, reactions: [] }]);
        }
        return Promise.resolve([]);
      },
    },
    CognationTowerStore: { setRemotePosts: function () {} },
  };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, location: { hash: "" }, console: console,
    CustomEvent: CustomEvent, Promise: Promise, encodeURIComponent: encodeURIComponent });
  vm.runInContext(read("js/seedops-u13-test-viewer.js"), ctx);
  vm.runInContext(read("js/supabase-social.js"), ctx);
  return { api: win.CognationSupabaseSocial, queries: queries };
}

function testRanking() {
  var t = boot();
  return t.api.refresh().then(function () {
    var lists = t.queries.filter(function (x) { return /^profiles\?.*limit=400/.test(x); });
    assert.strictEqual(lists.length, 2, "two capped fetches");
    assert.ok(lists.some(function (q) { return /account_kind=eq\.real/.test(q); }), "one for real people");
    assert.ok(lists.some(function (q) { return /account_kind=neq\.real/.test(q); }), "one for Demo accounts");
    lists.forEach(function (q) {
      assert.ok(/order=created_at\.desc/.test(q), "newest first");
      assert.ok(/account_kind/.test(q.split("&")[0]) && /created_at/.test(q.split("&")[0]), "selects account_kind and created_at");
      assert.ok(q.indexOf("or=(seed_fleet_id.is.null,seed_fleet_id.neq.seed-0248)") !== -1, "Sage list filter kept");
    });

    var res = t.api.memberResults("sa");
    var ids = Array.from(res, function (p) { return p.id; });
    assert.strictEqual(res.length, 8, "cap of 8");
    assert.deepStrictEqual(ids.slice(0, 3), ["p-real-2", "p-real-3", "p-real-1"], "real people first, newest first: " + ids);
    res.slice(3).forEach(function (p) { assert.notStrictEqual(p.account_kind, "real", "then Demo accounts"); });
    var demoTimes = Array.from(res, function (p) { return p.created_at; }).slice(3);
    assert.deepStrictEqual(demoTimes.slice().sort().reverse(), demoTimes, "Demo accounts newest first");
    assert.strictEqual(ids[3], "p-ops-1", "ops still listed as today (a Demo account, newest)");
    assert.ok(ids.indexOf("p-seed-0248") === -1, "Sage stays out of search");
    assert.strictEqual(t.api.memberResults("sage").length, 0, "Sage stays out of search (by name)");
    assert.strictEqual(t.api.getProfile("p-real-1").account_kind, "real", "a later feed row without account_kind keeps the cached kind");
  });
}

function testUi() {
  var html = read("index.html");
  var box = html.slice(html.indexOf("data-people-search>"), html.indexOf("data-people-search-results"));
  assert.ok(box.indexOf('<p class="people-search-rule">Real people first, then Demo accounts, newest first.</p>') !== -1,
    "rule line sits under the search box with the exact text");
  var css = read("css/styles.css");
  assert.ok(/\.people-search-rule \{\s*margin: 0;\s*font-size: 0\.85em;\s*color: var\(--cgn-text-muted\);\s*\}/.test(css), "0.85em, muted token, no icon");
}

testUi();
testRanking()
  .then(function () { console.log("people-search-real-first.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
