/**
 * Follow-up to #247 (SeedOps live check 2026-10-22):
 * 1. Below 768 the stage notice never blocks taps and does not sit over Mutual
 *    friends, Go live or the Messages envelope (top band when the bottom one would).
 * 2. Remove keeps the scroll position (the page used to clamp up when it got shorter).
 * 3. Show clears a stale "<Name> removed…" line in the Edit profile status box.
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
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

/* 1a. CSS: never blocks taps; top band; 768 and up untouched. */
var SEL = "#panel-tower \\[data-tower-app\\] > \\.tower-hidden-widget-notice\\.tower-stage-notice";
var narrowAt = css.indexOf("@media (max-width: 767.98px) {\n  #panel-tower [data-tower-app] > .tower-hidden-widget-notice.tower-stage-notice {");
assert.ok(narrowAt > 0, "narrow notice block");
var narrow = blockIn(css, narrowAt);
var base = new RegExp(SEL + " \\{([^}]*)\\}").exec(narrow);
assert.ok(base && /pointer-events: none !important/.test(base[1]), "notice: pointer-events none");
assert.ok(/position: fixed !important/.test(base[1]) && /max-width: calc\(100% - 32px\)/.test(base[1]) &&
  /transition: opacity 160ms ease, transform 160ms ease/.test(base[1]), "fixed, centered width cap, 160ms fade and slide kept");
var kids = new RegExp(SEL + " \\* \\{([^}]*)\\}").exec(narrow);
assert.ok(kids && /pointer-events: none !important/.test(kids[1]), "every child: pointer-events none");
var top = new RegExp(SEL + "\\.is-top \\{([^}]*)\\}").exec(narrow);
assert.ok(top && /top: var\(--tower-stage-notice-top/.test(top[1]) && /bottom: auto/.test(top[1]) && /translate\(-50%, -8px\)/.test(top[1]), "top band slides from above");
var topIn = new RegExp(SEL + "\\.is-top\\.is-in \\{([^}]*)\\}").exec(narrow);
assert.ok(topIn && /translate\(-50%, 0\)/.test(topIn[1]), "top band in state");
var rmAt = css.indexOf("@media (max-width: 767.98px) and (prefers-reduced-motion: reduce) {");
var rmTop = new RegExp(SEL + "\\.is-top \\{([^}]*)\\}").exec(blockIn(css, rmAt));
assert.ok(rmTop && /transform: translate\(-50%, 0\)/.test(rmTop[1]), "reduced motion: no slide in the top band either");
var desk = /\.tower-scrapbook-bar\.tower-scrapbook-bar \.tower-hidden-widget-notice\.tower-stage-notice \{([^}]*)\}/.exec(css.slice(0, narrowAt));
assert.ok(desk && !/position|pointer-events|is-top/.test(desk[1]), "768 and up unchanged");
assert.ok(!/#1c1630/i.test(narrow), "no #1c1630");

/* 1b. Band choice. */
function rect(t, b, l, r) { return { top: t, bottom: b, left: l || 150, right: r || 240, width: (r || 240) - (l || 150), height: b - t }; }
function mkNotice() {
  var cls = {}, props = {};
  return { classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } },
    style: { setProperty: function (k, v) { props[k] = v; }, removeProperty: function (k) { delete props[k]; } }, props: props,
    getBoundingClientRect: function () { return rect(0, 41, 37, 353); } };
}
var bctx = { tabs: null };
vm.createContext(bctx);
vm.runInContext([
  "var window = { innerHeight: 844 };",
  "var document = { querySelector: function (q) { return q === '.app-topbar' ? tabs : null; } };",
  tower.slice(tower.indexOf("var STAGE_NOTICE_EDGE"), tower.indexOf(";", tower.indexOf("var STAGE_NOTICE_EDGE")) + 1),
  tower.slice(tower.indexOf("var STAGE_NOTICE_CLEAR_SELECTORS"), tower.indexOf(";", tower.indexOf("var STAGE_NOTICE_CLEAR_SELECTORS")) + 1),
  fnSrc("stageNoticeBandsClash"), fnSrc("pickStageNoticeBand"),
].join("\n"), bctx);
function rootWith(map) {
  return { querySelectorAll: function (sel) {
    return (map[sel] || []).map(function (r) { return { hidden: false, closest: function () { return null; }, getBoundingClientRect: function () { return r; } }; });
  } };
}
/* SeedOps case: envelope / Go live / Mutual friends in the bottom band (390 x 844, scrollY 180). */
var controls = { "[data-tower-mutual-friends]": [rect(730, 751)], "[data-go-live]": [rect(754, 778)], "[data-tower-envelope]": [rect(783, 827)] };
bctx.tabs = { getBoundingClientRect: function () { return rect(244, 301, 16, 374); } };
var n = mkNotice();
assert.strictEqual(bctx.pickStageNoticeBand(rootWith(controls), n), "top", "controls under the bottom band: top band");
assert.ok(n.classList.contains("is-top"));
assert.strictEqual(n.props["--tower-stage-notice-top"], "309px", "just below the tab bar when it is on screen");
bctx.tabs = { getBoundingClientRect: function () { return rect(-76, -19, 16, 374); } };
n = mkNotice();
bctx.pickStageNoticeBand(rootWith(controls), n);
assert.strictEqual(n.props["--tower-stage-notice-top"], "16px", "tab bar scrolled away: 16px from the top");
/* Controls mid-screen: bottom band, as Designer set it. */
n = mkNotice();
n.classList.add("is-top");
assert.strictEqual(bctx.pickStageNoticeBand(rootWith({ "[data-tower-envelope]": [rect(463, 507)] }), n), "bottom");
assert.ok(!n.classList.contains("is-top") && !n.props["--tower-stage-notice-top"], "bottom band: no top class or offset");
/* Both bands covered (very short viewport): keep the bottom band; taps still pass through. */
n = mkNotice();
assert.strictEqual(bctx.pickStageNoticeBand(rootWith({ "[data-go-live]": [rect(10, 60)], "[data-tower-envelope]": [rect(790, 830)] }), n), "bottom");
/* Wiring: picked once as it shows (no jump on a replacement), narrow only; cleared when it goes back to the toolbar. */
var show = fnSrc("showStageRemovalNotice");
assert.ok(/if \(!wasShown && stageNoticeNarrow\(\)\) pickStageNoticeBand\(root, n\);/.test(show), "picked on show, below 768 only");
assert.ok(/!narrow && n\.classList[\s\S]*remove\("is-top"\)/.test(fnSrc("placeStageRemovalNotice")), "768 and up: no top class");

