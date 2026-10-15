/* Default layout: Top Friends start below the MP3 (24px gap), evenly spaced; moved pins keep their spot. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
assert.ok(/function isDefaultFriendPinPos\(p, index, pos\)/.test(tower));
assert.ok(/if \(!phone && !isDefaultFriendPinPos\(p, index, pinLayout\[fid\]\)\) \{\s*pin\.classList\.remove\("is-spawned"\);\s*pin\.style\.removeProperty\("--friend-pin-w"\);\s*occupied\.push/.test(tower), "owner-moved pins stay put and are avoided");
assert.ok(/rows\.splice\(mi >= 0 \? mi \+ 1 : rows\.length, 0, \["__friendpins"\]\);/.test(tower), "pins row right after music");
assert.ok(/px \+= Math\.ceil\(cardW\) \+ SPAWN_GAP; \/\* equal cards, even 24px gaps \*\//.test(tower));
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
assert.ok(/\.tower-friend-pin\.is-spawned \{\s*width: var\(--friend-pin-w, auto\);/.test(css), "equal card width in default layout only");
assert.ok(!/friendPinLayout\[[^\]]+\] = \{[^}]*is-spawned/.test(tower) && !/__friendpins[\s\S]{0,400}TowerProfileStore\.save/.test(tower), "spawned pin spots are not saved (no migration)");
console.log("top-friends-spawn.test.js: ok");
