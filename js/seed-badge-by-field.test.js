/**
 * Seed / ops SERVER posts are badged by their account fields
 * (profiles.account_kind / seed_fleet_id), not by a "seed-" handle.
 * Real seedops-schema.js classify + seedops-badge.js, real supabase-social.js
 * mapPost, real tower.js towerPostSeedBadge.
 * Run: node js/seed-badge-by-field.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
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

var doc = { readyState: "complete", addEventListener: function () {}, dispatchEvent: function () { return true; },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
var win = { document: doc, localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} } };
win.window = win;
var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, console: console, Date: Date, JSON: JSON, Math: Math, CustomEvent: function () {} });
vm.runInContext(src("js/seedops-schema.js"), ctx);
vm.runInContext(src("js/seedops-badge.js"), ctx);
var S = win.CognationSeedOps, Badge = win.CognationSeedOpsBadge;
function kind(rec) { return S.classify(rec).accountKind; }

/* ---- 1. classify: fields decide; handles are never read ------------------------- */
var UUID = "6f1c2a9e-1111-4222-8333-944455556666";
assert.strictEqual(kind({ accountKind: "seed", handle: "sasha", id: UUID }), "seed", "accountKind seed");
assert.strictEqual(kind({ account_kind: "ops", handle: "wire", id: UUID }), "ops", "raw account_kind ops");
assert.strictEqual(kind({ accountKind: "real", handle: "seed-legacy", id: UUID }), "real", "explicit real wins over a seed- handle");
assert.strictEqual(kind({ accountKind: "real", handle: "ops-legacy", id: UUID }), "real", "explicit real wins over an ops- handle");
assert.strictEqual(kind({ handle: "seed-sasha-0001", id: UUID }), "real", "handle alone no longer makes a seed");
assert.strictEqual(kind({ handle: "ops-wire", id: UUID }), "real", "handle alone no longer makes an ops bot");
assert.strictEqual(kind({ accountUsername: "seed-0001", id: UUID }), "real", "username alone no longer makes a seed");
assert.strictEqual(kind({ seedFleetId: "seed-0001", id: UUID }), "seed", "seed_fleet_id seed-…");
assert.strictEqual(kind({ seed_fleet_id: "ops-mod", id: UUID }), "ops", "seed_fleet_id ops-… is ops (was seed)");
assert.strictEqual(kind({ isSeed: true, id: UUID }), "seed", "isSeed flag");
assert.strictEqual(kind({ isOpsBot: true, id: UUID }), "ops", "isOpsBot flag");
/* Fallback when every field is missing: app-made local ids only. */
assert.strictEqual(kind({ id: "prof-seed-0001", handle: "maya" }), "seed", "fallback: local registry id");
assert.strictEqual(kind({ id: "seed-0042" }), "seed", "fallback: fleet id");
assert.strictEqual(kind({ id: "prof-ops-mod" }), "ops", "fallback: local ops id");
assert.strictEqual(kind({ id: UUID }), "real", "fallback: server UUID is real");
assert.strictEqual(kind({}), "real", "nothing known is real");
/* The local SeedOps fleet records still classify as before. */
assert.strictEqual(kind(S.buildSeedRecord(0)), "seed", "buildSeedRecord still seed");

/* Labels unchanged. */
assert.ok(/>Demo · seed<\/span>$/.test(Badge.badgeHtml({ accountKind: "seed" })), "Demo · seed label");
assert.ok(/>Ops · demo<\/span>$/.test(Badge.badgeHtml({ accountKind: "ops" })), "Ops · demo label");
assert.strictEqual(Badge.badgeHtml({ accountKind: "real", handle: "seed-legacy" }), "", "no badge for a real member");
var schemaSrc = src("js/seedops-schema.js");
var classifySrc = fnSource(schemaSrc, "classify");
assert.ok(!/record\.handle|accountUsername|record\.username/.test(classifySrc), "classify reads no handle / username");

