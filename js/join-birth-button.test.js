/* no_birth join refusal shows #141's Add birth month button (rooms + classrooms); own Tower hides Add friend. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const swipe = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
assert.ok(/function setBirthNeededStatus/.test(swipe), "status helper");
assert.ok(/mapped\.code === "no_birth"\) setBirthNeededStatus/.test(swipe), "no_birth gets the button");
assert.ok(/var mapped = mapChatRoomError\(err\);\s*showJoinError\(mapped\);/.test(swipe), "room join uses it");
assert.ok(/if \(liveBirthMissing\(\)\) \{\s*setBirthNeededStatus\(/.test(swipe), "classroom join uses it");
assert.ok(/addEventListener\("cognation:birth-saved"[\s\S]{0,400}setDatingBirthAge\(age\)/.test(swipe), "retry works without reload");
assert.ok(/\["under_13", "Chat rooms are for members 13 and up\."\]/.test(swipe), "under_13 stays plain");
const follow = fs.readFileSync(path.join(__dirname, "tower-follow.js"), "utf8");
assert.ok(/data-tower-is-owner"\) === "true"\) return true/.test(follow), "owner check");
const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
assert.ok(/\[data-tower-is-owner="true"\] \[data-tower-follow-row\] \{ display: none/.test(css), "css guard");
console.log("join-birth-button ok");
