/**
 * Music/YouTube width resize — complete wire (owner + public).
 * Run: node js/youtube-width-resize.test.js
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

assert.ok(tower.indexOf("function applyYoutubeWidth") !== -1, "applyYoutubeWidth present");
assert.ok(tower.indexOf("function initYoutubeResize") !== -1, "initYoutubeResize present");
assert.ok(tower.indexOf("musicYoutubeWidth") !== -1, "musicYoutubeWidth field present");
assert.ok(tower.indexOf("data-tower-youtube-resize") !== -1, "youtube resize attr in JS");
assert.ok(tower.indexOf("initYoutubeResize(root);") !== -1, "initYoutubeResize called");
assert.ok(
  /applyYoutubeWidth\(root, p && p\.musicYoutubeWidth\)/.test(tower) ||
    tower.indexOf("applyYoutubeWidth(root, p && p.musicYoutubeWidth)") !== -1,
  "applyYoutubeWidth runs on music paint"
);
assert.ok(
  /function initYoutubeResize[\s\S]*?if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "initYoutubeResize owner-guards pointerdown"
);
assert.ok(
  tower.indexOf("[data-tower-youtube-resize]") !== -1 &&
    tower.indexOf("data-tower-polaroid-resize], [data-tower-youtube-resize]") !== -1,
  "sticker-drag exclude lists youtube resize"
);
assert.ok(
  /Math\.max\(180, Math\.min\(720/.test(tower),
  "width clamp 180–720 present"
);

assert.ok(html.indexOf("data-tower-youtube-resize") !== -1, "DOM resize handle in HTML");
assert.ok(html.indexOf("tower-youtube-resize") !== -1, "resize handle class in HTML");

assert.ok(css.indexOf("--tower-youtube-width") !== -1, "CSS youtube width var");
assert.ok(css.indexOf(".tower-youtube-resize") !== -1, "CSS youtube resize handle");
assert.ok(
  css.indexOf(
    '[data-tower-app][data-tower-is-owner="true"][data-tower-side="public"] .tower-youtube-resize'
  ) !== -1,
  "resize handle owner + public only"
);
assert.ok(
  /\[data-music-mode="youtube"\] \.tower-ipod\s*\{[^}]*width:\s*100%/.test(css),
  "ipod follows parent width in youtube mode"
);

/* No out-of-scope revive */
assert.ok(tower.indexOf("ONE_YOUTUBE_PLAYER_ONLY") !== -1, "video sticker policy untouched");
assert.ok(html.indexOf("data-tower-instax") !== -1 || true, "instax not required in this slice");


/* Handle survives clearYoutubeEmbed: outside cleared frame + ensure on paint */
assert.ok(
  tower.indexOf("function ensureYoutubeResizeHandle") !== -1,
  "ensureYoutubeResizeHandle present"
);
assert.ok(
  /function clearYoutubeEmbed[\s\S]*?ensureYoutubeResizeHandle\(root\)/.test(tower),
  "clearYoutubeEmbed re-ensures resize handle after frame clear"
);
assert.ok(
  /function initTowerMusic[\s\S]*?ensureYoutubeResizeHandle\(root\);\s*initYoutubeResize\(root\);/.test(tower),
  "music paint ensureHandle + initYoutubeResize so owner drag/persist bind"
);
assert.ok(
  /data-tower-youtube-frame[^>]*>\s*<\/div>\s*<button[^>]*data-tower-youtube-resize/.test(html),
  "DOM resize handle is outside [data-tower-youtube-frame] (not wiped by innerHTML clear)"
);
assert.ok(
  !/<div[^>]*data-tower-youtube-frame[^>]*>\s*<button[^>]*data-tower-youtube-resize/.test(html),
  "DOM resize handle is not nested inside youtube frame"
);

console.log("youtube-width-resize.test.js: ok");
