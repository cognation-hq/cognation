/**
 * Still here: fails if a locked feature quietly goes missing.
 * Covers PULSE falling friends, electric lines, halo circles, Tower widgets,
 * News comments + Report, Feed comments, Report/Block, Investigator.
 * Run: node js/still-here.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html"), tower = src("js/tower.js"), css = src("css/styles.css");

/* PULSE falling friends: mounted on open, before the early return */
var start = tower.slice(tower.indexOf("function startCircleFall()"));
var firstReturn = start.indexOf("    return;\n");
assert.ok(firstReturn > 0 && start.slice(0, firstReturn).indexOf("CognationPulseFall.mount(layer") > 0, "falling friends mount on PULSE open");
assert.ok(html.indexOf('src="js/pulse-falling-friends.js"') > 0, "falling friends script loaded");
var pulse = require("./pulse-falling-friends.js");
assert.strictEqual(pulse.cap, 6000, "falling friends cap 6,000");

/* Electric lines: old color, crackle, brightness */
var lightning = tower.slice(tower.indexOf("function paintCircleLightning"), tower.indexOf("var CIRCLE_REFRESH_MS"));
assert.ok(/data-circle-lightning/.test(lightning), "electric lines canvas");
assert.ok(/blur\(14px\)/.test(lightning) && /"lighter"/.test(lightning), "electric glow brightness");
assert.ok(/0\.06 \* flicker/.test(lightning) && /Math\.sin\(i \* 1\.35\)/.test(lightning), "crackle flicker");
assert.ok(/r: Math\.round\(176 \* purple \+ 70 \* blue \+ 255 \* pink\)/.test(tower), "old purple/blue/pink color");
assert.ok(start.slice(0, firstReturn).indexOf("paintCircleRingShell(layer") > 0, "ring + lightning painted on open");

/* Halo circles: in front, visual only */
assert.ok(/CIRCLE_SPOTS\s*=\s*\[/.test(tower) && /\.circle-spot\.is-empty/.test(css), "halo circles");
assert.ok(/\.circle-ring\s*\{[^}]*z-index:\s*2/.test(css), "halo in front");
assert.ok(/\.pulse-fall-stack\s*\{[^}]*z-index:\s*1/.test(css), "friends behind");

/* Tower widgets */
["avatar", "identity", "slogan", "social", "music", "youtube", "badges", "friends", "calendar", "followers", "polaroid", "html", "instax"].forEach(function (w) {
  assert.ok(html.indexOf('data-tower-widget="' + w + '"') > 0, "Tower widget " + w);
});

/* News comments + Report, Feed comments */
var news = src("js/news-comments.js");
assert.ok(/data-news-comment-report/.test(news) && />Report</.test(news), "News comment Report button");
assert.ok(html.indexOf("js/news-comments.js") > 0, "News comments loaded");
assert.ok(fs.existsSync(path.join(root, "js/feed-post-comments.test.js")), "Feed comments covered");

/* Moderation surfaces */
assert.ok(fs.existsSync(path.join(root, "investigator.html")), "Investigator page");
assert.ok(/Block/.test(src("js/block.js")), "Block");

/* PULSE tab label */
assert.ok(/data-tower-anchor="circle">PULSE</.test(html), "PULSE tab");

console.log("still-here.test.js: OK");
