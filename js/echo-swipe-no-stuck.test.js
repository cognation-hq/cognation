/**
 * ECHO: a swipe never leaves the card stuck mid-drag (echo-swipe-no-stuck).
 *
 * 390 A/B (046484e vs 86708cd): a mouse drag left 120 then down 260, released off the
 * card (on the shell below the deck), never fires the deck pointerup, so the card stays
 * at translate(-120px) rotate(-4.29deg) with is-dragging on. The fix captures the pointer
 * on a horizontal lock and also ends the drag on window pointerup / pointercancel and on
 * lostpointercapture. The press that frees a stuck card is never a tap (0 joins).
 * Gesture change: a touch sideways swipe that starts on the scrollable Chatroom body
 * swipes the card (the body gets touch-action: pan-y; before, the browser took the
 * gesture and sent pointercancel).
 *
 * Real commune-swipe.js in a vm with the small DOM fake from echo-drag-no-click.test.js.
 * Joins are observed by openRoom's first side effect (the site-rooms key write); nothing
 * reaches a backend.
 * Run: node --test js/echo-swipe-no-stuck.test.js   (ESNS_ROOT=<checkout> for fail-on-base)
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = process.env.ESNS_ROOT ? path.resolve(process.env.ESNS_ROOT) : path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var ROOMS_KEY = "cognation.commune.site-rooms.v1";

/* ---- tiny DOM fake ---- */
/* Compound selectors: tag, .class and [attr] in any order (e.g. "[data-commune-card].is-active"). */
function matches(el, sel) {
  return String(sel).split(",").some(function (part) {
    part = part.trim();
    if (!/^[a-z0-9]*(?:\.[\w-]+|\[[\w-]+\])*$/i.test(part)) return false;
    var tag = /^[a-z0-9]+/i.exec(part);
    if (tag && el.tagName !== tag[0].toUpperCase()) return false;
    var classes = (part.match(/\.[\w-]+/g) || []).map(function (c) { return c.slice(1); });
    if (classes.some(function (c) { return el.className.split(/\s+/).indexOf(c) < 0; })) return false;
    var attrs = (part.match(/\[[\w-]+\]/g) || []).map(function (a) { return a.slice(1, -1); });
    return attrs.every(function (a) { return Object.prototype.hasOwnProperty.call(el.attrs, a); });
  });
}
function Node_(tag, attrs, parent) {
  var el = {
    tagName: String(tag).toUpperCase(), className: "", attrs: {}, children: [], parentNode: null, style: {},
    listeners: [], hidden: false, isConnected: true,
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    removeAttribute: function (k) { delete this.attrs[k]; },
    classList: null,
    addEventListener: function (type, fn, opt) { this.listeners.push({ type: type, fn: fn, capture: opt === true || !!(opt && opt.capture) }); },
    removeEventListener: function (type, fn, opt) {
      var cap = opt === true || !!(opt && opt.capture);
      this.listeners = this.listeners.filter(function (l) { return !(l.type === type && l.fn === fn && l.capture === cap); });
    },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    closest: function (sel) { for (var n = this; n && n.tagName; n = n.parentNode) if (matches(n, sel)) return n; return null; },
    querySelectorAll: function (sel) {
      var out = [];
      (function walk(n) { n.children.forEach(function (c) { if (matches(c, sel)) out.push(c); walk(c); }); })(this);
      return out;
    },
    querySelector: function (sel) { return this.querySelectorAll(sel)[0] || null; },
    contains: function (o) { for (var n = o; n; n = n.parentNode) if (n === this) return true; return false; },
    captures: [],
    setPointerCapture: function (id) { this.captures.push(id); },
    releasePointerCapture: function () {},
    hasPointerCapture: function (id) { return this.captures.indexOf(id) >= 0; },
    getBoundingClientRect: function () { return { left: 0, top: 0, right: 300, bottom: 400, width: 300, height: 400 }; },
  };
  var set = {};
  el.classList = {
    add: function () { for (var i = 0; i < arguments.length; i++) set[arguments[i]] = 1; el.className = Object.keys(set).join(" "); },
    remove: function () { for (var i = 0; i < arguments.length; i++) delete set[arguments[i]]; el.className = Object.keys(set).join(" "); },
    contains: function (c) { return !!set[c]; },
    toggle: function (c, on) { if (on === undefined ? !set[c] : on) set[c] = 1; else delete set[c]; el.className = Object.keys(set).join(" "); },
  };
  Object.keys(attrs || {}).forEach(function (k) { el.attrs[k] = String(attrs[k]); });
  if (parent) parent.appendChild(el);
  return el;
}
function fire(win, target, type, props) {
  var path = [];
  for (var n = target; n; n = n.parentNode) path.unshift(n);
  path.unshift(win);
  var ev = Object.assign({ type: type, target: target, defaultPrevented: false, _stop: false, _imm: false,
    preventDefault: function () { this.defaultPrevented = true; },
    stopPropagation: function () { this._stop = true; },
    stopImmediatePropagation: function () { this._stop = true; this._imm = true; } }, props || {});
  function run(node, capture) {
    node.listeners.slice().forEach(function (l) {
      if (ev._imm || l.type !== type) return;
      if (node !== target && l.capture !== capture) return;
      l.fn.call(node, ev);
    });
  }
  for (var i = 0; i < path.length && !ev._stop; i++) run(path[i], true);
  /* At the target, capture listeners already ran above with bubble ones; skip them here. */
  for (var j = path.length - 2; j >= 0 && !ev._stop; j--) run(path[j], false);
  return ev;
}

