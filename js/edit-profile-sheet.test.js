/**
 * Edit profile opens as a panel (website) / bottom sheet (phone) outside the
 * avatar widget: the widget keeps its size and spot and covers nothing.
 * Run: node js/edit-profile-sheet.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");

var fn = tower.slice(tower.indexOf("function initProfileEditDropdown"), tower.indexOf("function initFramePicker"));
assert.ok(/function mountPanelAsSheet\(\) \{\s*showScrim\(true\);\s*if \(panel\.parentNode !== root\) root\.appendChild\(panel\);\s*panel\.classList\.add\("is-sheet"\);/.test(fn), "open moves the editor out of the widget");
assert.ok(/if \(open\) \{\s*mountPanelAsSheet\(\);\s*panel\.hidden = false;/.test(fn), "mounted before showing");
assert.ok(/panel\.hidden = true;\s*returnPanelHome\(\);/.test(fn), "returned to the widget on close");
assert.ok(/data-tower-profile-edit-close/.test(fn) && /data-tower-profile-edit-close/.test(html), "sheet has a close button");

/* Fixed panel (website) and full-width bottom sheet (phone, <768px). */
assert.ok(/\.tower-profile-edit-dropdown\.is-sheet \{\s*position: fixed !important;[\s\S]*?right: 1rem;[\s\S]*?transform: none !important;/.test(css), "website side panel");
assert.ok(/@media \(max-width: 767px\) \{\s*#panel-tower \.tower-profile-edit-dropdown\.is-sheet \{\s*top: auto;\s*left: 0;\s*right: 0;\s*bottom: 0;\s*width: 100% !important;/.test(css), "phone bottom sheet");

/* The widget itself is never resized for edit mode. */
var editOpen = css.match(/\.tower-sticker--avatar\.is-edit-open \{([^}]*)\}/g) || [];
editOpen.forEach(function (rule) {
  assert.ok(!/width|height|padding|scale/.test(rule), "is-edit-open does not resize the widget: " + rule);
});
/* Designer look check: dark panel, muted labels, hidden social rows fully hidden,
   one-line Save buttons, phone scrim + 85% sheet with pinned header. */
assert.ok(/\.tower-profile-edit-dropdown\.tower-profile-edit-dropdown \{\s*background: rgba\(16, 19, 48, 0\.97\) !important;/.test(css), "dark panel");
assert.ok(/\.tower-social-fields label, \.tower-social-fields-label, \.tower-frame-fields-label\) \{\s*color: var\(--cgn-text-muted/.test(css), "muted labels");
assert.ok(/\.tower-social-fields :is\(label, input\)\[hidden\] \{\s*display: none !important;/.test(css), "label hides with its input (no orphan LinkedIn/Linktree labels)");
assert.ok(/:is\(\.btn, \.tower-social-actions \.btn-primary\) \{\s*white-space: nowrap;/.test(css), "Save buttons stay on one line");
assert.ok(/\.tower-profile-edit-scrim:not\(\[hidden\]\) \{\s*display: block;\s*position: fixed;\s*inset: 0;/.test(css), "phone scrim");
assert.ok(/\.is-sheet \{\s*max-height: 85vh !important;/.test(css), "sheet capped at 85vh");
assert.ok(/\.is-sheet \.tower-profile-edit-sheet-head \{\s*top: 0;/.test(css) && /position: sticky;/.test(css), "header pinned");
assert.ok(/function mountPanelAsSheet\(\) \{\s*showScrim\(true\);/.test(fn) && /function returnPanelHome\(\) \{\s*showScrim\(false\);/.test(fn), "scrim follows open/close");
assert.ok(/scrim\.addEventListener\("click", function \(\) \{\s*setOpen\(false\);/.test(fn), "tap scrim closes");
var labelHide = tower.slice(tower.indexOf("function renderSocialLinks"), tower.indexOf("function renderSocialLinks") + 1200);
assert.ok(/formInput\.hidden = true;\s*if \(label\) label\.hidden = true;/.test(labelHide), "per-page networks hide label + input together");
console.log("edit-profile-sheet.test.js: ok");
assert.ok(/\.is-sheet \.tower-social-actions \{\s*grid-column: 1 \/ -1;\s*justify-self: stretch;\s*width: 100% !important;\s*justify-content: flex-start !important;/.test(css), "phone: Save profile aligns with the sheet\'s left padding");
