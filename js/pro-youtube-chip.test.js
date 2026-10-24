/**
 * Pro page: the YouTube video box does not also make a YouTube logo chip.
 * Alexa (Oct 21): a lone red YouTube logo sat under the Pro YouTube video and
 * could not be removed, because chipSocialLinks rebuilt it from musicUrl.
 * Run: node js/pro-youtube-chip.test.js
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
  var open = tower.indexOf("{", start);
  var depth = 0;
  for (var i = open; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}") {
      depth--;
      if (depth === 0) return tower.slice(start, i + 1);
    }
  }
  throw new Error("unterminated " + name);
}

var nets = ["youtube", "x", "facebook", "instagram", "tiktok"];
function run(p, personalLinks) {
  var ctx = {
    window: {
      CognationAccounts: {
        getProfileById: function () { return { accountUsername: "riley" }; },
        getProfilesForUsername: function () {
          return personalLinks ? [{ kind: "personal", socialLinks: personalLinks }] : [];
        },
      },
    },
    socialLinkDefs: function () { return nets.map(function (id) { return { id: id }; }); },
    looksLikeYoutubeUrl: function (u) { return /youtube\.com|youtu\.be/.test(String(u)); },
    isTowerOwner: function () { return true; },
    getSessionObject: function () { return { username: "riley" }; },
  };
  vm.createContext(ctx);
  vm.runInContext(sliceFn("chipSocialLinks") + "; this.chipSocialLinks = chipSocialLinks;", ctx);
  return ctx.chipSocialLinks(p);
}

var YT = "https://www.youtube.com/watch?v=abc123";

// Pro with only a YouTube video saved: no YouTube chip.
var out = run({ _profileId: "p1", _profileKind: "professional", socialLinks: {}, musicUrl: YT }, null);
assert.strictEqual(out.youtube, "", "Pro YouTube video box does not make a YouTube logo chip");

// Pro with a real linked YouTube (own): chip stays.
out = run({ _profileId: "p1", _profileKind: "professional", socialLinks: { youtube: "https://youtube.com/@samira" }, musicUrl: YT }, null);
assert.strictEqual(out.youtube, "https://youtube.com/@samira", "a linked YouTube still gets its own chip on Pro");

// Pro still shows the Personal profile's linked socials (unchanged).
out = run({ _profileId: "p1", _profileKind: "professional", socialLinks: {}, musicUrl: YT }, { x: "https://x.com/riley", youtube: "https://youtube.com/@riley" });
assert.strictEqual(out.x, "https://x.com/riley", "Pro keeps Personal X chip");
assert.strictEqual(out.youtube, "https://youtube.com/@riley", "Pro keeps Personal linked YouTube chip");

// Personal unchanged: own links only, musicUrl never made a chip there.
out = run({ _profileId: "p2", _profileKind: "personal", socialLinks: { x: "https://x.com/a" }, musicUrl: YT }, null);
assert.strictEqual(out.x, "https://x.com/a");
assert.ok(!out.youtube, "Personal never had a musicUrl chip");

// The Pro spawn still has the YouTube video widget.
assert.ok(/professional:\s*\[[^\n]*\["youtube"\]/.test(tower), "Pro spawn keeps the YouTube video widget");

console.log("pro-youtube-chip tests passed");
