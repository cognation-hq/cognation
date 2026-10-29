/**
 * PM #203 follow-up: signed in, a seed / ops Tower page keeps its Demo badge and
 * shows "Unavailable" (real ↛ seed/ops), even with a handle that has no seed-
 * prefix. A real member with a legacy seed- handle gets no badge and "+ friend".
 * Real modules: seedops-schema, seedops-badge (syncTowerBadges), seedops-friend-gate,
 * social-graph, tower-follow; supabase-social toTowerProfile and login.js
 * mapSupabaseProfile / buildSession run from their source.
 * Run: node js/seed-tower-signedin.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
/* Built at runtime from parts: no literal addresses in tests (HH rule). */
function memberAddr(local) { return local + "@" + ["example", "test"].join("."); }
function fnSource(text, name) {
  var start = text.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " exists");
  var depth = 0, i = text.indexOf("{", start);
  for (; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) break;
  }
  return text.slice(start, i + 1);
}
var social = src("js/supabase-social.js");
var login = src("js/login.js");
var toTowerProfile = new Function("var state = { profiles: {}, handles: {}, myProfiles: [] };\n" +
  ["normalizeHandle", "profileForUser", "fleetKindOf", "ownerFleetKind", "effectiveAccountKind", "effectiveFleetId", "toTowerProfile"]
    .map(function (n) { return fnSource(social, n); }).join("\n") + "\nreturn toTowerProfile;")();
var loginFns = new Function(fnSource(login, "mapSupabaseProfile") + "\n" + fnSource(login, "buildSession") +
  "\nreturn { map: mapSupabaseProfile, build: buildSession };")();

function El(attrs) {
  this.attrs = Object.assign({}, attrs || {}); this.children = []; this.textContent = ""; this.hidden = false; this.disabled = false; this.parentNode = null;
  var cls = {}; this.classList = { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, toggle: function (c, on) { if (on) cls[c] = 1; else delete cls[c]; }, contains: function (c) { return !!cls[c]; } };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; };
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
El.prototype.querySelector = function (sel) { if (sel === ".seedops-demo-badge") return this.children.filter(function (c) { return c.className === "seedops-demo-badge"; })[0] || null; return this.map ? this.map[sel] || null : null; };
El.prototype.querySelectorAll = function (sel) { return sel === ".seedops-demo-badge" ? this.children.filter(function (c) { return c.className === "seedops-demo-badge"; }) : []; };

var UUID = { viewer: "aaaaaaaa-1111-4111-8111-111111111111", seed: "bbbbbbbb-2222-4222-8222-222222222222", ops: "cccccccc-3333-4333-8333-333333333333", real: "dddddddd-4444-4444-8444-444444444444", seedViewer: "eeeeeeee-5555-4555-8555-555555555555" };
function row(id, handle, ak, fleet) { return { id: id, user_id: "u-" + id.slice(0, 8), kind: "personal", handle: handle, display_name: handle, bio: "", account_kind: ak, seed_fleet_id: fleet || null }; }
var ROWS = {};
ROWS[UUID.viewer] = row(UUID.viewer, "riley", "real");
ROWS[UUID.seed] = row(UUID.seed, "sasha", "seed", "seed-0080");
ROWS[UUID.ops] = row(UUID.ops, "wire", "ops", "ops-wire");
ROWS[UUID.real] = row(UUID.real, "seed-legacy", "real");
ROWS[UUID.seedViewer] = row(UUID.seedViewer, "theo", "seed", "seed-0087");

function openTower(viewerId, targetId) {
  var listeners = {};
  var app = new El({ "data-tower-app": "", "data-view-kind": "personal", "data-tower-is-owner": "false", "data-tower-side": "public" });
  var nameWrap = new El({}); app.map = { "[data-tower-profile-name-wrap]": nameWrap };
  var followRow = new El({});
  var btn = new El({ "data-tower-follow": "" });
  btn.closest = function (sel) {
    if (/data-tower-follow-row/.test(sel)) return followRow;
    if (/data-tower-messages|tower-messages|commune-thread/.test(sel)) return null;
    if (/data-tower-app|data-tower-root|data-tower-is-owner|#panel-tower/.test(sel)) return app;
    return null;
  };
  var doc = {
    readyState: "complete", body: { classList: { contains: function () { return false; } } },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function (sel) { if (sel === "[data-tower-follow]") return [btn]; if (sel === "[data-tower-app]") return [app]; return []; },
    createElement: function () { return new El({}); },
  };
  var store = {};
  var viewerRow = ROWS[viewerId];
  var session = loginFns.build(memberAddr("member"), loginFns.map(viewerRow), { source: "supabase", supabaseUserId: viewerRow.user_id });
  var win = {
    document: doc, setTimeout: setTimeout,
    localStorage: { getItem: function (k) { return k === "cognation.session.v2" ? JSON.stringify(session) : store[k] || null; }, setItem: function (k, v) { store[k] = v; }, removeItem: function () {} },
    CognationAuth: { getSession: function () { return session; } },
    CognationAccounts: { getProfileById: function () { return null; }, getProfilesForUsername: function () { return []; }, getProfileByHandle: function () { return null; } },
    CognationSupabase: { configured: function () { return true; }, rest: function (table, o) {
      if (table === "profiles") { var m = /id=eq\.([^&]+)/.exec(o.query); return Promise.resolve(m && ROWS[decodeURIComponent(m[1])] ? [ROWS[decodeURIComponent(m[1])]] : []); }
      return Promise.resolve([]);
    }, rpc: function () { return Promise.resolve(null); } },
    CognationSupabaseSocial: { getProfile: function (id) { return ROWS[id] || null; }, getMyProfiles: function () { return [viewerRow]; }, getProfileForHandle: function () { return null; } },
    CognationTowerProfileStore: { get: function () { return toTowerProfile(ROWS[targetId]); } },
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
  };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, CustomEvent: win.CustomEvent, setTimeout: setTimeout, console: console, JSON: JSON, Math: Math, Date: Date, Promise: Promise });
  ["js/seedops-schema.js", "js/seedops-badge.js", "js/seedops-friend-gate.js", "js/social-graph.js", "js/tower-follow.js"].forEach(function (f) { vm.runInContext(src(f), ctx); });
  win.CognationSeedOpsBadge.syncTowerBadges();
  doc.dispatchEvent(new win.CustomEvent("cognation:tower-view-changed"));
  return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
    var badge = nameWrap.querySelector(".seedops-demo-badge");
    return { badge: badge ? badge.textContent : null, button: btn.textContent, disabled: btn.disabled, hidden: btn.hidden, session: session };
  });
}

