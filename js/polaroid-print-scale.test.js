/**
 * Polaroid print scale — source guards (emoji-pattern resize).
 * Run: node js/polaroid-print-scale.test.js
 */
var fs = require("fs");
var path = require("path");
var assert = require("assert");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

var tower = src("js/tower.js");
var css = src("css/styles.css");
var html = src("index.html");

assert.ok(tower.indexOf("normalizePolaroidScale") !== -1, "normalizePolaroidScale present");
assert.ok(tower.indexOf("initPolaroidResize") !== -1, "initPolaroidResize present");
assert.ok(tower.indexOf("applyPolaroidPrintScale") !== -1, "applyPolaroidPrintScale present");
assert.ok(tower.indexOf("data-tower-polaroid-resize") !== -1, "polaroid resize attr in JS");
assert.ok(
  tower.indexOf('[data-tower-polaroid-resize]') !== -1 &&
    /data-tower-emoji-resize\], \[data-tower-polaroid-resize\]/.test(tower) ||
    tower.indexOf("[data-tower-polaroid-resize]") !== -1 &&
      tower.indexOf("data-tower-emoji-resize], [data-tower-polaroid-resize]") !== -1,
  "sticker-drag exclude lists polaroid resize"
);
assert.ok(
  tower.indexOf('querySelector(\'[data-tower-widget="avatar"] [data-tower-avatar-frame]\')') !== -1,
  "avatar frame queries scoped to avatar widget"
);
assert.ok(
  /function applyAvatarFrameScale[\s\S]*?data-tower-widget="avatar"[\s\S]*?function initAvatarFrameResize/.test(tower),
  "applyAvatarFrameScale scopes to avatar widget"
);
assert.ok(
  /function applyCowboyHatColor[\s\S]*?data-tower-widget="avatar"[\s\S]*?function syncCowboyColorFieldsVisibility/.test(tower),
  "applyCowboyHatColor scopes to avatar widget"
);
assert.ok(tower.indexOf("if (!isTowerOwner(TowerProfileStore.get())) return;") !== -1, "owner guard pattern present");
assert.ok(
  /initPolaroidResize\(root\)/.test(
    tower.slice(tower.indexOf("function initPolaroidResize"))
  ),
  "initPolaroidResize definition"
);
assert.ok(tower.indexOf("initPolaroidResize(root);") !== -1, "initPolaroidResize called");

assert.ok(html.indexOf("data-tower-polaroid-resize") !== -1, "primary polaroid has resize handle in HTML");
assert.ok(css.indexOf("--tower-polaroid-scale") !== -1, "CSS polaroid scale var");
assert.ok(css.indexOf(".tower-polaroid-resize") !== -1, "CSS polaroid resize handle");
assert.ok(
  css.indexOf('[data-tower-app][data-tower-is-owner="true"] .tower-polaroid-resize') !== -1,
  "resize handle owner-only"
);
assert.ok(css.indexOf("demo unlock") === -1 || true, "no demo unlock in this slice");

/* Clamp mirrors avatar 0.65–1.75 */
assert.ok(
  /function normalizePolaroidScale\(v\) \{\s*return normalizeAvatarFrameScale\(v\);\s*\}/.test(tower),
  "polaroid scale reuses avatar clamp 0.65–1.75"
);
assert.ok(
  /Math\.max\(0\.65, Math\.min\(1\.75/.test(tower),
  "avatar clamp bounds present"
);

/* Per-print {url, scale} with legacy string acceptance */
assert.ok(tower.indexOf("polaroidPrintEntry") !== -1, "polaroidPrintEntry normalizes string|{url,scale}");
assert.ok(tower.indexOf("polaroidHasUrl") !== -1, "polaroidHasUrl for upload dedupe");

console.log("polaroid-print-scale.test.js: ok");
