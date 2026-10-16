/* postlive149: Calendar title box clears the drag dots; avatar/name resize handles hidden at rest. */
const assert = require("assert");
const fs = require("fs");
const css = fs.readFileSync(require("path").join(__dirname, "..", "css", "styles.css"), "utf8");
assert.ok(/\.tower-sticker--followers \.tower-widget-title,\s*\[data-tower-app\]\[data-tower-is-owner="true"\]\[data-tower-side="public"\] \.tower-sticker--calendar \.tower-cal-public-title \{\s*padding-left: 0;\s*margin-left: calc\(1\.6rem \+ 14px\);/.test(css), "calendar title uses margin, box clears dots");
assert.ok(/\.tower-sticker--avatar \.tower-avatar-resize,\s*\[data-tower-app\]\[data-tower-is-owner="true"\] \.tower-sticker--identity \.tower-name-resize \{\s*opacity: 0;/.test(css), "resize squares hidden at rest");
assert.ok(/\.tower-sticker--avatar:is\(:hover, :focus-within, \.is-widget-selected\) \.tower-avatar-resize/.test(css), "avatar resize still reachable");
assert.ok(/\.tower-sticker--identity:is\(:hover, :focus-within, \.is-widget-selected\) \.tower-name-resize/.test(css), "name resize still reachable");
assert.ok(/class="tower-avatar-resize"/.test(fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8")), "control not deleted");
console.log("postlive149 ok");
