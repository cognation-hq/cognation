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
console.log("echo-classroom-card-click.test.js: OK");