/* ---- 2. supabase-social: selects carry the fields; mapPost keeps them ------------ */
var social = src("js/supabase-social.js");
assert.ok(/var PROFILE_RETURN_COLUMNS = "id,user_id,kind,handle,display_name,bio,account_kind,seed_fleet_id";/.test(social), "profile columns include account_kind, seed_fleet_id");
assert.ok(/function selectProfiles\(\)[\s\S]{0,200}"select=" \+ PROFILE_RETURN_COLUMNS \+ "&order=created_at\.desc/.test(social), "member list select uses them");
assert.ok(/function refreshMyProfiles\(\)[\s\S]{0,300}"select=" \+ PROFILE_RETURN_COLUMNS \+ "&user_id=eq\."/.test(social), "my-profiles select uses them");
assert.ok(/author:profiles!tower_posts_author_profile_id_fkey\(id,user_id,kind,handle,display_name,bio,account_kind,seed_fleet_id(,photo_url)?\)/.test(social), "feed author embed has both");
var mig = src("supabase/migrations/20261002_seedops_account_kind.sql");
assert.ok(/add column if not exists account_kind/.test(mig) && /add column if not exists seed_fleet_id text/.test(mig), "columns exist in migrations");

var sctx = vm.createContext({ window: {}, state: { profiles: {}, handles: {} } });
vm.runInContext(["normalizeHandle", "cacheProfile", "profileForId", "reactionsMap", "mapPost"].map(function (n) { return fnSource(social, n); }).join("\n"), sctx);
function author(id, handle, ak, fleet) { return { id: id, user_id: "u-" + id, kind: "personal", handle: handle, display_name: handle, bio: "", account_kind: ak, seed_fleet_id: fleet || null }; }
var seedPost = sctx.mapPost({ id: "p1", author_profile_id: "a1", body: "hi", created_at: "2026-10-20T20:00:00Z", author: author("a1", "sasha", "seed", "seed-0001") });
assert.strictEqual(seedPost.accountKind, "seed"); assert.strictEqual(seedPost.isSeed, true); assert.strictEqual(seedPost.seedFleetId, "seed-0001");
var opsPost = sctx.mapPost({ id: "p2", author_profile_id: "a2", body: "x", created_at: "2026-10-20T20:00:00Z", author: author("a2", "wire", "ops", "ops-wire") });
assert.strictEqual(opsPost.accountKind, "ops"); assert.strictEqual(opsPost.isOpsBot, true);
var realPost = sctx.mapPost({ id: "p3", author_profile_id: "a3", body: "x", created_at: "2026-10-20T20:00:00Z", author: author("a3", "seed-legacy", "real") });
assert.strictEqual(realPost.accountKind, "real"); assert.strictEqual(realPost.isSeed, false);
/* Cached author (from the member list) is used when the row has no embed. */
sctx.cacheProfile(author("a4", "theo", "seed", "seed-0087"));
var cachedPost = sctx.mapPost({ id: "p4", author_profile_id: "a4", body: "x", created_at: "2026-10-20T20:00:00Z" });
assert.strictEqual(cachedPost.accountKind, "seed", "cached profile carries account_kind");
var unknownPost = sctx.mapPost({ id: "p5", author_profile_id: "a5", body: "x", created_at: "2026-10-20T20:00:00Z", author: { id: "a5", handle: "seed-old", display_name: "Old" } });
assert.strictEqual(unknownPost.accountKind, "", "missing field stays empty");

/* ---- 3. tower.js towerPostSeedBadge on those server posts ----------------------- */
var tower = src("js/tower.js");
var badgeFn = new Function("window", fnSource(tower, "towerPostSeedBadge") + "\nreturn towerPostSeedBadge;")(win);
assert.ok(/>Demo · seed</.test(badgeFn(seedPost)), "seed server post (handle 'sasha') gets Demo · seed");
assert.ok(/>Ops · demo</.test(badgeFn(opsPost)), "ops server post gets Ops · demo");
assert.strictEqual(badgeFn(realPost), "", "real member with a legacy seed- handle: no badge");
assert.strictEqual(badgeFn(unknownPost), "", "server post without account fields: no badge (UUID author)");
assert.ok(!/handle: post/.test(fnSource(tower, "towerPostSeedBadge")), "towerPostSeedBadge passes no handle");

/* ---- 4. commune (Times) classify call uses the fields ---------------------------- */
var commune = src("js/commune.js");
var call = commune.slice(commune.indexOf("seedMeta = window.CognationSeedOps.classify({"), commune.indexOf("} catch (eSeed) {}"));
assert.ok(call.length > 0 && !/handle:/.test(call) && /accountKind: p\.accountKind/.test(call) && /isOpsBot: p\.isOpsBot/.test(call) && /seedFleetId: p\.seedFleetId/.test(call), "Times classify passes account fields, no handle");

/* ---- 5. badge colour from #198 unchanged ---------------------------------------- */
assert.ok(/\.seedops-demo-badge \{\s*color: #4a1d12 !important;\s*\}/.test(src("css/styles.css")), "#4a1d12 badge colour kept");

console.log("seed-badge-by-field.test.js ok");
