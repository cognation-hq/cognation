/**
 * ECHO Chatroom card (Designer spec, 2026-10-30): the card keeps its deck height. Below
 * "Enter room", the body scrolls inside the card (overflow-y: auto) with a 24px bottom
 * fade, so "Request to join on camera" and its count never run out of the card and
 * under Pass / Keep. "Enter room" stays outside the scroller (visible without scrolling).
 * Pass / Keep sit at least 12px below the card's bottom border.
 *
 * Real commune-swipe.js + chatroom-rules.js in a vm (markup) and css/styles.css (rules).
 * Geometry at 1280 / 390 is measured in a real browser in the PR shots.
 * Run: node --test js/echo-chatroom-card-scroll.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

/* ECS_ROOT runs the same test against another checkout (fail-on-base). */
var root = process.env.ECS_ROOT ? path.resolve(process.env.ECS_ROOT) : path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var css = src("css/styles.css");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

/* Minimal element: renderCard only sets className, attributes and innerHTML. */
function fakeEl(tag) {
  var attrs = {};
  return {
    tagName: String(tag).toUpperCase(), className: "", innerHTML: "", attrs: attrs,
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    appendChild: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  };
}

function renderChatroom() {
  var local = memoryStorage();
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: [] }));
  var doc = {
    readyState: "complete", createElement: fakeEl,
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, dispatchEvent: function () { return true; },
  };
  var win = { localStorage: local, sessionStorage: memoryStorage(), document: doc, addEventListener: function () {} };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: local, sessionStorage: win.sessionStorage, console: console,
    CustomEvent: function CustomEvent(t, i) { this.type = t; this.detail = i && i.detail; },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
  });
  vm.runInContext(src("js/chatroom-rules.js"), ctx);
  vm.runInContext(src("js/commune-swipe.js"), ctx);
  var api = win.CognationCommuneSwipe;
  assert.strictEqual(typeof api.renderCard, "function", "CognationCommuneSwipe.renderCard is exposed for this test");
  return api.renderCard({ id: "room-site-insurance", type: "chatroom", title: "Insurance", topic: "insurance", gate: "interest", host: "Cognation" });
}

function rule(selector) {
  var esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp("(^|\\n|\\})\\s*" + esc + "\\s*\\{([^}]*)\\}", "g");
  var m, body = "";
  while ((m = re.exec(css))) body += m[2] + ";";
  return body;
}

test("Chatroom card: Enter room first, then one scroll body that holds the camera button and count", function () {
  var html = renderChatroom().innerHTML;
  var enter = html.indexOf("data-commune-enter-sim");
  var scroll = html.indexOf("data-commune-card-scroll");
  assert.ok(enter > 0, "Enter room is on the card");
  assert.ok(scroll > enter, "the scroll body starts after Enter room (Enter room stays outside it)");
  assert.strictEqual(html.split("data-commune-card-scroll").length - 1, 1, "exactly one scroll body");
  var inner = html.slice(scroll);
  assert.ok(/data-chatroom-camera[ >]/.test(inner), "Request to join on camera is inside the scroll body");
  assert.ok(/data-chatroom-camera-count/.test(inner), "the camera count is inside the scroll body");
  assert.ok(/<\/div>\s*<button[^>]*data-commune-card-more[\s\S]*<\/button>\s*$/.test(html), "the scroll body closes, then only the More cue follows");
});

test("CSS: the card keeps its deck height and clips; the body scrolls with a 24px bottom fade", function () {
  var card = rule('.commune-card[data-card-type="chatroom"]');
  assert.ok(/overflow\s*:\s*hidden/.test(card), "the Chatroom card clips to its own box");
  var body = rule(".commune-card-scroll");
  assert.ok(/overflow-y\s*:\s*auto/.test(body), "overflow-y: auto");
  assert.ok(/min-height\s*:\s*0/.test(body), "min-height: 0 so it can shrink inside the card");
  assert.ok(/flex\s*:\s*1 1 0?(%|px)?/.test(body) || /flex\s*:\s*1\b/.test(body), "takes the rest of the card height");
  assert.ok(/mask-image\s*:[^;]*calc\(100% - 24px\)[^;]*transparent/.test(body), "24px bottom fade (mask) into the card's glass");
  assert.ok(/padding-bottom\s*:\s*24px/.test(body), "24px end padding so the last line clears the fade at full scroll");
  assert.ok(!/(^|[^-])height\s*:/.test(card), "no new fixed height on the card (deck height unchanged)");
  assert.ok(/flex\s*:\s*none/.test(rule('.commune-card[data-card-type="chatroom"] .commune-card-body')),
    "the blurb does not grow, so Enter room stays where it is on base");
});

