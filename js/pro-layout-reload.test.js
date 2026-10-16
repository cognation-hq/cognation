/**
 * Pro page reload: layout keying (personal vs pro) and fresh-page spawn lock.
 * Run: node js/pro-layout-reload.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

/* 1. Live sign-in is detected from the Supabase session only. */
assert.ok(/function liveSignedInForTower\(\)/.test(tower));
assert.ok(/s\.source !== "supabase" \|\| !s\.supabaseUserId/.test(tower));

/* 2. Live slug resolution: session/remote profiles decide, before any local registry lookup. */
var liveIdx = tower.indexOf("if (slug && liveSignedInForTower())");
assert.ok(liveIdx > 0, "live slug branch exists");
var branch = tower.slice(liveIdx, tower.indexOf('return "viewed:" + slug;', liveIdx));
assert.ok(branch.indexOf("activeProfileId") >= 0);
assert.ok(branch.indexOf("getMyProfiles") >= 0);
assert.ok(branch.indexOf("getProfileForHandle") >= 0);
assert.ok(branch.indexOf("window.CognationAccounts") < 0, "live branch never asks the local demo registry");
var fnStart = tower.lastIndexOf("function resolveActiveProfileId", liveIdx);
assert.ok(fnStart > 0);
var before = tower.slice(fnStart, liveIdx);
assert.ok(!/CognationAccounts[\s\S]*getProfileByHandle|findByHandle/.test(before), "no local handle lookup before live branch");

/* 3. Live geometry save never writes the shared legacy key. */
var g = tower.indexOf("try { localStorage.setItem(TOWER_PROFILE_KEY, JSON.stringify(towerBlob)); } catch (eGeo2) {}");
assert.ok(g > 0);
assert.ok(/if \(!liveSignedInForTower\(\)\) \{\s*$/.test(tower.slice(g - 200, g)), "legacy write is guarded");

/* 4. Fresh page: strip children sit in the strip flow, not at absolute sticker spots. */
var rule = /\.is-default-grid > \[data-tower-profile-strip\] > \.tower-sticker\.is-spawned\s*\{[^}]*\}/.exec(css);
assert.ok(rule, "strip child rule exists");
assert.ok(/position:\s*relative !important/.test(rule[0]));
assert.ok(/transform:\s*none !important/.test(rule[0]));

/* 5. First drag: strip members are frozen in the top row and the rest moves down. */
var lift = tower.slice(tower.indexOf("function liftDefaultGrid"), tower.indexOf("function freezeSpawnedWidgets"));
assert.ok(lift.indexOf("[data-tower-profile-strip]") >= 0);
assert.ok(lift.indexOf("unwrapProfileStrip(stage)") >= 0);
assert.ok(/sp\.top \+= delta/.test(lift));

console.log("pro-layout-reload tests passed");
