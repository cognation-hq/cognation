/**
 * Profile status banners are popups, not brown boxes in the page.
 * Run: node js/status-popup.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

assert.ok(/function showStatusPopup\(msg, isError, opts\)/.test(tower), "popup helper");
assert.ok(/data-status-popup-undo/.test(tower) && /textContent = "Undo"/.test(tower), "Undo button on the notice");
assert.ok(/__cognationUndoWidget = undoLastWidgetRemoval/.test(tower), "Undo calls the restore stack");
assert.ok(/root\.__cognationBadgesShelfRemoved = !on/.test(tower) && /__cognationBadgesShelfRemoved\) on = false/.test(tower), "removed badges shelf stays off until Undo");
assert.ok(/offerUndo \? 7000 : 5000/.test(tower), "popup dismisses on its own");
assert.ok(/showStatusPopup\("Your professional page is set up\.", false, \{ once: true \}\)/.test(tower), "setup notice is a popup");
assert.ok(/function setProfileStatusOn\(root, msg, isError\) \{\s*showStatusPopup\(msg, isError\);/.test(tower), "profile status uses the popup");
assert.ok(/function setProfileStatusSafe\(msg, isError, removal\) \{\s*if \(removal\) showStageRemovalNotice\(root, msg\);\s*showStatusPopup\(msg, isError\);/.test(tower), "removal notice uses the popup and the stage notice");
var sync = tower.slice(tower.indexOf("function syncAddProfileUi"), tower.indexOf("function initAddProfile"));
assert.ok(!/status\.hidden = false/.test(sync), "setup status does not unhide a box in the page");
assert.ok(/\[data-tower-profile-status\],\s*\[data-tower-add-profile-status\] \{\s*display: none !important;/.test(css), "inline status boxes stay off the page");
assert.ok(/\.status-popup-host \{\s*position: fixed;/.test(css), "popup is fixed over the page");
console.log("status-popup.test.js: ok");
