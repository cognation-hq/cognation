/* Live PARTIAL fixes (#134 check): y drift on reload, owner link clicks, no fake hangout slots.
   Run: node js/tower-live-partial-fixes.test.js */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var sync = require("./tower-layout-sync.js");

function grab(name) {
  var s = tower.indexOf("function " + name + "(");
  assert.ok(s > 0, name + " present");
  var depth = 0, i = tower.indexOf("{", s);
  for (; i < tower.length; i++) { if (tower[i] === "{") depth++; else if (tower[i] === "}" && --depth === 0) break; }
  return tower.slice(s, i + 1);
}
var ctx = vm.createContext({});
vm.runInContext(grab("stickerYFromLayout") + grab("stickerYPxFromDrop") + "this.at = stickerYFromLayout; this.px = stickerYPxFromDrop;", ctx);

/* (1) Drag on a 1500px stage at 40% → reload on stages of other heights: same pixel top every time. */
var dropH = 1500, dropPct = 40;
var entry = { x: 44.4, y: dropPct, z: 9, tilt: 0, dragged: true, yPx: ctx.px(dropPct, dropH) };
assert.strictEqual(entry.yPx, 600);
var row = sync._clean({ slogan: entry });
assert.strictEqual(row.slogan.yPx, 600, "server row keeps yPx");
assert.strictEqual(row.slogan.dragged, true);
var tops = [];
[1100, 1340, 1390].forEach(function (reloadH) { /* reload 1, 2, 3 (stage min-height grows) */
  var profile = { _profileId: "33333333-3333-4333-8333-333333333333", widgetLayout: {} };
  sync._cache[profile._profileId] = sync._clean(row);
  sync.apply(profile);
  var a = ctx.at(profile.widgetLayout.slogan, reloadH);
  tops.push(a.css);
  assert.strictEqual(profile.widgetLayout.slogan.x, 44.4, "x holds");
  assert.ok(Math.abs(a.pct / 100 * reloadH - 600) < 1, "drag-start % matches the painted pixel top");
});
assert.deepStrictEqual(tops, ["600px", "600px", "600px"], "reloading twice changes nothing");
/* Old rows without yPx keep the previous % behavior (no surprise jump). */
assert.strictEqual(ctx.at({ y: 30 }, 1200).css, "30%");
/* Wiring: drop saves yPx, apply paints it, local merge and companions keep it. */
assert.ok(/layout\[id\]\.yPx = dropYPx/.test(tower), "drop saves yPx");
assert.ok(/el\.style\.setProperty\("--sticker-y", yAt\.css\)/.test(tower), "apply paints saved y");
assert.ok(/base\[id\]\.yPx = pos\.yPx/.test(tower), "local layout merge keeps yPx");
assert.ok(/layout\[id\]\.yPx = Math\.round\(el\.offsetTop\)/.test(tower), "frozen companions keep yPx");

/* (2) Owner: link chips open; the move handle no longer covers the link; drag still from the handle. */
var m = css.match(/\[data-tower-app\]\[data-tower-is-owner="true"\]\[data-tower-side="public"\] \.tower-layout--scrapbook \.tower-sticker--social-chip \{\s*padding-left: ([\d.]+)rem;/);
assert.ok(m, "owner chip leaves room for the handle");
assert.ok(parseFloat(m[1]) >= 0.35 + 1.6, "padding clears the 1.6rem handle at 0.35rem");
assert.ok(/var handleHit = ev\.target\.closest\("\[data-tower-sticker-handle\]"\);[\s\S]{0,200}ev\.target\.closest\("a, button/.test(tower), "pointerdown on a link never starts a drag (link keeps its click)");
assert.ok(/a\.target = "_blank";/.test(tower) && /a\.href = href;/.test(tower), "chip link opens in a new tab");

/* (3) Suggested hangouts hidden (fixed times, not saved data); Book stays off. */
assert.ok(/var HANGOUT_SUGGESTIONS_LIVE = false;/.test(tower), "suggestions flag off");
assert.ok(/if \(!HANGOUT_SUGGESTIONS_LIVE\) schedulerHtml = "";/.test(tower), "scheduler panel not rendered");
assert.ok(/var HANGOUT_BOOKING_LIVE = false;/.test(tower), "Book stays off");

/* PULSE friend tap → THAT friend's Tower, on main without #135 (live PASS on d4ff0f6). */
(function () {
  function el(id, attrs) {
    var a = Object.assign({}, attrs || {}), ls = {};
    return { id: id, hidden: false, tabIndex: 0,
      getAttribute: function (k) { return k in a ? a[k] : null; },
      setAttribute: function (k, v) { a[k] = String(v); },
      addEventListener: function (t, f) { (ls[t] = ls[t] || []).push(f); },
      click: function () { (ls.click || []).forEach(function (f) { f({ preventDefault: function () {} }); }); },
      focus: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
  }
  var towerTab = el("tab-tower", { role: "tab", "aria-controls": "panel-tower", "aria-selected": "false" });
  var echoTab = el("tab-commune", { role: "tab", "aria-controls": "panel-commune", "aria-selected": "true" });
  var byId = { "panel-tower": el("panel-tower"), "panel-commune": el("panel-commune"), "tab-tower": towerTab };
  var tablist = el("tl"); tablist.querySelectorAll = function () { return [towerTab, echoTab]; };
  var container = el("c"); container.querySelector = function () { return tablist; };
  var loc = { hash: "", pathname: "/", search: "" }, own = 0, onHash = [];
  var sb = { location: loc, CustomEvent: function () {},
    document: { readyState: "complete", getElementById: function (id) { return byId[id] || null; },
      querySelectorAll: function (q) { return q === "[data-tabs]" ? [container] : []; }, querySelector: function () { return null; },
      dispatchEvent: function () {}, addEventListener: function () {} },
    addEventListener: function (t, f) { if (t === "hashchange") onHash.push(f); }, setTimeout: function () {} };
  sb.window = sb;
  sb.CognationTowerOpenOwn = function () { own++; loc.hash = ""; };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "tabs.js"), "utf8"), sb);
  var openSrc = tower.slice(tower.indexOf("window.CognationTowerOpenProfile = function"), tower.indexOf("window.CognationTowerFriends = {"));
  vm.runInContext("function applyTowerSide(){} function renderProfileChrome(){}\n" + openSrc, sb);
  own = 0;
  sb.CognationTowerOpenProfile("seed-luna-0053");
  onHash.forEach(function (f) { f(); }); /* browser fires hashchange */
  assert.strictEqual(loc.hash, "tower-profile-seed-luna-0053", "friend hash kept");
  assert.strictEqual(towerTab.getAttribute("aria-selected"), "true", "Tower tab shown");
  assert.strictEqual(own, 0, "never bounced to own Tower");
  loc.hash = ""; echoTab.click(); towerTab.click();
  assert.strictEqual(own, 1, "owner TOWER tab still opens own Tower");
  var fall = fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8");
  assert.ok(/opts\.open\(friend\.handle, friend\)/.test(fall) && /CognationTowerOpenProfile\(handle\)/.test(tower), "falling friend tap opens that friend by handle");
})();

console.log("tower-live-partial-fixes.test.js: OK");
