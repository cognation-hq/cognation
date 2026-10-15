/**
 * ECHO Classroom cards open when the card itself is clicked or tapped
 * (not only the "Open session" button). Controls keep their own action, a
 * swipe drag is not a tap, and pointerdown never swallows the button click.
 * Run: node js/echo-classroom-card-click.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");

function noop() {}
var store = {};
var ctx = {
  console: console, setTimeout: noop, clearTimeout: noop, setInterval: noop,
  localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
  sessionStorage: { getItem: function () { return null; }, setItem: noop, removeItem: noop },
  location: { hash: "" },
  CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
  document: {
    readyState: "loading", addEventListener: noop, dispatchEvent: noop,
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
  },
};
ctx.window = ctx;
ctx.addEventListener = noop;
vm.runInNewContext(src, ctx);
var api = ctx.CognationCommuneSwipe;
assert.ok(api && typeof api.wireClassroomCardClick === "function", "helper exported");

function fakeCard() {
  var handlers = [];
  return { addEventListener: function (t, fn) { if (t === "click") handlers.push(fn); },
           click: function (target) { handlers.forEach(function (fn) { fn({ target: target }); }); } };
}
var body = { closest: function () { return null; } };
var button = { closest: function () { return {}; } };

var opened = [];
var el = fakeCard();
api.wireClassroomCardClick(el, { id: "class-voting" }, function (id) { opened.push(id); });
el.click(body);
assert.deepStrictEqual(opened, ["class-voting"], "click on card body opens that session");
el.click(button);
assert.strictEqual(opened.length, 1, "click on a control inside the card is left to the control");

/* Card wiring and pointerdown guard (source contract). */
assert.ok(/card\.type === TYPE\.CLASSROOM\) \{\s*wireClassroomCardClick\(el, card, openClassroom\)/.test(src), "classroom cards wired");
assert.ok(/function onPointerDown[\s\S]{0,200}closest\("button, a, input/.test(src), "pointerdown skips buttons, so Open session still fires");
assert.ok(!/function onPointerDown[\s\S]{0,400}preventDefault/.test(src), "pointerdown never cancels the click");
assert.ok(/state\.lastDragDx = dx;/.test(src), "drag distance recorded so a swipe is not a tap");

/* Designer LOOK: Classroom and Auction open in the chat-room full view. */
assert.ok(typeof api.openAuction === "function", "openAuction exported");
assert.ok(/card\.type === PRO\.AUCTION\) \{\s*wireClassroomCardClick\(el, card, function \(\) \{ openAuction\(card, true\); \}\)/.test(src), "auction cards wired to openAuction");
assert.ok(/function paintCardView[\s\S]{0,200}querySelector\("\[data-commune-room\]"\)/.test(src), "card view reuses the chat-room panel");
assert.ok(/function paintClassroom[\s\S]{0,500}paintCardView\("classroom"/.test(src), "classroom paints the chat-room view");
assert.ok(/function openAuction[\s\S]{0,300}paintCardView\("auction"/.test(src), "auction paints the chat-room view");
assert.ok(/state\.cardView[\s\S]{0,40}closeCardView\(\)/.test(src), "Back to deck closes the card view");
assert.ok(/Math\.abs\(state\.lastDragDx \|\| 0\) >= 10\) return;/.test(src), "a drag of 10px or more stays a swipe");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
assert.ok(/\.commune-room\[data-commune-room-view\] \[data-commune-room-input\]/.test(css), "no chat compose in Classroom/Auction view");

/* Designer nit: deck swipe chrome (Pass/Keep, hint, deck) hidden while open, restored on close. */
assert.ok(/function showSubpanel[\s\S]{0,900}actions\.hidden = on;[\s\S]{0,300}"\.commune-swipe-hint", "\[data-commune-dots\]", "\[data-commune-index\]"[\s\S]{0,150}chrome\.hidden = on;/.test(src), "Pass/Keep, hint, dots and card counter follow the open view");
assert.ok(/\.commune-swipe-actions\[hidden\],\s*\.commune-swipe-hint\[hidden\],\s*\.commune-swipe-deck\[hidden\],\s*\.commune-swipe-dots\[hidden\],\s*\[data-commune-index\]\[hidden\]\s*\{\s*display: none !important;/.test(css), "[hidden] beats display:grid on swipe chrome");
console.log("echo-classroom-card-click.test.js: OK");