/* The Tower record and the login session now carry the account fields. */
var rec = toTowerProfile(ROWS[UUID.seed]);
assert.strictEqual(rec.accountKind, "seed"); assert.strictEqual(rec.isSeed, true); assert.strictEqual(rec.isOpsBot, false); assert.strictEqual(rec.seedFleetId, "seed-0080");
assert.strictEqual(toTowerProfile(ROWS[UUID.ops]).isOpsBot, true);
assert.strictEqual(toTowerProfile(ROWS[UUID.real]).accountKind, "real");
assert.ok(/select=id,kind,handle,display_name,user_id,account_kind,seed_fleet_id&user_id=eq\./.test(login), "login profile select carries the fields");

/* Other record mappers the badge / friend gate read. */
(function () {
  var w = { CognationSupabaseSocial: { getProfile: function (id) { return ROWS[id] || null; } }, CognationAccounts: { getProfileById: function () { return null; }, getProfileByHandle: function () { return null; } } };
  w.window = w;
  var c = vm.createContext({ window: w, document: { addEventListener: function () {}, dispatchEvent: function () {} } });
  vm.runInContext(src("js/seedops-schema.js"), c);
  vm.runInContext(src("js/seedops-friend-gate.js"), c);
  var gate = w.CognationSeedOpsFriendGate;
  assert.strictEqual(gate.canFriend({ accountKind: "real" }, UUID.seed).ok, false, "friend gate: a server seed id resolves to its row (Tower roster add)");
  assert.strictEqual(gate.canFriend({ accountKind: "real" }, UUID.real).ok, true, "friend gate: real member id stays real");
})();
var swipe = src("js/commune-swipe.js");
/* #231: account fields now go through the owner check (effectiveAccountKind) first. */
assert.ok(/var rawKind = String\(row\.account_kind \|\| ""\)\.toLowerCase\(\);/.test(swipe) && /var fleetId = String\(row\.seed_fleet_id \|\| ""\);/.test(swipe) &&
  /userId: row\.user_id,\s*accountKind: kind, seedFleetId: fleetId,/.test(swipe), "professionals-you-might-know cards carry account fields");
var badgeSrc = fnSource(src("js/seedops-badge.js"), "peopleSearchRecord");
assert.ok(/social\.getProfile\(id\)/.test(badgeSrc) && /peopleSearchRecord\(id, handle\)/.test(fnSource(src("js/seedops-badge.js"), "syncPeopleSearch")), "people search badge reads the server profile row");

Promise.all([
  openTower(UUID.viewer, UUID.seed).then(function (r) {
    assert.strictEqual(r.session.accountKind, "real", "real viewer session records account_kind");
    assert.strictEqual(r.badge, "Demo · seed", "seed Tower (handle 'sasha') keeps the Demo badge");
    assert.strictEqual(r.button, "Unavailable", "real viewer sees Unavailable on a seed Tower");
    assert.strictEqual(r.disabled, true);
  }),
  openTower(UUID.viewer, UUID.ops).then(function (r) {
    assert.strictEqual(r.badge, "Ops · demo", "ops Tower keeps its badge");
    assert.strictEqual(r.button, "Unavailable", "real viewer sees Unavailable on an ops Tower");
  }),
  openTower(UUID.viewer, UUID.real).then(function (r) {
    assert.strictEqual(r.badge, null, "real member with a seed- legacy handle: no badge");
    assert.strictEqual(r.button, "+ friend", "real member: normal friend button");
    assert.strictEqual(r.disabled, false);
  }),
  openTower(UUID.seedViewer, UUID.seed).then(function (r) {
    assert.strictEqual(r.session.accountKind, "seed");
    assert.strictEqual(r.button, "+ friend", "seed ↔ seed still allowed");
  }),
]).then(function () { console.log("seed-tower-signedin.test.js ok"); }, function (e) { console.error(e); process.exit(1); });
