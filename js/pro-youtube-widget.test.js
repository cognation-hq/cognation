/**
 * Professional page: YouTube is its own widget (split from Music), Music is
 * off on Professional, Personal keeps Music. Look of .tower-pro-youtube unchanged.
 * Run: node js/pro-youtube-widget.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html");
var tower = src("js/tower.js");
var css = src("css/styles.css");

function widgetHtml(id) {
  var start = html.indexOf('data-tower-widget="' + id + '"');
  assert.ok(start !== -1, id + " widget in markup");
  var open = html.lastIndexOf("<div", start);
  var depth = 0, re = /<div\b|<\/div>/g, m;
  re.lastIndex = open;
  while ((m = re.exec(html))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(open, re.lastIndex);
  }
  throw new Error("unclosed " + id);
}

/* Markup: the YouTube box moved out of Music into its own movable sticker. */
var yt = widgetHtml("youtube");
var music = widgetHtml("music");
var boxAt = html.indexOf("data-tower-pro-youtube ");
var lastWidget = html.lastIndexOf("data-tower-widget=", boxAt);
assert.ok(html.slice(lastWidget, lastWidget + 27) === 'data-tower-widget="youtube"', "YouTube box sits in the YouTube widget, not Music");
assert.ok(!/data-tower-pro-youtube/.test(music.replace(yt, "")), "Music no longer holds the YouTube box");
assert.ok(/class="tower-sticker tower-sticker--youtube"/.test(yt), "YouTube sticker");
assert.ok(/data-tower-sticker-handle[^>]*aria-label="Move YouTube sticker"/.test(yt), "YouTube is movable");
assert.ok(/<div class="tower-pro-youtube" data-tower-pro-youtube hidden>\s*<div class="tower-pro-youtube-screen" data-tower-pro-youtube-frame><\/div>/.test(yt), "same YouTube box inside");
assert.ok(/data-tower-pro-youtube-url/.test(yt) && /class="tower-music-owner tower-pro-youtube-owner"/.test(yt), "owner link field (owner-only styling reused)");
assert.strictEqual((html.match(/data-tower-pro-youtube-frame/g) || []).length, 1, "one YouTube screen");

/* Look unchanged: screen rules intact; shown via the sticker, not the music skin. */
assert.ok(/\.tower-pro-youtube \{\s*width: 18\.5rem;\s*max-width: 100%;/.test(css), "box width unchanged");
assert.ok(/\.tower-pro-youtube-screen \{[\s\S]*?aspect-ratio: 16 \/ 9;[\s\S]*?background: rgba\(5, 8, 28, 0\.55\);/.test(css), "screen unchanged");
assert.ok(/\.tower-sticker--youtube:not\(\[hidden\]\) \.tower-pro-youtube \{\s*display: block !important;/.test(css), "box shows in its sticker");

/* Same sticker chrome as the Music sticker it came from. */
var musicSel = (css.match(/\.tower-sticker--music[,{ ]/g) || []).length;
var ytSel = (css.match(/\.tower-sticker--youtube[,{ ]/g) || []).length;
assert.ok(ytSel >= 5 && musicSel >= 5, "YouTube sticker shares Music sticker chrome");

/* Behavior: Professional hides Music and shows YouTube; Personal does the opposite. */
var pro = tower.slice(tower.indexOf("    if (!personal) {\n      /* No music player on Professional"), tower.indexOf("    showYoutubeSticker(root, false);"));
assert.ok(pro.length > 0, "professional branch found");
assert.ok(/showMusicSticker\(root, false\)/.test(pro) && /wrap\.hidden = true/.test(pro), "Professional: no music player");
assert.ok(/showYoutubeSticker\(root, true\)/.test(pro), "Professional: YouTube widget shown");
assert.ok(/ensureProYoutubeIframe\(root, ytId, proProfileId\)/.test(pro) && /showEmptyProYoutube\(root, proProfileId\)/.test(pro), "video or empty box (for the viewed profile)");
assert.ok(/if \(!personalMusic\) \{\s*\/\*[^*]*\*\/\s*on = false;/.test(tower), "public widgets: music off on Professional");
assert.ok(/showYoutubeSticker\(root, !!p && p\._profileKind === "professional"\)/.test(tower), "public widgets: YouTube only on Professional");
assert.ok(/function bindProYoutubeUrl[\s\S]*?isTowerOwner\(cur\) \|\| !profileIsProfessional\(cur\)/.test(tower), "link field: owner + Professional only");

/* Layout: own saved spot; existing Professional pages keep Music's old spot (no migration). */
assert.ok(/youtube: \{ x: 2, y: 28, z: 6, tilt: 0 \}/.test(tower), "default YouTube spot");
assert.ok(/if \(id === "youtube" && !layout\.youtube && isPlacedPos\(layout, "music"\)\) pos = layout\.music;/.test(tower), "inherits saved Music spot");

/* Calendar stays on both pages; going-live stays out of public widgets. */
assert.ok(/if \(id === "calendar"\) on = true;/.test(tower), "calendar stays");
assert.ok(!/PUBLIC_WIDGET_IDS = \[[^\]]*going-live/.test(tower), "going-live not public");

console.log("pro-youtube-widget.test.js: ok");
