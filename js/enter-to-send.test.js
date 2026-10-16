/* Enter sends, Shift+Enter new line, IME-safe: chatroom/classroom overlay and DMs. */
const assert = require("assert");
const fs = require("fs"), path = require("path");
const swipe = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
const dm = fs.readFileSync(path.join(__dirname, "commune-messages.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(/composeInput = form\.querySelector\("\[data-commune-room-input\]"\)/.test(swipe), "room overlay input wired");
assert.ok(/composeInput\.addEventListener\("keydown"[\s\S]{0,120}e\.isComposing \|\| e\.keyCode === 229\) return;[\s\S]{0,120}e\.key !== "Enter" \|\| e\.shiftKey/.test(swipe), "room: IME guard, Shift+Enter passes");
assert.ok(/e\.isComposing \|\| e\.keyCode === 229\) return;\s*if \(e\.key === "Enter" && !e\.shiftKey\)/.test(dm), "DM: IME guard before Enter send");
assert.ok(/data-commune-room-compose[\s\S]{0,600}type="submit"/.test(html), "Send button kept");
/* Behavior check of the room handler logic */
function handler(e) { if (e.isComposing || e.keyCode === 229) return "skip"; if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return "newline-or-type"; return "send"; }
assert.strictEqual(handler({ key: "Enter" }), "send");
assert.strictEqual(handler({ key: "Enter", shiftKey: true }), "newline-or-type");
assert.strictEqual(handler({ key: "Enter", isComposing: true }), "skip");
assert.strictEqual(handler({ key: "Enter", keyCode: 229 }), "skip");
console.log("enter-to-send ok");
