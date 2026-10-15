/* Default layout: Top Friends start below the MP3 (24px gap), evenly spaced; moved pins keep their spot. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
assert.ok(/function isDefaultFriendPinPos\(p, index, pos\)/.test(tower));
assert.ok(/if \(!phone && !isDefaultFriendPinPos\(p, index, pinLayout\[fid\]\)\) \{\s*occupied\.push/.test(tower), "owner-moved pins stay put and are avoided");
assert.ok(/rows\.splice\(mi >= 0 \? mi \+ 1 : rows\.length, 0, \["__friendpins"\]\);/.test(tower), "pins row right after music");
assert.ok(/px \+= \(autoPins\[i - 1\]\.offsetWidth \|\| 0\) \+ SPAWN_GAP; \/\* even 24px gaps \*\//.test(tower));
assert.ok(!/friendPinLayout\[[^\]]+\] = \{[^}]*is-spawned/.test(tower) && !/__friendpins[\s\S]{0,400}TowerProfileStore\.save/.test(tower), "spawned pin spots are not saved (no migration)");
console.log("top-friends-spawn.test.js: ok");
