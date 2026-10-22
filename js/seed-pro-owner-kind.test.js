/**
 * #233 + #231 (live check a3295a0): the 3 seed Pro pages (seed-skye-0252-pro, ...) are
 * stored with account_kind 'real' and no seed_fleet_id until seed-pulse-sql/02 runs.
 * Tower already badges them via supabase-social effectiveAccountKind (owner's Personal
 * page is seed/ops). Search and the ECHO "Professionals you might know" card read the raw
 * row, so search showed no Demo badge and seed viewers got no know card (and real viewers
 * could be suggested a seed Pro). Both now use the same owner check. Real members who
 * picked a 'seed-' handle stay real.
 * Real supabase-social.js owner check + seedops-schema.js + seedops-badge.js + the real
 * professionalsYouMightKnow from commune-swipe.js, against stub rows.
 * Run: node js/seed-pro-owner-kind.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
function src(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function sliceFn(code, name) {
  var start = code.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name + " present");
  var depth = 0;
  for (var i = code.indexOf("{", start); i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

var SKYE = "aaaaaaaa-0252-4000-8000-000000000252";
var REAL = "11111111-2222-3333-4444-555555555555";
var ROWS = [
  { id: "p-skye", user_id: SKYE, kind: "personal", handle: "seed-skye-0252", display_name: "Skye", bio: "", account_kind: "seed", seed_fleet_id: "seed-0252" },
  { id: "pro-skye", user_id: SKYE, kind: "professional", handle: "seed-skye-0252-pro", display_name: "Skye Pro", bio: "", account_kind: "real", seed_fleet_id: null },
  { id: "p-sam", user_id: REAL, kind: "personal", handle: "seedling", display_name: "Sam", bio: "", account_kind: "real", seed_fleet_id: null },
  { id: "pro-sam", user_id: REAL, kind: "professional", handle: "seed-sam-pro", display_name: "Sam Seed Pro", bio: "", account_kind: "real", seed_fleet_id: null },
];

/* supabase-social owner check, real code. */
var social = src("js/supabase-social.js");
var sctx = { state: { profiles: {}, handles: {}, myProfiles: [] }, Object: Object, String: String };
vm.createContext(sctx);
vm.runInContext(["normalizeHandle", "cacheProfile", "profileForId", "profileForHandle", "profileForUser", "fleetKindOf",
  "ownerFleetKind", "effectiveAccountKind", "effectiveFleetId"].map(function (n) { return sliceFn(social, n); }).join("\n"), sctx);
ROWS.forEach(function (r) { sctx.cacheProfile(r); });
var SOCIAL = {
  effectiveAccountKind: sctx.effectiveAccountKind,
  effectiveFleetId: sctx.effectiveFleetId,
  getProfile: sctx.profileForId,
  getProfileForHandle: sctx.profileForHandle,
  listProfiles: function () { return ROWS.slice(); },
  getMyProfiles: function () { return []; },
};
var failed = 0;
function check(name, fn) {
  try { fn(); console.log("  pass  " + name); } catch (e) { failed++; console.log("  FAIL  " + name + " :: " + e.message); }
}

check("supabase-social exports effectiveFleetId", function () { assert.ok(/effectiveFleetId: effectiveFleetId,/.test(social)); });

/* --- #233 search badge ------------------------------------------------------- */
function El(tag, attrs) { this.tagName = tag.toUpperCase(); this.attrs = Object.assign({}, attrs || {}); this.children = []; this.parentNode = null; this.textContent = ""; this.className = this.attrs["class"] || ""; }
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
function row(id, handle, kind) {
  /* Exactly what people-search.js renders for a remote result. */
  var attrs = { "class": "people-search-row", "data-result-kind": "professional", "data-result-handle": handle, "data-profile-id": id, "data-account-kind": kind };
  var r = new El("button", attrs);
  r.appendChild(new El("span", { "class": "people-search-name-line", "data-seedops-badge-slot": "" }));
  return r;
}
var rows = [row("pro-skye", "seed-skye-0252-pro", "seed"), row("pro-sam", "seed-sam-pro", "real"), row("p-skye", "seed-skye-0252", "seed")];
var doc = { readyState: "complete", addEventListener: function () {}, createElement: function (t) { return new El(t); },
  querySelectorAll: function (sel) { return /\.people-search-row/.test(sel) ? rows : []; } };
var win = { document: doc, CognationAccounts: { getProfileById: function () { return null; }, getProfileByHandle: function () { return null; } }, CognationSupabaseSocial: SOCIAL };
win.window = win;
var bctx = vm.createContext({ window: win, document: doc, console: console, Object: Object });
vm.runInContext(src("js/seedops-schema.js"), bctx);
vm.runInContext(src("js/seedops-badge.js"), bctx);
win.CognationSeedOpsBadge.syncAll();
function badge(r) { var b = r.querySelectorAll(".seedops-demo-badge"); assert.ok(b.length <= 1); return b[0] || null; }
check("search: seed Pro page stored 'real' (owner is seed) gets Demo · seed", function () {
  var b = badge(rows[0]); assert.ok(b, "badge present"); assert.strictEqual(b.textContent, "Demo · seed");
});
check("search: real member with a 'seed-' Pro handle stays unbadged", function () { assert.strictEqual(badge(rows[1]), null); });
check("search: seed Personal page still badged", function () { assert.ok(badge(rows[2])); });

/* --- #231 Professionals you might know --------------------------------------- */
var swipe = src("js/commune-swipe.js");
function knowFor(viewerSeed) {
  var ctx = {
    window: { CognationSupabaseSocial: SOCIAL, CognationAccounts: null, CognationAuth: null },
    PRO: { KNOW: "pro-know" }, PRO_KNOW_MAX: 3, profileSeedById: { "pro-skye": false, "pro-sam": false },
    viewerIds: function () { return []; }, currentSession: function () { return null; }, isFollowing: function () { return false; },
    resolveViewerSeedStatus: function () { return viewerSeed; }, viewerInterestPhrases: function () { return []; }, viewerField: function () { return ""; },
    terms: function () { return []; }, liveSignedIn: function () { return true; }, eachProfile: function () {},
    String: String, Object: Object, Number: Number,
  };
  vm.createContext(ctx);
  vm.runInContext(["accountKindMeansSeed", "profileLooksSeed", "proJobTitle", "professionalsYouMightKnow"].map(function (n) { return sliceFn(swipe, n); }).join("\n"), ctx);
  var cards = ctx.professionalsYouMightKnow();
  return cards.length ? JSON.parse(JSON.stringify(cards[0].people.map(function (p) { return p.handle; }))) : [];
}
check("know card: seed viewer (0030/0031/0033/0028) gets the seed Pro page before 02", function () {
  assert.deepStrictEqual(knowFor(true), ["seed-skye-0252-pro"]);
});
check("know card: real viewer is not suggested the mislabelled seed Pro page", function () {
  assert.deepStrictEqual(knowFor(false), ["seed-sam-pro"]);
});

if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("seed-pro-owner-kind.test.js ok");
