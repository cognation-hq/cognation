/**
 * People search: seed / ops rows get the same Demo pill as everywhere else.
 * people-search.js renders button.people-search-row (not li), so
 * seedops-badge.js syncPeopleSearch now badges those rows too, by the account's
 * own field (server account_kind / local registry), never by handle text.
 * Real seedops-schema.js + seedops-badge.js against stub rows.
 * Run: node js/people-search-seed-badge.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function El(tag, attrs) {
  this.tagName = tag.toUpperCase(); this.attrs = Object.assign({}, attrs || {}); this.children = []; this.parentNode = null; this.textContent = ""; this.className = this.attrs["class"] || "";
}
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; };
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
El.prototype.all = function () { var out = []; this.children.forEach(function (c) { out.push(c); out = out.concat(c.all()); }); return out; };
El.prototype.querySelectorAll = function (sel) {
  return this.all().filter(function (e) {
    if (sel === ".seedops-demo-badge") return e.className === "seedops-demo-badge";
    if (sel === "[data-seedops-badge-slot]") return e.getAttribute("data-seedops-badge-slot") !== null;
    return false;
  });
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };

/* Same structure people-search.js renderResults builds. */
function row(p) {
  var attrs = { "class": "people-search-row", "data-result-kind": "friend", "data-result-handle": p.handle };
  if (p.id) attrs["data-profile-id"] = p.id;
  if (p.accountKind) attrs["data-account-kind"] = p.accountKind;
  var r = new El("button", attrs);
  var meta = r.appendChild(new El("span", { "class": "people-search-meta" }));
  var line = meta.appendChild(new El("span", { "class": "people-search-name-line", "data-seedops-badge-slot": "" }));
  line.appendChild(new El("span", { "class": "people-search-name" })).textContent = p.name;
  meta.appendChild(new El("span", { "class": "people-search-handle" })).textContent = "@" + p.handle;
  r.appendChild(new El("span", { "class": "people-search-open" })).textContent = "Open";
  r.textContent = p.name + " @" + p.handle + " Friend Open";
  return r;
}
var SERVER = {
  "p-sasha": { id: "p-sasha", handle: "sasha", display_name: "Sasha", account_kind: "seed", seed_fleet_id: "seed-0080" },
  "p-wire": { id: "p-wire", handle: "wire", display_name: "Wire", account_kind: "ops", seed_fleet_id: "ops-wire" },
  "p-legacy": { id: "p-legacy", handle: "seed-legacy", display_name: "Robin", account_kind: "real", seed_fleet_id: null },
  "p-jordan": { id: "p-jordan", handle: "jordan", display_name: "Jordan", account_kind: "real", seed_fleet_id: null },
};
var rows = [
  row({ id: "p-sasha", handle: "sasha", name: "Sasha" }),
  row({ id: "p-wire", handle: "wire", name: "Wire" }),
  row({ id: "p-legacy", handle: "seed-legacy", name: "Robin" }),
  row({ id: "p-jordan", handle: "jordan", name: "Jordan" }),
  row({ handle: "noa", name: "Noa", accountKind: "seed" }),
];
var doc = {
  readyState: "complete", addEventListener: function () {}, dispatchEvent: function () { return true; },
  createElement: function (t) { return new El(t); },
  querySelectorAll: function (sel) {
    if (/\.people-search-row/.test(sel)) return rows;
    return [];
  },
};
var win = {
  document: doc,
  CognationAccounts: { getProfileById: function () { return null; }, getProfileByHandle: function () { return null; } },
  CognationSupabaseSocial: {
    getProfile: function (id) { return SERVER[id] || null; },
    getProfileForHandle: function (h) { return Object.keys(SERVER).map(function (k) { return SERVER[k]; }).filter(function (r) { return r.handle === h; })[0] || null; },
  },
};
win.window = win;
var ctx = vm.createContext({ window: win, document: doc, console: console });
vm.runInContext(src("js/seedops-schema.js"), ctx);
vm.runInContext(src("js/seedops-badge.js"), ctx);
win.CognationSeedOpsBadge.syncAll();

function badgeOf(r) {
  var b = r.querySelectorAll(".seedops-demo-badge");
  assert.ok(b.length <= 1, "one badge per row");
  return b[0] || null;
}
var cases = [
  ["seed row (server account_kind seed)", rows[0], "Demo · seed", "seed"],
  ["ops row (server account_kind ops)", rows[1], "Ops · demo", "ops"],
  ["real member with a seed- legacy handle", rows[2], null],
  ["real member", rows[3], null],
  ["row carrying data-account-kind only", rows[4], "Demo · seed", "seed"],
];
var failed = 0;
cases.forEach(function (c) {
  try {
    var b = badgeOf(c[1]);
    if (c[2] === null) { assert.strictEqual(b, null, "no badge"); }
    else {
      assert.ok(b, "badge present");
      assert.strictEqual(b.textContent, c[2]);
      assert.strictEqual(b.getAttribute("data-account-kind"), c[3]);
      assert.strictEqual(b.getAttribute("role"), "status");
      assert.strictEqual(b.parentNode.getAttribute("data-seedops-badge-slot"), "", "badge sits in the name line slot, beside the name");
    }
    console.log("  pass  " + c[0]);
  } catch (e) { failed++; console.log("  FAIL  " + c[0] + " :: " + e.message); }
});
/* Re-sync keeps one badge (no duplicates). */
win.CognationSeedOpsBadge.syncAll();
try { assert.strictEqual(rows[0].querySelectorAll(".seedops-demo-badge").length, 1); console.log("  pass  re-sync keeps one badge"); }
catch (e) { failed++; console.log("  FAIL  re-sync keeps one badge :: " + e.message); }

/* people-search.js: rows carry the id / account_kind and a badge slot, and badge right after render. */
try {
  var ps = src("js/people-search.js");
  assert.ok(/row\.setAttribute\("data-profile-id", String\(p\.id\)\)/.test(ps), "row has data-profile-id");
  assert.ok(/accountKind: p\.account_kind \?/.test(ps) && /row\.setAttribute\("data-account-kind", p\.accountKind\)/.test(ps), "server rows carry account_kind");
  assert.ok(/class="people-search-name-line" data-seedops-badge-slot/.test(ps), "badge slot beside the name");
  assert.ok(/badges\.syncPeopleSearch\(\)/.test(ps), "badges sync after each render");
  var css = src("css/styles.css");
  assert.ok(/\.people-search-results \.seedops-demo-badge \{\s*margin-top: 0\.15rem;/.test(css), "existing people-search badge style unchanged");
  console.log("  pass  people-search.js wiring");
} catch (e) { failed++; console.log("  FAIL  people-search.js wiring :: " + e.message); }
if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("people-search-seed-badge.test.js ok");
