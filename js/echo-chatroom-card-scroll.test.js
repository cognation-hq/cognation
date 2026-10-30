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
  assert.ok(/<\/div>\s*$/.test(html), "the scroll body closes at the end of the card");
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
