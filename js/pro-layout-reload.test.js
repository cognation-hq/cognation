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

/* 6. Fresh strip: avatar not clipped, handles in their own gutter. */
assert.ok(/\[data-tower-profile-strip\] \{\s*max-height: none;\s*overflow: visible;/.test(css), "strip no longer clips the avatar");
assert.ok(/\[data-tower-profile-strip\] > \.tower-sticker\.is-spawned > \.tower-sticker-handle \{[^}]*left: 2px;[^}]*translateY\(-50%\)/.test(css), "handle in left gutter");
assert.ok(/\.tower-sticker--identity\.is-spawned \{\s*padding-left: 32px;/.test(css), "name clears the handle");

assert.ok(/:not\(\.is-default-grid\) > \.tower-sticker--identity \{\s*padding-left: 36px;/.test(css), "free layout name clears handle");

/* 7. Drag stays inside the card and keeps column width. */
assert.ok(/maxX = Math\.max\(inset, 100 - inset - \(sticker\.offsetWidth \/ rect\.width\) \* 100\)/.test(tower));
assert.ok(/maxY = Math\.max\(0, 100 - \(sticker\.offsetHeight \/ rect\.height\) \* 100\)/.test(tower));
assert.ok(/if \(sp\.half\) setStickerWidth\(el, sp\.w\);/.test(tower));
assert.ok(/layout\[id\]\.wPx = Math\.round\(dropW\)/.test(tower));
assert.ok(/:not\(\.is-default-grid\) > \.tower-sticker\[data-sticker-w\] \{\s*width: var\(--sticker-w\);/.test(css));
var sync = fs.readFileSync(path.join(root, "js/tower-layout-sync.js"), "utf8");
assert.ok(/entry\.wPx = Math\.round/.test(sync), "layout sync keeps wPx");

/* 8. Personal music player is contained in its row. */
assert.ok(/\.tower-sticker--music\.is-spawned \.tower-ipod \{[^}]*height: 72px;[^}]*overflow: hidden;/.test(css));
assert.ok(/\.tower-sticker--music\.is-spawned \.tower-ipod-screen \{[^}]*height: 56px;/.test(css));

/* 9. Pro cannot carry music at all: stripProMusic drops layout + switch, on load and on save. */
var vm = require("vm");
var fnSrc = tower.slice(tower.indexOf("  function isProTower(p)"), tower.indexOf("  function socialWidgetId"));
var fnSrc2 = tower.slice(tower.indexOf("  function stripProMusic(p)"), tower.indexOf("  /* Before saving any layout"));
var ctx = {}; vm.createContext(ctx); vm.runInContext(fnSrc + fnSrc2 + "this.f = stripProMusic;", ctx);
var pro = { _profileKind: "professional", widgetLayout: { music: { x: 2, y: 3 }, youtube: { x: 1, y: 1 } }, publicWidgets: { music: true, calendar: true } };
assert.strictEqual(ctx.f(pro), true);
assert.ok(!("music" in pro.widgetLayout) && !("music" in pro.publicWidgets) && pro.widgetLayout.youtube);
var per = { _profileKind: "personal", widgetLayout: { music: { x: 2, y: 3 } }, publicWidgets: { music: true } };
assert.strictEqual(ctx.f(per), false);
assert.ok(per.widgetLayout.music && per.publicWidgets.music === true, "personal keeps music");
assert.ok(/function pruneEmptyPublicWidgetsInProfile\(p\) \{\s*if \(!p\) return p;\s*stripProMusic\(p\);/.test(tower));
assert.ok(/if \(data\._loading\) return false;\s*stripProMusic\(data\);/.test(tower));

/* 10. "Add a professional page" hides once a Pro page exists (re-sync on profile load, no stale title). */
assert.ok(/cognation:remote-profile-loaded", function \(\) \{\s*syncProfileKindToggle\(root\);\s*syncAddProfileUi\(root\);/.test(tower));
assert.ok(/if \(proBtn\) proBtn\.removeAttribute\("title"\);/.test(tower));
assert.ok(/btn\.hidden = hasRemoteProfessional;/.test(tower));

console.log("pro-layout-reload tests passed");
