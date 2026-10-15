/**
 * PULSE ring balls + friend tap-through.
 * Run: node js/pulse-ring.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ring = require("./pulse-ring.js");

/* ---- Mirrored pairs ---- */
var friends = [];
for (var i = 0; i < 11; i++) friends.push({ userId: "u" + i, name: "F" + i, handle: "seed-f-" + i });
var slots = ring.assignSpots(friends);
assert.strictEqual(slots.length, ring.SPOTS, "up to 8 friends ride the ring");
for (var p = 0; p < slots.length; p += 2) {
  var a = ring.spotAngle(slots[p].start), b = ring.spotAngle(slots[p + 1].start);
  assert.strictEqual(slots[p].pair, slots[p + 1].pair, "pair kept together");
  assert.strictEqual(((b - a) % 360 + 360) % 360, 180, "pair " + slots[p].pair + " sits on opposite sides");
}
var starts = slots.map(function (s) { return s.start; }).sort();
assert.deepStrictEqual(starts, [0, 1, 2, 3, 4, 5, 6, 7], "every spot used once");
/* Pairs stay mirrored while moving (all balls step together). */
[0, 350, 900, 2000, 5555].forEach(function (t) {
  var x = ring.ballAt(slots[0].start, t, false), y = ring.ballAt(slots[1].start, t, false);
  assert.strictEqual(Math.round((((y.angle - x.angle) % 360) + 360) % 360), 180, "mirrored at t=" + t);
});
assert.strictEqual(ring.assignSpots([{ userId: "a" }]).length, 1, "single friend still placed");
assert.strictEqual(ring.assignSpots([]).length, 0, "no friends, no balls");

/* ---- Motion: hop, bounce ×2 with name at 3 front spots, then back with no name ---- */
var S = ring.STEP_MS, H = ring.HOP_MS, B = ring.BOUNCE_MS;
var start = 6; /* next three stops are 7, 0, 1 (front), then 2 (back) */
var seen = [];
for (var step = 0; step < 4; step++) {
  var hop = ring.ballAt(start, step * S + H / 2, false);
  assert.strictEqual(hop.showName, false, "no name while hopping");
  assert.ok(hop.lift > 0, "hop arcs like a ball");
  var b1 = ring.ballAt(start, step * S + H + B / 2, false);
  var b2 = ring.ballAt(start, step * S + H + B + B / 2, false);
  assert.strictEqual(ring.stepAt(step * S + H + B / 2).bounce, 1);
  assert.strictEqual(ring.stepAt(step * S + H + B + B / 2).bounce, 2, "two bounces per stop");
  assert.ok(b1.lift > 0 && b2.lift > 0, "bounces in place");
  assert.strictEqual(b1.angle, b2.angle, "bounce stays on the spot");
  seen.push({ spot: b1.spot, named: b1.showName && b2.showName, opacity: b1.opacity });
}
assert.deepStrictEqual(seen.map(function (s) { return s.spot; }), [7, 0, 1, 2], "hops to the next ring spot each step");
assert.deepStrictEqual(seen.map(function (s) { return s.named; }), [true, true, true, false], "name at 3 front spots, none at the back");
assert.strictEqual(seen[3].opacity, ring.BACK_OPACITY, "fades at the back");
assert.strictEqual(seen[0].opacity, 1, "full at the front");

/* ---- Reduced motion: static spots, every name readable ---- */
[0, 1234, 99999].forEach(function (t) {
  slots.forEach(function (s) {
    var r = ring.ballAt(s.start, t, true);
    assert.strictEqual(r.angle, ring.spotAngle(s.start), "static spot");
    assert.strictEqual(r.lift, 0, "no bounce");
    assert.strictEqual(r.showName, true, "name readable");
    assert.strictEqual(r.opacity, 1, "no fade");
  });
});
assert.strictEqual(ring.prefersReducedMotion({ matchMedia: function (q) { return { matches: /reduce/.test(q) }; } }), true);
assert.strictEqual(ring.prefersReducedMotion({}), false);
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*a\.pulse-ball \{[^}]*\}\s*a\.pulse-ball \.pulse-ball-name \{ visibility: visible; \}/.test(css), "CSS shows names under reduced motion");

