/**
 * Pro YouTube box resets between Pro pages (SeedOps live check, Oct 22):
 * opening Pro page A (has a video) and then Pro page B (no video) left A's
 * iframe in B's box. B must show an empty box; A's own video still survives a
 * later blank read of A (#24).
 * Run: node js/pro-video-reset.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");

function sliceFn(name) {
  var start = tower.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name + " present");
  var depth = 0;
  for (var i = tower.indexOf("{", start); i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) return tower.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

/* Just enough DOM for the two Pro box helpers. */
function El(tag) {
  this.tagName = tag;
  this.attrs = {};
  this.children = [];
  this.hidden = true;
  var cls = {};
  this.classList = {
    add: function (c) { cls[c] = 1; },
    remove: function (c) { delete cls[c]; },
    contains: function (c) { return !!cls[c]; },
  };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.querySelector = function (sel) {
  if (sel === "iframe") return this.children.filter(function (c) { return c.tagName === "iframe"; })[0] || null;
  return null;
};
Object.defineProperty(El.prototype, "innerHTML", { set: function () { this.children = []; }, get: function () { return ""; } });

var box = new El("div");
var frame = new El("div");
var root = {
  querySelector: function (sel) {
    if (sel === "[data-tower-pro-youtube]") return box;
    if (sel === "[data-tower-pro-youtube-frame]") return frame;
    return null;
  },
};
var ctx = {
  document: { createElement: function (t) { return new El(t); } },
  youtubeEmbedSrc: function (id) { return "https://www.youtube-nocookie.com/embed/" + id; },
};
vm.createContext(ctx);
vm.runInContext(sliceFn("showEmptyProYoutube") + "\n" + sliceFn("ensureProYoutubeIframe") +
  "; this.showEmpty = showEmptyProYoutube; this.ensure = ensureProYoutubeIframe;", ctx);

var A = "dddddddd-4444-4444-8444-444444444444";
var B = "eeeeeeee-5555-4555-8555-555555555555";

// A has a video.
ctx.ensure(root, "iT-ozlJGiE0", A);
assert.ok(box.classList.contains("has-video"), "A shows its video");
assert.strictEqual(frame.querySelector("iframe").getAttribute("data-yt-id"), "iT-ozlJGiE0");

// A blank read of A itself keeps A's video (#24).
ctx.showEmpty(root, A);
assert.ok(frame.querySelector("iframe"), "A keeps its own video through a blank read");

// Navigate to B, which has no video: the box is empty.
ctx.showEmpty(root, B);
assert.strictEqual(frame.querySelector("iframe"), null, "B does not show A's video");
assert.ok(!box.classList.contains("has-video"), "B's box is the empty box");
assert.ok(!box.hidden, "B's empty box is still shown");

// Back to A: its video comes back.
ctx.ensure(root, "iT-ozlJGiE0", A);
assert.strictEqual(frame.querySelector("iframe").getAttribute("data-yt-id"), "iT-ozlJGiE0", "A shows its video again");

// No profile id: the box never keeps an old video.
ctx.showEmpty(root, "");
assert.strictEqual(frame.querySelector("iframe"), null, "unknown profile clears the old video");

// The Pro render path passes the viewed profile id to both helpers.
assert.ok(/ensureProYoutubeIframe\(root, ytId, proProfileId\)/.test(tower));
assert.ok(/showEmptyProYoutube\(root, proProfileId\)/.test(tower));
console.log("pro-video-reset tests passed");