/* 2. Remove keeps the scroll position. */
function scrollCtx(opts) {
  var c = { calls: [], raf: [] };
  vm.createContext(c);
  c.stage = { style: { minHeight: "" }, getBoundingClientRect: function () { return { height: opts.stageH }; } };
  c.state = { y: opts.y, h: opts.h };
  vm.runInContext([
    "var window = { innerHeight: " + opts.vh + ", pageXOffset: 0, get pageYOffset() { return state.y; }, scrollTo: function (o) { calls.push(o); state.y = o.top; } };",
    "var document = { documentElement: { get scrollHeight() { return state.h; } } };",
    "function requestAnimationFrame(fn) { raf.push(fn); }",
    fnSrc("holdTowerScroll"), fnSrc("keepTowerScrollAround"),
    "var root = { querySelector: function (q) { return q === '[data-tower-scrapbook]' ? stage : null; } };",
  ].join("\n"), c);
  return c;
}
/* Near the page bottom: Music goes, the page is 186px shorter and the browser clamps 833 -> 647. */
var s = scrollCtx({ y: 833, h: 1677, vh: 844, stageH: 520 });
s.keepTowerScrollAround(s.root, function () { s.state.h = 1491; s.state.y = 647; });
assert.strictEqual(s.stage.style.minHeight, Math.ceil(520 + (833 + 844 - 1491)) + "px", "stage holds just the missing height");
assert.deepStrictEqual(JSON.parse(JSON.stringify(s.calls)), [{ left: 0, top: 833, behavior: "instant" }], "scrollY restored, no smooth scroll");
assert.strictEqual(s.state.y, 833);
s.raf.forEach(function (f) { f(); });
assert.strictEqual(s.calls.length, 1, "no second scroll when already in place");
/* Far from the bottom: nothing to hold, nothing to restore. */
s = scrollCtx({ y: 180, h: 1677, vh: 844, stageH: 520 });
s.keepTowerScrollAround(s.root, function () { s.state.h = 1491; });
assert.strictEqual(s.stage.style.minHeight, "", "no hold when the page is still tall enough");
assert.strictEqual(s.calls.length, 0, "no scroll call");
/* A scroll the viewer makes after Remove is never undone. */
s = scrollCtx({ y: 400, h: 1677, vh: 844, stageH: 520 });
s.keepTowerScrollAround(s.root, function () {});
s.state.y = 900;
s.raf.forEach(function (f) { f(); });
assert.strictEqual(s.calls.length, 0, "late check only undoes a clamp");
/* Wiring: the Remove button, Backspace/Delete and the root hook all go through it. */
assert.ok(/root\.__cognationRemoveSelected = removeSelectedKeepingScroll;/.test(tower));
assert.ok(/keepTowerScrollAround\(root, removeSelectedWidget\)/.test(tower));
assert.strictEqual((tower.match(/removeSelectedKeepingScroll\(\);/g) || []).length, 2, "key handler and Remove button");
assert.ok(!/removeSelectedWidget\(\);/.test(tower), "no direct call skips the scroll keep");

/* 3. Show clears a stale removal line (and only that). */
var cctx = {};
vm.createContext(cctx);
vm.runInContext(fnSrc("clearStaleRemovalStatus"), cctx);
function statusEl(text, removalLine) {
  var cls = { "is-error": 0 };
  var el = { hidden: false, textContent: text, __towerRemovalLine: removalLine, classList: { remove: function (c) { delete cls[c]; } } };
  return { el: el, root: { querySelector: function (q) { return q === "[data-tower-profile-status]" ? el : null; } } };
}
var line = "Music removed. Show it again in Edit profile.";
var st = statusEl(line, line);
cctx.clearStaleRemovalStatus(st.root);
assert.ok(st.el.hidden && st.el.textContent === "", "removal line cleared on Show");
st = statusEl("Frame saved.", line);
cctx.clearStaleRemovalStatus(st.root);
assert.ok(!st.el.hidden && st.el.textContent === "Frame saved.", "a newer, different line stays");
st = statusEl("Saved.", "");
cctx.clearStaleRemovalStatus(st.root);
assert.strictEqual(st.el.textContent, "Saved.", "not a removal line: untouched");
var safe = blockIn(tower, tower.indexOf("function setProfileStatusSafe(msg, isError, removal)"));
assert.ok(/el\.__towerRemovalLine = removal && msg \? String\(msg\) : "";/.test(safe), "removal lines are remembered");
var renderList = fnSrc("renderHiddenWidgetsList");
assert.ok(/setPublicWidgetVisible\(root, id, true\);\s*clearStaleRemovalStatus\(root\);/.test(renderList), "Show clears it right after showing the widget");
assert.ok(!/TowerProfileStore\.save|textContent = "[A-Z]/.test(fnSrc("clearStaleRemovalStatus")), "no writes, no new copy");

console.log("removal-notice-followup: ok");
