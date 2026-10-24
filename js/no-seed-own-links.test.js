/**
 * Your own Tower / PULSE never carries another page's link (Alexa, Oct 22):
 * after viewing seed-shawn-0251-pro, tapping PULSE then TOWER left
 * #tower-profile-seed-shawn-0251-pro in the URL, so "her" Pro page and its
 * share link said seed Shawn. Own and share links now come from
 * getMyProfiles only; a left-over foreign hash is dropped when you tap
 * TOWER or PULSE yourself.
 * Run: node js/no-seed-own-links.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var tabs = fs.readFileSync(path.join(__dirname, "tabs.js"), "utf8");

function sliceFn(name) {
  var start = tower.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name + " present");
  var depth = 0;
  for (var i = tower.indexOf("{", start); i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) return tower.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

var ALEXA = "b3708574-46b7-48d3-9f78-b8f7c1b1c7d4";
var SHAWN = "3a20e13b-0ff1-dd68-4d58-0bdc1d22fb4e";
var ALEXA_PERSONAL = { id: "35fa59e5-fcc8-4ff6-a6e3-302c12201e9a", user_id: ALEXA, kind: "personal", handle: "lolol" };
var ALEXA_PRO = { id: "0b348bc5-36dd-4fb7-bdc8-c1c2a971dda4", user_id: ALEXA, kind: "professional", handle: "alexat2024-pro" };
var SHAWN_PERSONAL = { id: "5654509d-1e69-4344-ac62-b377666ea18a", user_id: SHAWN, kind: "personal", handle: "seed-shawn-0251" };
var SHAWN_PRO = { id: "da63f71a-0675-42b7-bb3e-eb6329b1dee0", user_id: SHAWN, kind: "professional", handle: "seed-shawn-0251-pro" };

function makeWorld(session, mine) {
  var loc = { hash: "", pathname: "/", search: "", href: "https://cognation-3md.pages.dev/" };
  var ctx = {
    session: session,
    location: loc,
    window: {},
    URL: URL,
  };
  ctx.window.location = loc;
  ctx.window.history = {
    replaceState: function (_s, _t, url) { loc.hash = ""; loc.href = "https://cognation-3md.pages.dev" + url; },
  };
  ctx.window.CognationSupabaseSocial = {
    getMyProfiles: function () { return mine; },
    setActiveProfile: function (p) {
      session.activeProfileId = p.id; session.profileHandle = p.handle; session.profileKind = p.kind;
    },
  };
  ctx.getSessionObject = function () { return session; };
  ctx.isFounderOwner = function () { return false; };
  ctx.TowerProfileStore = { get: function () { return null; } };
  vm.createContext(ctx);
  vm.runInContext([
    "function remoteSocial() { return window.CognationSupabaseSocial || null; }",
    sliceFn("normalizeHandle"),
    sliceFn("towerProfileSlug"),
    sliceFn("viewerOwnProfiles"),
    sliceFn("viewerOwnProfileOfKind"),
    sliceFn("slugIsViewerOwn"),
    sliceFn("dropForeignActiveProfile"),
    sliceFn("clearForeignTowerHash"),
    sliceFn("profilePublicSlug"),
    sliceFn("profilePublicHash"),
    sliceFn("profilePublicUrl"),
    sliceFn("viewerShareProfile"),
    sliceFn("viewerShareUrl"),
  ].join("\n"), ctx);
  ctx.go = function (hash) {
    loc.hash = hash ? "#" + hash : "";
    loc.href = "https://cognation-3md.pages.dev/" + loc.hash;
  };
  return ctx;
}

function proView(row) { return { _profileId: row.id, _profileKind: row.kind, handle: row.handle }; }

/* 1. Alexa: own Pro (A) → Shawn's Pro (B) → tap PULSE / TOWER → own Pro (A). */
(function aba() {
  var session = { source: "supabase", supabaseUserId: ALEXA, activeProfileId: ALEXA_PRO.id, profileHandle: "alexat2024-pro" };
  var w = makeWorld(session, [ALEXA_PERSONAL, ALEXA_PRO]);
  w.go("tower-profile-alexat2024-pro");
  assert.strictEqual(w.clearForeignTowerHash(), false, "A: own Pro hash stays");
  assert.ok(/#tower-profile-alexat2024-pro$/.test(w.viewerShareUrl(proView(ALEXA_PRO))), "A: share link is hers");

  w.go("tower-profile-seed-shawn-0251-pro");
  assert.strictEqual(w.slugIsViewerOwn("seed-shawn-0251-pro"), false, "B is not hers");
  var shareOnB = w.viewerShareUrl(proView(SHAWN_PRO));
  assert.ok(shareOnB.indexOf("seed-shawn") === -1, "B: her share link never names the seed: " + shareOnB);
  assert.ok(/#tower-profile-alexat2024-pro$/.test(shareOnB), "B: share link is her own Pro page");

  /* PULSE / TOWER tap: the seed hash goes. */
  assert.strictEqual(w.clearForeignTowerHash(), true, "foreign hash cleared");
  assert.strictEqual(w.location.hash, "", "no seed hash left");
  assert.strictEqual(w.towerProfileSlug(), "", "no viewed slug left");
  assert.strictEqual(session.activeProfileId, ALEXA_PRO.id, "owner is still Alexa's Pro page");

  w.go("tower-profile-alexat2024-pro");
  assert.strictEqual(w.clearForeignTowerHash(), false, "back on A: kept");
  assert.ok(/#tower-profile-alexat2024-pro$/.test(w.viewerShareUrl(proView(ALEXA_PRO))), "A again: own link");
  assert.ok(JSON.stringify(session).indexOf("seed") === -1, "no seed id or handle in her session");
})();

/* 2. A stale seed id/handle cached in a real user's session is reset to her own page. */
(function staleSeedSession() {
  var session = { source: "supabase", supabaseUserId: ALEXA, activeProfileId: SHAWN_PRO.id, profileHandle: "seed-shawn-0251-pro" };
  var w = makeWorld(session, [ALEXA_PERSONAL, ALEXA_PRO]);
  w.go("tower-profile-seed-shawn-0251-pro");
  assert.strictEqual(w.slugIsViewerOwn("seed-shawn-0251-pro"), false, "cached seed handle is not trusted once getMyProfiles is known");
  assert.strictEqual(w.dropForeignActiveProfile(), true, "stale seed session reset");
  assert.strictEqual(session.activeProfileId, ALEXA_PERSONAL.id);
  assert.strictEqual(session.profileHandle, "lolol");
  assert.strictEqual(w.clearForeignTowerHash(), true);
  assert.ok(JSON.stringify(session).indexOf("seed") === -1, "no seed left in session");
})();

/* 3. Real user with no Pro page: no Pro link, never a seed fallback. */
(function noPro() {
  var session = { source: "supabase", supabaseUserId: ALEXA, activeProfileId: ALEXA_PERSONAL.id, profileHandle: "lolol" };
  var w = makeWorld(session, [ALEXA_PERSONAL]);
  w.go("tower-profile-seed-shawn-0251-pro");
  assert.strictEqual(w.viewerOwnProfileOfKind("professional"), null);
  assert.strictEqual(w.viewerShareUrl(proView(SHAWN_PRO)), "", "no Pro page means no Pro link");
  assert.strictEqual(w.dropForeignActiveProfile(), false, "her own active profile is left alone");
})();

/* 4. A seed's own links stay the seed's own. */
(function seedOwn() {
  var session = { source: "supabase", supabaseUserId: SHAWN, activeProfileId: SHAWN_PRO.id, profileHandle: "seed-shawn-0251-pro" };
  var w = makeWorld(session, [SHAWN_PERSONAL, SHAWN_PRO]);
  w.go("tower-profile-seed-shawn-0251-pro");
  assert.strictEqual(w.clearForeignTowerHash(), false, "seed's own Pro hash stays");
  assert.ok(/#tower-profile-seed-shawn-0251-pro$/.test(w.viewerShareUrl(proView(SHAWN_PRO))), "seed share link is its own");
  assert.ok(/#tower-profile-seed-shawn-0251-pro$/.test(w.viewerShareUrl(proView(ALEXA_PRO))), "seed viewing Alexa still shares its own Pro");
  assert.strictEqual(w.dropForeignActiveProfile(), false);
})();

/* 5. Wiring: TOWER (your own tap) and PULSE drop a foreign hash; programmatic opens keep it. */
assert.ok(/userTap && typeof window\.CognationTowerClearForeignHash === "function"/.test(tabs), "TOWER tap clears");
assert.ok(/activate\(i, false, !!\(ev && ev\.isTrusted\)\)/.test(tabs), "only trusted taps count as yours");
var anchor = tabs.slice(tabs.indexOf("function openTowerAnchor("), tabs.indexOf("function initTowerShortcuts("));
assert.ok(anchor.indexOf("CognationTowerClearForeignHash") < anchor.indexOf('name === "circle"'), "PULSE clears before opening");
var openOwn = tower.slice(tower.indexOf("window.CognationTowerOpenOwn = function"), tower.indexOf("window.CognationTowerClearForeignHash ="));
assert.ok(/dropForeignActiveProfile\(\);\s*clearForeignTowerHash\(\);/.test(openOwn), "OpenOwn uses getMyProfiles, not a cached handle");
assert.ok(openOwn.indexOf("session.profileHandle") === -1, "OpenOwn no longer trusts session.profileHandle");

/* 6. Pin fallback and layout keys no longer read the URL hash. */
assert.ok(tower.indexOf('(location.hash || "#")') === -1, "pin fallback is not location.hash");
assert.ok(tower.indexOf('String(location.hash).indexOf("#tower-profile-") === 0 ? location.hash') === -1, "pin stay-link is not location.hash");
var keysFn = tower.slice(tower.indexOf("add(p && (p._profileId || p.id));"), tower.indexOf("function readScrapbookLayouts("));
assert.ok(keysFn.indexOf("location.hash") === -1, "layout keys ignore the hash");

console.log("no-seed-own-links: ok");
