/**
 * Feed photos (P1, Oct 21): a SIGNAL/TOWER Feed post shows its picture, not a
 * "PHOTO <file name>" pill.
 * - renderAttachments draws <img> for attachments[].dataUrl (data:image/...) or https URLs.
 * - Posts that saved only a file name keep the pill with "photo wasn't uploaded".
 * - Posting to Supabase shrinks every picture and saves it on the row (not only #market).
 * Run: node js/feed-photo.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function fnSource(src, name) {
  var start = src.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(start, i + 1);
}
var api = new Function(
  ["escapeHtml", "kindLabel", "attachmentImageUrl", "renderAttachments"].map(function (n) { return fnSource(tower, n); }).join("\n") +
  "\nreturn { render: renderAttachments, url: attachmentImageUrl };")();

var PNG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
var html = api.render([{ kind: "photo", label: "shoes.png", dataUrl: PNG }]);
assert.ok(html.indexOf('<img class="tower-attach-img" src="' + PNG + '"') > 0, "dataUrl photo -> <img>");
assert.ok(html.indexOf('alt="Photo: shoes.png"') > 0, "alt names the photo");
assert.ok(html.indexOf("tower-attach-kind") < 0, "no PHOTO pill when the picture is there");

html = api.render([{ kind: "photo", label: "x.jpg", url: "https://example.org/x.jpg" }]);
assert.ok(/<img [^>]*src="https:\/\/example\.org\/x\.jpg"/.test(html), "https URL -> <img>");

html = api.render([{ kind: "photo", label: "Screenshot 2026-10-02 at 1.06.57 PM.png", name: "Screenshot 2026-10-02 at 1.06.57 PM.png" }]);
assert.ok(html.indexOf("<img") < 0, "file name only: no image to draw");
assert.ok(html.indexOf("Screenshot 2026-10-02 at 1.06.57 PM.png") > 0 && html.indexOf("photo wasn't uploaded") > 0, "file name only: honest note");
assert.ok(html.indexOf("tower-attach--missing") > 0, "marked missing");

html = api.render([{ kind: "document", label: "notes.pdf" }]);
assert.ok(html.indexOf("<img") < 0 && html.indexOf("wasn't uploaded") < 0 && html.indexOf("notes.pdf") > 0, "documents stay a plain label");

["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "http://example.org/x.png", 'https://x.org/a.png" onerror="x', "data:image/svg+xml;base64,PHN2Zz4="].forEach(function (bad) {
  assert.strictEqual(api.url({ kind: "photo", dataUrl: bad }), "", "not drawn: " + bad);
});
assert.strictEqual(api.url({ kind: "removed", dataUrl: PNG }), "", "a removed (reported) image is never drawn");

var submit = tower.slice(tower.indexOf("var marketPost = /(^|[^a-z0-9])#market"), tower.indexOf("var savedPics = form.__pics"));
assert.ok(/if \(\(marketPost \|\| usingRemoteSocial\(\)\) && !form\.__marketReady\)/.test(submit), "Supabase posts shrink every picture, not only #market");
assert.ok(/if \(savedPics\[f\.name\]\) row\.dataUrl = savedPics\[f\.name\];/.test(tower), "shrunk picture rides on the attachment");
var social = fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8");
assert.ok(/if \(pic\.indexOf\("data:image\/"\) === 0 && pic\.length < 180000\) item\.dataUrl = pic;/.test(social), "createTowerPost saves the picture on the row");

var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
var block = css.slice(css.indexOf("/* Feed photos (P1, Oct 21)"), css.indexOf("/* TOWER Feed contrast (Designer follow-up)."));
assert.ok(/\.tower-attach-img \{[^}]*max-width: 100%;[^}]*border-radius: 12px;/.test(block), "fits the card, rounded");
assert.ok(!/#ed9300|yellow|amber|gold/i.test(block), "no yellow");
console.log("feed-photo.test.js ok");
