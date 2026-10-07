/**
 * Cap 250 — SIGNAL News|Feed pipe-switch chrome lock.
 * Run: node js/cap250-signal-newsfeed-pipe.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

var css = src("css/styles.css");
var html = src("index.html");
var nav = src("js/signal-nav.js");

assert.ok(/data-signal-subtabs/.test(html), "SIGNAL subtabs shell present");
assert.ok(/site-switch/.test(html) && /signal-subtabs site-switch/.test(html), "reuses site-switch pipe component class");
assert.ok(/site-switch-side/.test(html) && /site-switch-sep/.test(html), "reuses site-switch side + sep classes");
assert.ok(/data-signal-pane-btn="news"/.test(html) && /data-signal-pane-btn="feed"/.test(html), "News|Feed panes wired");

/* Dark shell tokens from Personal|Professional (.tower-profile-kind-toggle) */
assert.ok(/\.signal-subtabs\s*\{[\s\S]*?background:\s*rgba\(16,\s*19,\s*48,\s*0\.32\)/.test(css), "dark shell bg");
assert.ok(/\.signal-subtabs\s*\{[\s\S]*?border-radius:\s*999px/.test(css), "pill radius");
assert.ok(/\.signal-subtabs\s*\{[\s\S]*?padding:\s*0\.25rem/.test(css), "same shell padding as kind toggle");

/* Active lilac ombre — same stops as Designer topbar / COGNATION|WAYMAKERS lock */
assert.ok(
  /\.signal-subtab\.is-selected[\s\S]*?rgba\(232,\s*214,\s*245,\s*0\.98\)[\s\S]*?rgba\(244,\s*220,\s*238,\s*0\.97\)[\s\S]*?rgba\(255,\s*220,\s*232,\s*0\.96\)/.test(css),
  "lilac ombre on active side"
);

/* Mute inactive + kind-btn height/spacing */
assert.ok(/\.signal-subtab\s*\{[\s\S]*?rgba\(247,\s*249,\s*255,\s*0\.7\)/.test(css), "mute inactive");
assert.ok(/\.signal-subtab\s*\{[\s\S]*?padding:\s*0\.4rem\s*0\.95rem/.test(css), "same height/padding as .tower-kind-btn");
assert.ok(/text-transform:\s*uppercase/.test(css.match(/\.signal-subtab\s*\{[\s\S]*?\}\n\.signal-subtab:hover/)[0]), "Oswald pipe uppercase");

assert.ok(/classList\.toggle\("is-active", on\)/.test(nav), "keeps site-switch-side.is-active in sync");

/* Must not keep the old full-strip lilac chrome as the shell */
var shell = css.match(/\.signal-subtabs\s*\{[\s\S]*?\n\}/)[0];
assert.ok(!/linear-gradient/.test(shell), "shell itself is dark, not full lilac strip");

console.log("cap250-signal-newsfeed-pipe.test.js: OK");
