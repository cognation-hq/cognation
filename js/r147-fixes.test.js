/* r147 live FAILs: classroom Back/Escape blank deck, Pro "Open their page", pro placeholders; layout backup. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const swipe = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
const tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
const sync = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
const social = fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8");

// 1. The legacy classroom panel selector must not match the deck's classroom card.
const selM = swipe.match(/var CLASSROOM_PANEL_SEL = "([^"]+)";/);
assert.ok(selM, "selector constant");
assert.ok(/\[data-classroom\]:not\(\[data-commune-card\]\)/.test(selM[1]), "deck card excluded");
assert.ok(!/querySelector\("\[data-classroom\], #panel-classroom/.test(swipe), "no raw selector left");
assert.strictEqual((swipe.match(/CLASSROOM_PANEL_SEL/g) || []).length, 4, "all three lookups use it");

// 2. Pro "you might know" uses real server profiles when signed in.
assert.ok(/listProfiles: function \(\)/.test(social), "social exposes server profiles");
assert.ok(/if \(liveSignedIn\(\)\) \{\s*each = function/.test(swipe), "live: server profiles only");
assert.ok(!/pro-know-placeholder/.test(swipe), "zero real pages -> no PYMK card (no placeholder, signed in or out)");
// PR A hides nothing.
assert.ok(!/SHOW_PRO_PLACEHOLDERS/.test(swipe), "no placeholder hiding in this PR");

// 4. Layout backup before repair writes.
assert.ok(/var priorLayout = null;[\s\S]{0,200}JSON\.parse\(JSON\.stringify\(layout\)\)/.test(tower), "snapshot before mutation");
const iSnap = tower.indexOf("var priorLayout = null;"), iMut = tower.indexOf("prev.x = x;", iSnap);
assert.ok(iSnap > 0 && iMut > iSnap, "snapshot taken before positions change");
assert.ok(/isTowerOwner\(p\)[\s\S]{0,900}p\.layoutBackup = \{ at: new Date\(\)\.toISOString\(\), layout: priorPositions \}/.test(tower), "owner-only backup with timestamp");
// cleanBackup + save keep one copy in layout JSON.
const sb = { window: {}, setTimeout: function () {}, clearTimeout: function () {} };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(sync, sb);
const api = sb.CognationTowerLayoutSync;
const bk = api._cleanBackup({ at: "2026-10-16T14:00:00Z", layout: { mp3: { x: 10, y: 20, yPx: 200 }, _public: { musicUrl: "x" }, _backup: { at: "old" } } });
assert.ok(bk && bk.layout.mp3 && bk.layout.mp3.x === 10, "positions kept");
assert.ok(!bk.layout._public && !bk.layout._backup, "no nested backups");
assert.strictEqual(bk.at, "2026-10-16T14:00:00.000Z");
const cleaned = api._clean({ a: { x: 1, y: 2 }, _backup: { at: "2026-10-16T14:00:00Z", layout: { a: { x: 5, y: 6 } } } });
assert.ok(cleaned._backup && cleaned._backup.layout.a.x === 5, "backup survives clean");
assert.ok(/wid === "_public" \|\| wid === "_backup"/.test(sync), "backup never applied as a widget");
console.log("r147-fixes ok");
