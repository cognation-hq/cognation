/**
 * Your own Tower never shows "+ friend" / "+ follow" / Message under your photo.
 * tower.js syncViewerMutateUi + isTowerOwner (and the session helpers) run from
 * their source against a stub Tower root; the owner match is user id first,
 * then profile id / handle. Visitors and signed-out views keep what they had.
 * Run: node js/tower-self-friend.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
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
var tower = src("js/tower.js");
var body = ["remoteSocial", "getSessionObject", "getSessionUsername", "normalizeHandle", "isTowerOwner", "syncViewerMutateUi"]
  .map(function (n) { return fnSource(tower, n); }).join("\n");
var make = new Function("window", "localStorage", "document", "TowerProfileStore", body + "\nreturn syncViewerMutateUi;");

function El(attrs) { this.attrs = Object.assign({}, attrs || {}); this.hidden = !!this.attrs.hidden; this.disabled = false; this.textContent = ""; }
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); if (k === "hidden") this.hidden = true; };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; if (k === "hidden") this.hidden = false; };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };

var ME = "u-riley", OTHER = "u-jordan";
var PERSONAL = { _profileId: "aaaaaaaa-1111-4111-8111-111111111111", _userId: ME, handle: "riley", kind: "personal" };
var PRO = { _profileId: "aaaaaaaa-5555-4555-8555-555555555555", _userId: ME, handle: "riley-studio", kind: "professional", _profileKind: "professional" };
var VISITED = { _profileId: "cccccccc-3333-4333-8333-333333333333", _userId: OTHER, handle: "jordan", kind: "personal" };

/* session: object | null; viaAuth false = only the saved localStorage session (as right after a reload). */
function view(profile, session, opts) {
  opts = opts || {};
  var followRow = new El({ "data-tower-follow-row": "" });
  var addFriends = new El({ "data-tower-add-friends": "" });
  addFriends.textContent = profile.kind === "professional" ? "+ follow" : "+ friend";
  var app = new El({ "data-tower-app": "", "data-tower-side": "public" });
  app.querySelector = function () { return null; };
  app.querySelectorAll = function (sel) {
    if (sel === "[data-tower-follow-row]") return [followRow];
    if (sel === "[data-tower-add-friends]") return [addFriends];
    return [];
  };
  var store = {};
  if (session) store["cognation.session.v2"] = JSON.stringify(session);
  var ls = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } };
  var win = {
    CognationSupabaseSocial: { getMyProfiles: function () { return session && session.source === "supabase" ? [PERSONAL, PRO].map(function (p) { return { id: p._profileId, handle: p.handle }; }) : []; } },
    CognationAccounts: { getProfileById: function () { return null; }, getProfilesForUsername: function () { return []; } },
  };
  if (session && opts.viaAuth !== false) win.CognationAuth = { getSession: function () { return session; } };
  var sync = make(win, ls, { activeElement: null }, { get: function () { return profile; }, getActiveProfileId: function () { return profile._profileId; } });
  sync(app);
  return { owner: app.getAttribute("data-tower-is-owner"), addFriendsHidden: addFriends.hidden, followRowHidden: followRow.hidden };
}
function supa(active, extra) {
  return Object.assign({ username: "riley", source: "supabase", supabaseUserId: ME, activeProfileId: active._profileId, profileHandle: active.handle }, extra || {});
}

var results = [
  ["own Personal Tower, signed in (user id)", view(PERSONAL, supa(PERSONAL, { activeProfileId: "stale-id" })), true],
  ["own Pro Tower, signed in", view(PRO, supa(PRO)), true],
  ["own Personal Tower after reload (saved session only)", view(PERSONAL, supa(PERSONAL), { viaAuth: false }), true],
  ["own Pro Tower after reload (saved session only)", view(PRO, supa(PERSONAL), { viaAuth: false }), true],
  ["own Tower, local session, handle match", view({ _profileId: "local-riley", handle: "@Riley", kind: "personal" }, { username: "riley" }), true],
  ["visitor on someone else's Tower", view(VISITED, supa(PERSONAL)), false],
  ["signed out", view(VISITED, null), false],
];
results.forEach(function (r) {
  var label = r[0], got = r[1], own = r[2];
  assert.strictEqual(got.owner, own ? "true" : "false", label + ": owner flag");
  assert.strictEqual(got.addFriendsHidden, own, label + ": '+ friend' / '+ follow' pill " + (own ? "hidden" : "left alone"));
  assert.strictEqual(got.followRowHidden, own, label + ": friend/follow/Message row " + (own ? "hidden" : "left alone"));
});

/* CSS backs it up on the owner view; the visitor rule and #206 sizing stay. */
var css = src("css/styles.css");
assert.ok(/\[data-tower-app\]\[data-tower-is-owner="true"\] \[data-tower-add-friends\] \{ display: none !important; \}/.test(css), "owner CSS hides the pill");
assert.ok(/#panel-tower \[data-tower-is-owner="false"\] \[data-tower-add-friends\] \{ display: none !important; \}/.test(css), "visitor rule unchanged");
assert.ok(/\[data-tower-is-owner="true"\] \[data-tower-follow-row\] \{ display: none !important; \}/.test(css), "owner follow-row rule unchanged");
console.log("tower-self-friend.test.js ok");