function setup(cardSpec) {
  var data = {};
  var roomWrites = 0;
  var local = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { if (k === ROOMS_KEY) roomWrites++; data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, interests: [] }));
  var timers = [];
  var win = Node_("window");
  win.tagName = null;
  win.localStorage = local;
  win.sessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  win.setTimeout = function (fn) { timers.push(fn); return timers.length; };
  win.clearTimeout = function (id) { if (id) timers[id - 1] = null; };
  var doc = {
    readyState: "complete", createElement: function (t) { return Node_(t); },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    addEventListener: function () {}, dispatchEvent: function () { return true; },
  };
  win.document = doc;
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: local, sessionStorage: win.sessionStorage, console: console,
    CustomEvent: function CustomEvent(t, i) { this.type = t; this.detail = i && i.detail; },
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
  });
  vm.runInContext(src("js/chatroom-rules.js"), ctx);
  vm.runInContext(src("js/commune-swipe.js"), ctx);
  var api = win.CognationCommuneSwipe;
  /* The shell holds the deck and, below it, the area a release can land on off the card. */
  var shell = Node_("div", { "data-commune-shell": "" });
  var deck = Node_("div", { "data-commune-deck": "" }, shell);
  var below = Node_("div", { "data-test-below-deck": "" }, shell);
  var card = Node_("article", { "data-commune-card": "", "data-card-type": cardSpec.type }, deck);
  card.classList.add("commune-card", "is-active");
  var enter = cardSpec.type === "chatroom" ? Node_("button", { "data-commune-enter-sim": "" }, card) : null;
  var body = Node_("div", { "data-commune-card-scroll": "" }, card);
  var p = Node_("p", {}, body);
  api.bindCard(card, cardSpec);
  api.bindDeck(deck);
  var base = roomWrites;
  return {
    api: api, win: win, shell: shell, deck: deck, below: below, card: card, enter: enter, body: body, p: p,
    joins: function () { return roomWrites - base; },
    stuck: function () { return card.classList.contains("is-dragging") || !!card.style.transform; },
    outcome: function () { return typeof api.lastDragOutcome === "function" ? api.lastDragOutcome() : null; },
    flushTimers: function () { var t = timers; timers = []; t.forEach(function (fn) { if (fn) fn(); }); },
  };
}
var CHAT = { id: "room-site-insurance", type: "chatroom", title: "Insurance", topic: "insurance", gate: "interest", host: "Cognation" };

