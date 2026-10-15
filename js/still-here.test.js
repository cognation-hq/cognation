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


/* Electric lines actually render: run the real draw code against a recording
   canvas/SVG and require visible output, not just an element. */
function extractFn(name) {
  var i = tower.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " exists");
  var j = tower.indexOf("{", i), depth = 0, k;
  for (k = j; k < tower.length; k++) {
    if (tower[k] === "{") depth++;
    else if (tower[k] === "}" && --depth === 0) break;
  }
  return tower.slice(i, k + 1);
}
function constVal(name) { var m = new RegExp("var " + name + " = ([^;]+);").exec(tower); assert.ok(m, name); return m[1]; }
var draw = { fills: 0, maxAlpha: 0, paths: [] };
function node(tag) {
  return {
    tag: tag, attrs: {}, children: [],
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    appendChild: function (c) { this.children.push(c); if (c.tag === "path") draw.paths.push(c); return c; },
    getContext: function () {
      return {
        clearRect: function () {}, beginPath: function () {}, arc: function () {},
        fill: function () { draw.fills++; },
        createRadialGradient: function () {
          return { addColorStop: function (o, c) { var a = parseFloat(String(c).split(",")[3]); if (a > draw.maxAlpha) draw.maxAlpha = a; } };
        },
      };
    },
  };
}
var fakeDoc = { createElement: node, createElementNS: function (ns, t) { return node(t); } };
var code = ["CIRCLE_TILT", "CIRCLE_RING_R", "CIRCLE_PERSPECTIVE", "CIRCLE_SCALE"].map(function (n) { return "var " + n + " = " + constVal(n) + ";"; }).join("\n") +
  ["circleProjectRadius", "circleGlowColor", "circleBoltSegments", "circleBranchPath", "paintCircleBolt", "paintCircleLightning"].map(extractFn).join("\n") +
  "\nreturn paintCircleLightning;";
var paint = new Function("document", code)(fakeDoc);
var ringNode = node("div");
paint(ringNode);
assert.ok(draw.fills > 100, "glow canvas draws");
assert.ok(ringNode.children.some(function (c) { return c.attrs["data-circle-lightning"] !== undefined; }), "lightning canvas attached");
var bolt = ringNode.children.filter(function (c) { return c.attrs["data-circle-bolt"] !== undefined; })[0];
assert.ok(bolt, "lightning bolt SVG attached");
var strokes = draw.paths.filter(function (pth) { return parseFloat(pth.attrs.opacity) >= 0.5 && parseFloat(pth.attrs["stroke-width"]) > 0.5; });
assert.ok(strokes.length >= 50, "bolt has visible strokes (" + strokes.length + ")");
["#b44bff", "#3ecbff", "#ff4ad8", "#e9f7ff"].forEach(function (c) {
  assert.ok(draw.paths.some(function (pth) { return pth.attrs.stroke === c; }), "old bolt color " + c);
});
assert.ok(!/\.circle-lightning\s*\{[^}]*(display:\s*none|opacity:\s*0[;\s]|visibility:\s*hidden)/.test(css), "lightning not hidden by CSS");
assert.ok(/svg\.circle-bolt\s*\{[^}]*opacity:\s*1/.test(css) && /pulse-bolt-crackle/.test(css), "bolt visible with crackle");

console.log("still-here.test.js: OK");
