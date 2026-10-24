/**
 * Remove keeps the page scroll at every width (follow-up to #250).
 * SeedOps saw 1017 -> 364 at 1280 on live; the hold itself has no breakpoint.
 * This locks that in: the same save/hold/restore runs at 1280 as at 390, and
 * every Remove path (button, Backspace/Delete, root hook) goes through it.
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function blockIn(src, start) {
  var depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}
function fnSrc(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  return blockIn(tower, start);
}

/* No breakpoint anywhere in the hold. */
["holdTowerScroll", "keepTowerScrollAround"].forEach(function (name) {
  var src = fnSrc(name);
  assert.ok(!/matchMedia|innerWidth|clientWidth|stageNoticeNarrow|isPhoneStage|767|768/.test(src), name + ": no width check");
});
var rmStart = tower.indexOf("var removeSelectedKeepingScroll = function () {");
assert.ok(rmStart > 0);
var rmFn = blockIn(tower, rmStart);
assert.ok(/keepTowerScrollAround\(root, removeSelectedWidget\);/.test(rmFn) && !/matchMedia|innerWidth|Narrow/.test(rmFn), "Remove wraps the hold at every width");

function scrollCtx(opts) {
  var c = { calls: [], raf: [] };
  vm.createContext(c);
  c.stage = { style: { minHeight: "" }, getBoundingClientRect: function () { return { height: opts.stageH }; } };
  c.state = { y: opts.y, h: opts.h };
  vm.runInContext([
    "var window = { innerWidth: " + opts.vw + ", innerHeight: " + opts.vh + ", pageXOffset: 0, get pageYOffset() { return state.y; },",
    "  matchMedia: function () { throw new Error('no breakpoint in the hold'); },",
    "  scrollTo: function (o) { calls.push(o); state.y = o.top; } };",
    "var document = { documentElement: { get scrollHeight() { return state.h; } } };",
    "function requestAnimationFrame(fn) { raf.push(fn); }",
    fnSrc("holdTowerScroll"), fnSrc("keepTowerScrollAround"),
    "var root = { querySelector: function (q) { return q === '[data-tower-scrapbook]' ? stage : null; } };",
  ].join("\n"), c);
  return c;
}

/* 1280 x 900, the SeedOps case: stage 924 -> 733 (Music gone), page 1922 -> 1731,
   scrollY 1017 would clamp to 831. Held at 1017 with exactly the missing 186px. */
var s = scrollCtx({ vw: 1280, vh: 900, y: 1017, h: 1922, stageH: 733 });
s.keepTowerScrollAround(s.root, function () { s.state.h = 1731; s.state.y = 831; });
assert.strictEqual(s.stage.style.minHeight, Math.ceil(733 + (1017 + 900 - 1731)) + "px", "1280: stage holds just the missing height");
assert.deepStrictEqual(JSON.parse(JSON.stringify(s.calls)), [{ left: 0, top: 1017, behavior: "instant" }], "1280: scrollY restored instantly");
s.raf.forEach(function (f) { f(); });
assert.strictEqual(s.state.y, 1017);
assert.strictEqual(s.calls.length, 1, "1280: no second scroll");

/* 1280, far from the page bottom: no hold, no scroll call. */
s = scrollCtx({ vw: 1280, vh: 900, y: 300, h: 1922, stageH: 733 });
s.keepTowerScrollAround(s.root, function () { s.state.h = 1731; });
assert.strictEqual(s.stage.style.minHeight, "");
assert.strictEqual(s.calls.length, 0);

/* Same numbers give the same result at 390 and 1280 (width never read). */
function run(vw) {
  var c = scrollCtx({ vw: vw, vh: 844, y: 833, h: 1677, stageH: 520 });
  c.keepTowerScrollAround(c.root, function () { c.state.h = 1491; c.state.y = 647; });
  return [c.stage.style.minHeight, c.state.y, c.calls.length];
}
assert.deepStrictEqual(run(1280), run(390), "identical hold at 1280 and 390");
assert.deepStrictEqual(run(768), run(767), "identical either side of 768");

/* A late clamp (one frame later) is undone at 1280 too; a scroll the viewer makes is not. */
s = scrollCtx({ vw: 1280, vh: 900, y: 1017, h: 1922, stageH: 924 });
s.keepTowerScrollAround(s.root, function () {});
s.state.h = 1731; s.state.y = 831;
s.raf.forEach(function (f) { f(); });
assert.strictEqual(s.state.y, 1017, "1280: late clamp undone");
s = scrollCtx({ vw: 1280, vh: 900, y: 400, h: 1922, stageH: 924 });
s.keepTowerScrollAround(s.root, function () {});
s.state.y = 900;
s.raf.forEach(function (f) { f(); });
assert.strictEqual(s.calls.length, 0, "1280: viewer's own scroll kept");

console.log("remove-scroll-hold-all-widths: ok");