function ev(type, x, y, extra) { return Object.assign({ pointerType: type, pointerId: type === "touch" ? 2 : 1, clientX: x, clientY: y }, extra || {}); }
/* Down on el, then the path of [dx,dy] points (relative to the start) in 10 steps each. */
function press(t, el, kind, pts) {
  var x0 = 100, y0 = 300, last = [0, 0];
  fire(t.win, el, "pointerdown", ev(kind, x0, y0));
  pts.forEach(function (to) {
    for (var i = 1; i <= 10; i++) {
      fire(t.win, el, "pointermove", ev(kind, x0 + last[0] + (to[0] - last[0]) * i / 10, y0 + last[1] + (to[1] - last[1]) * i / 10));
    }
    last = to;
  });
  return { x: x0 + last[0], y: y0 + last[1] };
}

test("the A/B stuck case: mouse left 120 then down 260, released off the card, ends the drag", function () {
  var t = setup(CHAT);
  var end = press(t, t.p, "mouse", [[-120, 0], [-120, 260]]);
  assert.strictEqual(t.card.style.transform.indexOf("translate(-120px") === 0, true, "the card follows the drag");
  /* The release lands below the deck: no deck pointerup, only the window sees it. */
  fire(t.win, t.below, "pointerup", ev("mouse", end.x, end.y));
  fire(t.win, t.below, "click", { clientX: end.x, clientY: end.y, detail: 1 });
  assert.strictEqual(t.card.classList.contains("is-dragging"), false, "no is-dragging after the release");
  assert.strictEqual(t.card.style.transform || "", "", "no transform left on the card");
  var o = t.outcome();
  assert.ok(o, "lastDragOutcome is exported");
  assert.strictEqual(o.dir, "left", "dx -120 on the x axis is a swipe left (it swipes, not stuck)");
  assert.strictEqual(t.joins(), 0);
});

test("a horizontal lock captures the pointer on the card; a vertical drag does not", function () {
  var t = setup(CHAT);
  press(t, t.p, "mouse", [[-30, 0]]);
  assert.deepStrictEqual(t.card.captures, [1], "setPointerCapture(pointerId) once the drag locks to x");
  fire(t.win, t.card, "pointerup", ev("mouse", 70, 300));
  var v = setup(CHAT);
  press(v, v.p, "mouse", [[0, -120]]);
  assert.deepStrictEqual(v.card.captures, [], "vertical stays scroll: no capture");
  fire(v.win, v.p, "pointerup", ev("mouse", 100, 180));
});

test("window pointercancel and lostpointercapture end the drag too (reset, no swipe)", function () {
  var t = setup(CHAT);
  press(t, t.p, "mouse", [[-120, 0]]);
  fire(t.win, t.below, "pointercancel", ev("mouse", 0, 300));
  assert.strictEqual(t.stuck(), false, "window pointercancel");
  assert.strictEqual(t.outcome().dir, null, "a cancel never swipes");
  press(t, t.p, "mouse", [[-120, 0]]);
  /* A touch's implicit capture on the pressed child is lost when the card takes it; that
     event bubbles to the card and must not end the drag. */
  fire(t.win, t.p, "lostpointercapture", ev("mouse", 0, 300));
  assert.strictEqual(t.stuck(), true, "a child's lostpointercapture (bubbling) does not end the drag");
  fire(t.win, t.card, "lostpointercapture", ev("mouse", 0, 300));
  assert.strictEqual(t.stuck(), false, "lostpointercapture");
  assert.strictEqual(t.outcome().dir, null);
  assert.strictEqual(t.joins(), 0);
});