test("CSS: Pass / Keep stay at least 12px below the card", function () {
  var stage = rule(".commune-swipe-stage");
  var m = /margin-bottom\s*:\s*([\d.]+)(rem|px)/.exec(stage);
  assert.ok(m, "the stage has a bottom margin");
  var px = m[2] === "rem" ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
  assert.ok(px >= 12, "gap " + px + "px >= 12px");
});

/* ---- PM conditions (2026-10-30 10:00 CT): a "More" cue, and touch scroll vs deck swipe ---- */

function swipeApi() {
  var local = memoryStorage();
  var doc = {
    readyState: "complete", createElement: fakeEl,
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, dispatchEvent: function () { return true; },
  };
  var win = { localStorage: local, sessionStorage: memoryStorage(), document: doc, addEventListener: function () {} };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: local, sessionStorage: win.sessionStorage, console: console,
    CustomEvent: function CustomEvent() {}, setTimeout: function () { return 0; }, clearTimeout: function () {} });
  vm.runInContext(src("js/chatroom-rules.js"), ctx);
  vm.runInContext(src("js/commune-swipe.js"), ctx);
  return win.CognationCommuneSwipe;
}

test("Chatroom card: a 'More' cue button sits outside the scroll body, hidden until JS sees overflow", function () {
  var html = renderChatroom().innerHTML;
  var m = /<button[^>]*data-commune-card-more[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(m, "the card has a [data-commune-card-more] button");
  assert.ok(/\shidden[\s>]/.test(m[0]), "hidden by default (no cue before overflow is measured)");
  assert.ok(/type="button"/.test(m[0]), "type=button");
  assert.ok(/aria-label="[^"]+"/.test(m[0]), "has an aria-label");
  assert.ok(/>\s*More\s*</.test(m[1]) || /\bMore\b/.test(m[1].replace(/<[^>]+>/g, "")), "reads 'More'");
  var scrollStart = html.indexOf("data-commune-card-scroll");
  assert.ok(html.indexOf("data-commune-card-more") > scrollStart, "after the scroll body opens");
  var inner = html.slice(scrollStart, html.indexOf("data-commune-card-more"));
  assert.ok(/<\/div>\s*<button[^>]*$/.test(inner), "outside the scroll body, so the fade mask never hides it");
});

test("More cue shows only while the body can scroll further down", function () {
  var api = swipeApi();
  assert.strictEqual(typeof api.moreCueVisible, "function");
  assert.strictEqual(api.moreCueVisible(0, 277, 169), true, "top of an overflowing body");
  assert.strictEqual(api.moreCueVisible(60, 277, 169), true, "part way down");
  assert.strictEqual(api.moreCueVisible(108, 277, 169), false, "at the bottom");
  assert.strictEqual(api.moreCueVisible(107.4, 277, 169), false, "within 1px of the bottom (sub-pixel scrollTop)");
  assert.strictEqual(api.moreCueVisible(0, 120, 120), false, "nothing overflows");
  assert.strictEqual(api.moreCueVisible(0, 0, 0), false, "not laid out");
});

test("CSS: the More cue is its own 24px row under the scroll body (v2): small, muted, centered, no yellow, no loop", function () {
  var cue = rule(".commune-card-more");
  assert.ok(!/position\s*:\s*absolute/.test(cue), "not an overlay any more (it never covers the Chat log)");
  assert.ok(/flex\s*:\s*none/.test(cue), "a fixed row: flex none");
  assert.ok(/(^|[;\s])height\s*:\s*24px/.test(cue), "24px row");
  assert.ok(/align-self\s*:\s*center/.test(cue), "centered in the card");
  assert.ok(/font-size\s*:\s*0\.75rem/.test(cue), "0.75rem");
  assert.ok(/color\s*:\s*#d9d2f0/i.test(cue), "#d9d2f0");
  assert.ok(!/animation/.test(cue), "no animation");
  var all = css.slice(css.indexOf(".commune-card-more"));
  all = all.slice(0, all.indexOf("/* end commune-card-more */"));
  assert.ok(all.length > 0, "cue rules are grouped with an end marker");
  assert.ok(!/animation|@keyframes|infinite/.test(all), "no motion loop anywhere in the cue rules");
  assert.ok(!/yellow|#ff[cdef][0-9a-f]0|#ffd|#fe[0-9a-f]{4}|gold|#f5c|#fc0/i.test(all), "no yellow");
  var hid = (all.match(/\.commune-card-more\[hidden\]\s*\{([^}]*)\}/) || [])[1] || "";
  assert.ok(/visibility\s*:\s*hidden/.test(hid), "[hidden] hides it with visibility (the row keeps its 24px, no jump)");
  assert.ok(/display\s*:\s*(inline-)?flex/.test(hid) && !/display\s*:\s*none/.test(hid), "[hidden] does not collapse the row");
});

test("CSS: a 16px top fade only once the body has scrolled, mirroring the 24px bottom fade", function () {
  var on = rule(".commune-card-scroll.is-scrolled");
  assert.ok(/mask-image\s*:[^;]*transparent[^;]*#000 16px[^;]*calc\(100% - 24px\)[^;]*transparent/.test(on), "16px top + 24px bottom mask when scrolled");
  var base = rule(".commune-card-scroll");
  assert.ok(!/mask-image\s*:[^;]*#000 16px/.test(base), "no top fade at scrollTop 0");
});

test("Top fade flag follows scrollTop > 0", function () {
  var api = swipeApi();
  assert.strictEqual(typeof api.topFadeVisible, "function", "topFadeVisible is exported");
  assert.strictEqual(api.topFadeVisible(0), false);
  assert.strictEqual(api.topFadeVisible(0.4), false, "sub-pixel rounding at the top is still the top");
  assert.strictEqual(api.topFadeVisible(1), true);
  assert.strictEqual(api.topFadeVisible(60), true);
});

test("Deck drag: axis locks after 8px; vertical (or a tie) never swipes, a cancelled drag never swipes", function () {
  var api = swipeApi();
  assert.strictEqual(typeof api.dragAxis, "function");
  assert.strictEqual(api.dragAxis(3, 2), null, "under the lock distance");
  assert.strictEqual(api.dragAxis(2, -20), "y");
  assert.strictEqual(api.dragAxis(10, 10), "y", "a tie favors scrolling");
  assert.strictEqual(api.dragAxis(30, 5), "x");
  assert.strictEqual(api.dragAxis(-30, -12), "x");
  assert.strictEqual(typeof api.swipeDecision, "function");
  assert.strictEqual(api.swipeDecision({ dx: -150, axis: "x" }), "left");
  assert.strictEqual(api.swipeDecision({ dx: 150, axis: "x" }), "right");
  assert.strictEqual(api.swipeDecision({ dx: 79, axis: "x" }), null, "under 80px");
  assert.strictEqual(api.swipeDecision({ dx: -150, axis: "y" }), null, "vertical gesture with drift");
  assert.strictEqual(api.swipeDecision({ dx: -150, axis: null }), null, "never locked");
  assert.strictEqual(api.swipeDecision({ dx: -150, axis: "x", cancelled: true }), null, "pointercancel (browser took the scroll)");
});

test("CSS: the More cue beats the global !important button skins (no orange or glass fill, stays #d9d2f0)", () => {
  const m = css.match(/\.commune-card \.commune-card-more,[^{]*\{([^}]*)\}/);
  assert.ok(m, "a .commune-card .commune-card-more override rule exists");
  assert.match(m[1], /background:\s*transparent\s*!important/);
  assert.match(m[1], /border:\s*0\s*!important/);
  assert.match(m[1], /color:\s*#d9d2f0\s*!important/i);
});