/* ---- Friend tap opens THAT friend's Tower; owner open still works ---- */
function el(id, attrs) {
  var a = Object.assign({}, attrs || {});
  var listeners = {};
  return {
    id: id, hidden: false, tabIndex: 0,
    getAttribute: function (k) { return k in a ? a[k] : null; },
    setAttribute: function (k, v) { a[k] = String(v); },
    addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
    click: function () { (listeners.click || []).forEach(function (f) { f({ preventDefault: function () {} }); }); },
    focus: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
}
var towerTab = el("tab-tower", { role: "tab", "aria-controls": "panel-tower", "aria-selected": "false" });
var echoTab = el("tab-commune", { role: "tab", "aria-controls": "panel-commune", "aria-selected": "true" });
var panels = { "panel-tower": el("panel-tower"), "panel-commune": el("panel-commune"), "tab-tower": towerTab };
var tablist = el("tl");
tablist.querySelectorAll = function () { return [towerTab, echoTab]; };
var container = el("c");
container.querySelector = function () { return tablist; };
var ownCalls = 0;
var loc = { hash: "", pathname: "/", search: "" };
var sandbox = {
  location: loc,
  CustomEvent: function (n, d) { this.type = n; this.detail = d && d.detail; },
  document: {
    readyState: "complete",
    getElementById: function (id) { return panels[id] || null; },
    querySelectorAll: function (s) { return s === "[data-tabs]" ? [container] : []; },
    querySelector: function () { return null; },
    dispatchEvent: function () {},
    addEventListener: function () {},
  },
  addEventListener: function () {},
  setTimeout: function () {},
};
sandbox.window = sandbox;
sandbox.CognationTowerOpenOwn = function () { ownCalls++; loc.hash = ""; };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "tabs.js"), "utf8"), sandbox);
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var openSrc = tower.slice(tower.indexOf("window.CognationTowerOpenProfile = function"), tower.indexOf("window.CognationTowerFriends = {"));
vm.runInContext("function applyTowerSide(){} function renderProfileChrome(){}\n" + openSrc, sandbox);

/* PULSE page hides every tab (as startCircleFall does). */
towerTab.setAttribute("aria-selected", "false");
echoTab.setAttribute("aria-selected", "false");
ownCalls = 0;
sandbox.CognationTowerOpenProfile("seed-luna-0053");
assert.strictEqual(loc.hash, "tower-profile-seed-luna-0053", "friend hash kept");
assert.strictEqual(towerTab.getAttribute("aria-selected"), "true", "Tower tab shown right away");
assert.strictEqual(ownCalls, 0, "friend tap never bounces to own Tower");
/* Re-tap the same friend (no hashchange) still lands on the friend's Tower. */
towerTab.setAttribute("aria-selected", "false");
sandbox.CognationTowerOpenProfile("seed-luna-0053");
assert.strictEqual(towerTab.getAttribute("aria-selected"), "true", "re-tap shows Tower");
assert.strictEqual(loc.hash, "tower-profile-seed-luna-0053");
assert.strictEqual(ownCalls, 0);
/* Owner: TOWER tab with no profile hash opens own Tower. */
loc.hash = "";
echoTab.click();
towerTab.click();
assert.strictEqual(ownCalls, 1, "owner open still calls OpenOwn");

/* Taps wired: ring balls + falling friends open by handle (or profile id) via OpenProfile. */
assert.ok(/ball\.addEventListener\("click"[\s\S]{0,260}CognationTowerOpenProfile\(openKey\)/.test(tower), "ring ball tap opens that friend");
var fall = fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8");
assert.ok(/opts\.open\(openKey, friend\)/.test(fall), "falling friend tap passes that friend's key");
var pf = require("./pulse-falling-friends.js");
assert.strictEqual(pf.photoColumnLive, false, "photo_url off until its SQL runs (no 42703 400)");

console.log("pulse-ring.test.js: OK");
