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
assert.ok(/function mountPanelAsSheet\(\) \{\s*if \(panel\.parentNode !== root\) root\.appendChild\(panel\);\s*panel\.classList\.add\("is-sheet"\);/.test(fn), "open moves the editor out of the widget");
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
console.log("edit-profile-sheet.test.js: ok");
