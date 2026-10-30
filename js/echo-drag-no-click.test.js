/**
 * ECHO: a drag on a card never clicks Enter room (echo-drag-no-click).
 *
 * SeedOps (#328 live check): a mouse vertical (0,-200) or diagonal (30,-200) drag on
 * a Chatroom card that comes back to where it started fires one click on release,
 * and the card-wide open / Enter room runs openRoom -> join_chat_room. Fix: once a
 * pointer that went down on the deck has moved more than 10px in any direction, the
 * one click after it is swallowed in the capture phase. A tap (<= 10px) still clicks.
 *
 * Real commune-swipe.js in a vm with a small DOM fake (capture + bubble dispatch).
 * openRoom is observed by its first side effect (it writes the site-rooms key), the
 * step right before join_chat_room; nothing reaches a backend.
 * Run: node --test js/echo-drag-no-click.test.js   (EDC_ROOT=<checkout> for fail-on-base)
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = process.env.EDC_ROOT ? path.resolve(process.env.EDC_ROOT) : path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var ROOMS_KEY = "cognation.commune.site-rooms.v1";

/* ---- tiny DOM fake ---- */
function matches(el, sel) {
  return String(sel).split(",").some(function (part) {
    part = part.trim();
    var m = /^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/i.exec(part);
    if (!m) return false;
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    var classes = (m[2] || "").split(".").filter(Boolean);
    if (classes.some(function (c) { return el.className.split(/\s+/).indexOf(c) < 0; })) return false;
    var attrs = (m[3] || "").replace(/^\[|\]$/g, "").split("][").filter(Boolean);
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
  var deck = Node_("div", { "data-commune-deck": "" });
  var card = Node_("article", { "data-commune-card": "", "data-card-type": cardSpec.type }, deck);
  card.classList.add("commune-card", "is-active");
  var title = Node_("h3", {}, card);
  var enter = cardSpec.type === "chatroom" ? Node_("button", { "data-commune-enter-sim": "" }, card) : null;
  var body = Node_("div", { "data-commune-card-scroll": "" }, card);
  var p = Node_("p", {}, body);
  /* Any other control on a card: its own click handler counts. */
  var other = Node_("button", { "data-test-other": "" }, card);
  var otherClicks = 0;
  other.addEventListener("click", function (ev) { ev.stopPropagation(); otherClicks++; });
  api.bindCard(card, cardSpec);
  /* Older checkouts (fail-on-base) have no bindDeck export: the card is wired alone,
     which is how those builds treat a vertical drag (the pointer is dropped, lastDragDx 0). */
  if (typeof api.bindDeck === "function") api.bindDeck(deck);
  var base = roomWrites;
  return {
    win: win, deck: deck, card: card, enter: enter, p: p, title: title, other: other,
    joins: function () { return roomWrites - base; }, others: function () { return otherClicks; },
    flushTimers: function () { var t = timers; timers = []; t.forEach(function (fn) { if (fn) fn(); }); },
  };
}
var CHAT = { id: "room-site-insurance", type: "chatroom", title: "Insurance", topic: "insurance", gate: "interest", host: "Cognation" };

/* A mouse gesture like the SeedOps probe: down, out by (dx,dy) in 10 steps, back to
   the start in 10 steps, up, then the click the browser fires on the element. */
function mouseDrag(t, el, dx, dy, opts) {
  opts = opts || {};
  var x0 = 100, y0 = 300;
  fire(t.win, el, "pointerdown", { pointerType: "mouse", clientX: x0, clientY: y0 });
  for (var i = 1; i <= 10; i++) fire(t.win, el, "pointermove", { pointerType: "mouse", clientX: x0 + dx * i / 10, clientY: y0 + dy * i / 10 });
  if (!opts.oneWay) for (var k = 9; k >= 0; k--) fire(t.win, el, "pointermove", { pointerType: "mouse", clientX: x0 + dx * k / 10, clientY: y0 + dy * k / 10 });
  fire(t.win, el, "pointerup", { pointerType: "mouse", clientX: opts.oneWay ? x0 + dx : x0, clientY: opts.oneWay ? y0 + dy : y0 });
  fire(t.win, opts.clickOn || el, "click", { clientX: x0, clientY: y0, detail: 1 });
}
function tap(t, el, wiggle) {
  wiggle = wiggle || 0;
  fire(t.win, el, "pointerdown", { pointerType: "mouse", clientX: 100, clientY: 300 });
  if (wiggle) fire(t.win, el, "pointermove", { pointerType: "mouse", clientX: 100 + wiggle, clientY: 300 + wiggle });
  fire(t.win, el, "pointerup", { pointerType: "mouse", clientX: 100 + wiggle, clientY: 300 + wiggle });
  fire(t.win, el, "click", { clientX: 100, clientY: 300, detail: 1 });
}

test("a plain click / tap on Enter room joins exactly once (and a 6px wiggle is still a tap)", function () {
  var t = setup(CHAT);
  tap(t, t.enter);
  assert.strictEqual(t.joins(), 1, "one tap = one openRoom/join");
  tap(t, t.enter, 6);
  assert.strictEqual(t.joins(), 2, "a 6px wiggle is a tap");
  tap(t, t.p);
  assert.strictEqual(t.joins(), 3, "a tap on the card body opens the room once (card-wide open)");
});

test("mouse vertical drag (0,-200 and back) on the card body or on Enter room: 0 joins", function () {
  var t = setup(CHAT);
  mouseDrag(t, t.p, 0, -200);
  assert.strictEqual(t.joins(), 0, "vertical drag on the body must not open/join");
  mouseDrag(t, t.enter, 0, -200);
  assert.strictEqual(t.joins(), 0, "vertical drag that starts on Enter room must not join");
  mouseDrag(t, t.p, 0, 200, { oneWay: true, clickOn: t.card });
  assert.strictEqual(t.joins(), 0, "one-way vertical drag, click on the card: no join");
});

test("mouse diagonal drag (30,-200 and back, and one-way): 0 joins", function () {
  var t = setup(CHAT);
  mouseDrag(t, t.p, 30, -200);
  mouseDrag(t, t.enter, 30, -200);
  mouseDrag(t, t.p, 30, -200, { oneWay: true, clickOn: t.card });
  assert.strictEqual(t.joins(), 0);
});

test("mouse horizontal drag (a swipe, or a swipe taken back) never clicks", function () {
  var t = setup(CHAT);
  mouseDrag(t, t.p, -120, 0);
  mouseDrag(t, t.enter, -120, 0);
  mouseDrag(t, t.p, -240, 0, { oneWay: true, clickOn: t.card });
  mouseDrag(t, t.p, 40, 0);
  assert.strictEqual(t.joins(), 0);
});

test("a tap right after a drag still works; the swallow is for one click only", function () {
  var t = setup(CHAT);
  mouseDrag(t, t.p, 0, -200);
  tap(t, t.enter);
  assert.strictEqual(t.joins(), 1, "the next tap joins once");
  /* A drag whose click never comes (native scroll) does not eat a later keyboard click. */
  fire(t.win, t.p, "pointerdown", { pointerType: "mouse", clientX: 0, clientY: 0 });
  fire(t.win, t.p, "pointermove", { pointerType: "mouse", clientX: 0, clientY: 50 });
  fire(t.win, t.p, "pointercancel", { pointerType: "mouse" });
  t.flushTimers();
  fire(t.win, t.enter, "click", { detail: 0 });
  assert.strictEqual(t.joins(), 2, "keyboard Enter/Space on the button after the gesture ended");
});

test("touch is unchanged: a vertical touch scroll (pointercancel, no click) makes 0 joins, a touch tap joins once", function () {
  var t = setup(CHAT);
  fire(t.win, t.p, "pointerdown", { pointerType: "touch", clientX: 100, clientY: 300 });
  for (var i = 1; i <= 10; i++) fire(t.win, t.p, "pointermove", { pointerType: "touch", clientX: 100, clientY: 300 - 17 * i });
  fire(t.win, t.p, "pointercancel", { pointerType: "touch" });
  assert.strictEqual(t.joins(), 0, "touch scroll");
  fire(t.win, t.enter, "pointerdown", { pointerType: "touch", clientX: 100, clientY: 300 });
  fire(t.win, t.enter, "pointerup", { pointerType: "touch", clientX: 101, clientY: 301 });
  fire(t.win, t.enter, "click", { clientX: 101, clientY: 301, detail: 1 });
  assert.strictEqual(t.joins(), 1, "touch tap on Enter room");
});

test("every other card control ignores the post-drag click too (chat card and a non-chat card)", function () {
  [CHAT, { id: "fact-hearts", type: "fact", title: "Hearts" }].forEach(function (spec) {
    var t = setup(spec);
    mouseDrag(t, t.other, 0, -200);
    mouseDrag(t, t.other, 30, -200);
    mouseDrag(t, t.other, -120, 0);
    assert.strictEqual(t.others(), 0, spec.type + ": a drag on a card control is not a click");
    tap(t, t.other);
    assert.strictEqual(t.others(), 1, spec.type + ": a tap on it still clicks once");
    assert.strictEqual(t.joins(), 0, spec.type + ": the control never opened the room");
  });
});

test("the 10px threshold: dragIsNotTap", function () {
  var t = setup(CHAT);
  var api = t.win.CognationCommuneSwipe;
  assert.strictEqual(typeof api.dragIsNotTap, "function", "dragIsNotTap is exported");
  assert.strictEqual(api.dragIsNotTap(10, 10), false);
  assert.strictEqual(api.dragIsNotTap(0, 11), true);
  assert.strictEqual(api.dragIsNotTap(-11, 0), true);
  assert.strictEqual(api.dragIsNotTap(7, -7), false);
});
