/* Live room full-height chat view + right swipe to the next ECHO card. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
// Pull roomSwipeIsNext out and exercise it.
const m = src.match(/var ROOM_SWIPE_MIN_X = (\d+);\s*var ROOM_SWIPE_RATIO = ([\d.]+);\s*(function roomSwipeIsNext[\s\S]*?\n  \})/);
assert.ok(m, "roomSwipeIsNext present");
const f = new Function("ROOM_SWIPE_MIN_X", "ROOM_SWIPE_RATIO", m[3] + "; return roomSwipeIsNext;")(+m[1], +m[2]);
assert.strictEqual(f(120, 10), true, "clear right swipe moves on");
assert.strictEqual(f(-120, 10), false, "left swipe does nothing");
assert.strictEqual(f(40, 0), false, "short drag ignored");
assert.strictEqual(f(100, 80), false, "diagonal / vertical-dominant ignored");
assert.strictEqual(f(120, 10, { scrolledY: true }), false, "not while list scrolled");
assert.strictEqual(f(120, 10, { inputFocused: true }), false, "not while input focused");
assert.strictEqual(f(120, 10, { typing: true }), false, "not while typing");
assert.ok(/if \(ok\) nextCardFromRoom\(\)/.test(src) && /function nextCardFromRoom\(\) \{\s*closeRoom\(\);\s*finishSwipe\(\);/.test(src), "swipe goes to next card");
assert.ok(/\[data-commune-room-back\]/.test(src), "Back to deck fallback still wired");
assert.ok(/scrollLogToNewest\(log\)/.test(src), "auto-scroll to newest");
assert.ok(/<time class="commune-room-time"/.test(src), "timestamps on name line");
assert.ok(/\.commune-room\[data-commune-room-overlay\] \{[\s\S]*?position: fixed;[\s\S]*?100dvh/.test(css), "full-height view");
assert.ok(/env\(safe-area-inset-bottom\)/.test(css), "safe-area aware compose");
assert.ok(/prefers-reduced-motion: reduce\) \{\s*\.commune-room\[data-commune-room-overlay\]/.test(css), "reduced motion");
assert.ok(/\.commune-room-time \{ white-space: nowrap/.test(css), "time never wraps");
const tail = css.slice(css.indexOf("Live room chat view"));
assert.ok(!/#ED9300|#d98400|yellow/i.test(tail), "no yellow");
assert.ok(/aria-modal/.test(src) && /body\.commune-room-view-open \.commune-swipe-shell \{ backdrop-filter: none/.test(css), "overlay escapes the card, modal");
assert.ok(/ev\.key === "Escape"[\s\S]{0,60}closeRoom\(\)/.test(src), "Escape closes");
assert.ok(/commune-room-view-open/.test(src) && /body\.commune-room-view-open \{ overflow: hidden/.test(css), "body scroll locked");
assert.ok(/state\.roomReturnFocus/.test(src), "focus returns");
assert.ok(/var on = kind === "classroom";/.test(src), "deck stays under the overlay (Back returns to same card)");
assert.ok(/\(card\.type === TYPE\.KNOW \|\| card\.type === TYPE\.FRIEND\)[\s\S]{0,200}openPersonTower\(card\)/.test(src), "know/friend cards open the person's Tower");
assert.ok(/\(card\.type === TYPE\.EVENT \|\| card\.type === TYPE\.CONTENT\) && card\.handle\)[\s\S]{0,200}openProfessionalPage\(card\)/.test(src), "event/content keep the poster's Tower by handle");
// Swipe closes classroom/auction views too (no data-commune-room-view exclusion).
assert.ok(!/hasAttribute\("data-commune-room-overlay"\) \|\| panel\.hasAttribute\("data-commune-room-view"\)/.test(src), "swipe also closes card views");
assert.ok(/function paintCardView[\s\S]{0,300}wireRoomSwipe\(panel\)/.test(src), "classroom/auction views get the swipe");
// openPersonTower behaviour.
(function () {
  const pm = src.match(/function personCardIsPro[\s\S]*?\n  \}\n  function openPersonTower[\s\S]*?\n  \}\n/);
  assert.ok(pm, "openPersonTower present");
  let opened = [], proOpened = [];
  const recs = { "p-pro": { kind: "professional" }, "p-per": { kind: "personal" } };
  const win = { CognationTowerOpenProfile: function (h) { opened.push(h); } };
  const fn = new Function("window", "location", "profileById", "openProfessionalPage", pm[0] + "; return openPersonTower;")(
    win, {}, function (id) { return recs[id] || null; }, function (c) { proOpened.push(c.handle); });
  assert.strictEqual(fn({ type: "know", profileId: "p-per", handle: "sam" }), "personal");
  assert.deepStrictEqual(opened, ["p-per"], "personal Tower opened by profile id");
  assert.strictEqual(fn({ type: "friend", profileId: "p-pro", handle: "acme" }), "pro", "share from a Pro item opens the Pro page");
  assert.strictEqual(fn({ type: "pro-know", profileId: "x", handle: "doc" }), "pro");
  assert.deepStrictEqual(proOpened, ["acme", "doc"]);
  assert.strictEqual(fn({ type: "friend", profileId: "", handle: "@lee" }), "personal");
  assert.strictEqual(opened[1], "lee", "falls back to handle");
})();
console.log("room-chat-view ok");