test("the press that frees a stuck card is never a tap: 0 joins, card reset", function () {
  var t = setup(CHAT);
  /* A drag whose release never reached the page (e.g. mouse up outside the window). */
  press(t, t.p, "mouse", [[-60, 0]]);
  assert.strictEqual(t.stuck(), true, "precondition: a drag in progress with no release");
  t.flushTimers();
  fire(t.win, t.p, "pointerdown", ev("mouse", 100, 300));
  assert.strictEqual(t.card.style.transform || "", "", "the freeing press resets the card at once");
  fire(t.win, t.p, "pointerup", ev("mouse", 100, 300));
  fire(t.win, t.p, "click", { clientX: 100, clientY: 300, detail: 1 });
  assert.strictEqual(t.stuck(), false);
  assert.strictEqual(t.joins(), 0, "the freeing click does not open or join the room");
  /* The swallow is for that one click: the next real tap joins once. */
  fire(t.win, t.enter, "pointerdown", ev("mouse", 100, 300));
  fire(t.win, t.enter, "pointerup", ev("mouse", 100, 300));
  fire(t.win, t.enter, "click", { clientX: 100, clientY: 300, detail: 1 });
  assert.strictEqual(t.joins(), 1, "a later tap on Enter room joins once");
});

test("gesture change: a touch sideways swipe from the Chatroom body advances (body is touch-action: pan-y)", function () {
  var css = src("css/styles.css");
  assert.ok(/\.commune-card-scroll\s*\{[^}]*touch-action:\s*pan-y/.test(css),
    "the scroll body (its own scroll container, so the stage's pan-y does not reach it) allows only vertical pan");
  var t = setup(CHAT);
  var end = press(t, t.p, "touch", [[-120, 6]]);
  fire(t.win, t.p, "pointerup", ev("touch", end.x, end.y));
  fire(t.win, t.p, "click", { clientX: end.x, clientY: end.y, detail: 1 });
  assert.strictEqual(t.outcome().dir, "left", "a touch body swipe advances");
  assert.strictEqual(t.stuck(), false);
  assert.strictEqual(t.joins(), 0);
});

test("a vertical body drag does not swipe (mouse, and touch the browser takes as scroll)", function () {
  var t = setup(CHAT);
  var end = press(t, t.p, "mouse", [[10, -160]]);
  fire(t.win, t.p, "pointerup", ev("mouse", end.x, end.y));
  fire(t.win, t.p, "click", { clientX: end.x, clientY: end.y, detail: 1 });
  assert.strictEqual(t.outcome() && t.outcome().dir, null, "mouse vertical: no swipe");
  press(t, t.p, "touch", [[0, -160]]);
  fire(t.win, t.p, "pointercancel", ev("touch", 100, 140));
  assert.strictEqual(t.outcome() && t.outcome().dir, null, "touch vertical: no swipe");
  assert.strictEqual(t.stuck(), false);
  assert.strictEqual(t.joins(), 0);
});

test("a drag that starts on Enter room is unchanged: no drag, no capture, no swipe, 0 joins", function () {
  var t = setup(CHAT);
  var end = press(t, t.enter, "mouse", [[-120, 0]]);
  assert.strictEqual(t.stuck(), false, "the card never moves for a button-start drag");
  assert.deepStrictEqual(t.card.captures, []);
  fire(t.win, t.enter, "pointerup", ev("mouse", end.x, end.y));
  fire(t.win, t.enter, "click", { clientX: end.x, clientY: end.y, detail: 1 });
  assert.strictEqual(t.outcome(), null, "no drag ever started");
  assert.strictEqual(t.joins(), 0, "#330: the post-drag click on Enter room is swallowed");
  fire(t.win, t.enter, "pointerdown", ev("mouse", 100, 300));
  fire(t.win, t.enter, "pointerup", ev("mouse", 100, 300));
  fire(t.win, t.enter, "click", { clientX: 100, clientY: 300, detail: 1 });
  assert.strictEqual(t.joins(), 1, "a tap on Enter room still joins once");
});
