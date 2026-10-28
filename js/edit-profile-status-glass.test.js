/* Edit profile status glass (pairs with #244): the Add a professional page
   status box and the Calendar booking / editor lines use the scoped dark glass;
   errors show a plain line and log the raw text to the console only; the shared
   .commune-status rule is unchanged site-wide. */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

function fnSrc(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = tower.indexOf("{", start);
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}

/* 1. Shared .commune-status rule unchanged, and no new unscoped .commune-status rule. */
assert.ok(
  /\n\.commune-status \{\n  margin: 0 1rem 0\.5rem;\n  padding: 0\.65rem 0\.85rem;\n  border-radius: var\(--radius-sm\);\n  background: var\(--color-accent-dim\);\n  border: 1px solid rgba\(34, 211, 238, 0\.3\);\n  color: var\(--color-text\);\n  font-size: 0\.88rem;\n  line-height: 1\.45;\n  max-width: none;\n\}/.test(css),
  "site-wide .commune-status rule unchanged"
);
assert.ok(
  /\n\.commune-status\.is-error \{\n  background: rgba\(248, 113, 113, 0\.12\);\n  border-color: rgba\(248, 113, 113, 0\.4\);\n\}/.test(css),
  "site-wide .commune-status.is-error rule unchanged"
);
assert.strictEqual((css.match(/\n\.commune-status \{/g) || []).length, 1, "one shared .commune-status rule");

/* 2. Scoped glass block: its own selectors, before the Feed contrast block. */
var startAt = css.indexOf("/* Edit profile status glass (pairs with #244).");
var feedAt = css.indexOf("/* TOWER Feed contrast (Designer follow-up).");
assert.ok(startAt > 0 && startAt < feedAt, "glass block sits before the Feed contrast block");
var block = css.slice(startAt, feedAt);
var rules = [];
block.replace(/([^{}]+)\{([^}]*)\}/g, function (_, sel, body) {
  rules.push({ sel: sel.replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: body });
});
assert.strictEqual(rules.length, 2, "normal + error rule");
rules.forEach(function (r) {
  r.sel.split(",").forEach(function (one) {
    one = one.trim();
    assert.ok(/^#panel-tower /.test(one), "scoped to TOWER: " + one);
    assert.ok(/^#panel-tower \.tower-profile-edit-dropdown\.tower-profile-edit-dropdown \.commune-status/.test(one), "scoped to Edit profile: " + one);
    assert.ok(!/private/.test(one), "private Calendar card (white editor) untouched: " + one);
    assert.ok(/\[data-tower-(add-profile|cal-book|cal-editor)-status\]/.test(one), "names its own status box: " + one);
    assert.ok(!/data-tower-profile-status/.test(one), "leaves #244's [data-tower-profile-status] alone");
  });
});
var normal = rules[0], err = rules[1];
["add-profile", "cal-book", "cal-editor"].forEach(function (k) {
  assert.ok(normal.sel.indexOf("[data-tower-" + k + "-status]") > 0, k + " box gets the glass");
  assert.ok(err.sel.indexOf(".is-error[data-tower-" + k + "-status]") > 0, k + " box error state");
});
[
  /padding: 10px 12px/,
  /background: rgba\(18, 16, 38, 0\.92\)/,
  /-webkit-backdrop-filter: blur\(12px\)/,
  /[^-]backdrop-filter: blur\(12px\)/,
  /border: 1px solid rgba\(217, 210, 240, 0\.4\)/,
  /border-radius: 8px/,
  /color: #f7f9ff/,
  /-webkit-text-fill-color: #f7f9ff/,
  /font-size: 14px/,
].forEach(function (re) {
  assert.ok(re.test(normal.body), "glass value " + re);
});
assert.ok(/border: 1px solid rgba\(232, 138, 153, 0\.7\)/.test(err.body), "error border #e88a99 at 70%");
assert.strictEqual(normal.sel.split(",").length, 3, "three boxes");
assert.ok(!/background|color:/.test(err.body), "error keeps the same glass and text");
assert.ok(!/#ed9300|yellow|amber|gold|accent-dim\)/i.test(block.replace(/\/\*[\s\S]*?\*\//g, "")), "no yellow / brown in the block");

/* 3. Friendly lines: raw error text never reaches the box. */
var fctx = {};
vm.createContext(fctx);
vm.runInContext(fnSrc("friendlyBookingError") + fnSrc("friendlyAddProfileError"), fctx);
assert.strictEqual(fctx.friendlyBookingError(new Error("Sign in to book a time.")), "Sign in to book a time.");
assert.strictEqual(fctx.friendlyBookingError(new Error("This calendar can't take bookings yet.")), "This calendar can't take bookings yet.");
assert.strictEqual(fctx.friendlyBookingError(new Error('permission denied for function request_hangout (SQLSTATE 42501)')), "Couldn't send the request. Try again.");
assert.strictEqual(fctx.friendlyBookingError(null), "Couldn't send the request. Try again.");
assert.strictEqual(fctx.friendlyAddProfileError(new Error("Sign in before creating a professional page.")), "Sign in to add a page.");
assert.strictEqual(fctx.friendlyAddProfileError(new Error('Handles can\'t start with "seed-".')), "That page handle isn't available. Change your handle and try again.");
assert.strictEqual(fctx.friendlyAddProfileError(new Error('duplicate key value violates unique constraint "profiles_handle_key"')), "That page handle isn't available. Change your handle and try again.");
assert.strictEqual(fctx.friendlyAddProfileError(new Error("JWT expired")), "Couldn't create your professional page. Try again.");

/* 4. Add a professional page: a failed create logs the raw error, the box shows the plain line. */
function el(attrs) {
  var e = {
    hidden: true, textContent: "", disabled: false, value: "", listeners: {},
    _classes: {},
    classList: {
      toggle: function (c, on) { if (on) e._classes[c] = true; else delete e._classes[c]; },
      remove: function (c) { delete e._classes[c]; },
      add: function (c) { e._classes[c] = true; },
      contains: function (c) { return !!e._classes[c]; },
    },
    addEventListener: function (t, fn) { e.listeners[t] = fn; },
    getAttribute: function (k) { return (attrs || {})[k] || null; },
    setAttribute: function () {},
  };
  return e;
}
var btn = el(), status = el();
var root = {
  querySelector: function (sel) {
    if (sel === "[data-tower-add-profile]") return btn;
    if (sel === "[data-tower-add-profile-status]") return status;
    return null;
  },
};
var logged = [];
var popup = { textContent: "", hidden: true, isError: false }, shownMsgs = [];
var RAW = 'duplicate key value violates unique constraint "profiles_pkey" (secret-ish detail)';
var actx = {
  console: {
    error: function () { logged.push(["error"].concat([].slice.call(arguments))); },
    warn: function () { logged.push(["warn"].concat([].slice.call(arguments))); },
    log: function () {},
  },
  Promise: Promise, Error: Error, String: String,
  location: { hash: "" }, document: {}, window: {},
  getSessionObject: function () { return { username: "riley" }; },
  usingRemoteSocial: function () { return true; },
  remoteSocial: function () { return { createProfessionalProfile: function () { return Promise.reject(new Error(RAW)); } }; },
  /* #157/#167: status lines moved from the inline box to the shared status popup.
     Record what the popup is asked to show (text + error flag) so the same rules are checked there. */
  showStatusPopup: function (msg, isError) { popup.textContent = msg ? String(msg) : ""; popup.hidden = !msg; popup.isError = !!isError; shownMsgs.push(popup.textContent); },
  syncAddProfileUi: function () {}, syncProfileKindToggle: function () {}, renderProfileChrome: function () {}, applyTowerSide: function () {},
};
/* #157 replaced the server hangout request with a local save. */
require("node:test")("booking local-save shows a fixed 'Booked.' / 'Couldn't save that time.' line", { todo: "Pending HH/Alexa ruling under no-localStorage-stubs rule" }, function () {
  assert.ok(/viewB\.bookStatus = saved \? "Booked\." : "Couldn't save that time\.";/.test(tower));
});
vm.createContext(actx);
vm.runInContext(fnSrc("friendlyAddProfileError") + fnSrc("initAddProfile"), actx);
actx.initAddProfile(root);
btn.listeners.click();
assert.strictEqual(popup.textContent, "Creating your professional page…");
setImmediate(function () {
  assert.strictEqual(popup.textContent, "Couldn't create your professional page. Try again.", "plain line in the status popup");
  assert.strictEqual(popup.hidden, false);
  assert.ok(popup.isError, "error state");
  assert.ok(shownMsgs.every(function (m) { return m.indexOf("duplicate key") < 0; }), "raw text never shown");
  assert.ok(/function showStatusPopup\(msg, isError/.test(tower) && /popup\.className = "status-popup" \+ \(isError \? " is-error" : ""\)/.test(tower), "real popup carries the error state");
  assert.ok(logged.some(function (l) { return l[0] === "error" && l[2] && l[2].message === RAW; }), "raw error goes to console.error");
  assert.strictEqual(btn.disabled, false);

  /* 5. Static: every other error path logs and shows a fixed line. */
  var add = fnSrc("initAddProfile");
  assert.ok(!/setSt\(gate\.reason/.test(add), "gate reason not shown");
  assert.ok(/console\.warn\("\[tower\] add page blocked", gate\.reason\)/.test(add), "gate reason logged");
  assert.ok(!/setSt\(result\.error/.test(add), "createProfile error not shown raw");
  assert.ok(/console\.warn\("\[tower\] add page failed", result\.error\)/.test(add), "createProfile error logged");
  assert.ok(!/error\.message\) \|\|/.test(add), "no raw error.message in the box");
  assert.ok(!/\? err\.message/.test(tower), "booking never shows err.message");
  assert.ok(!/bookStatus = [^;]*(err|error)\.message/.test(tower), "booking line never carries raw error text");
  var sched = fnSrc("renderSchedulerPanel");
  assert.ok(/'<p class="commune-status' \+ \(opts\.bookError \? " is-error" : ""\) \+ '" data-tower-cal-book-status'/.test(sched), "booking line gets is-error");
  assert.ok(/bookError: owner \? false : !!view\.bookError/.test(fnSrc("renderPublicCalendar")), "public calendar passes the error flag");
  console.log("edit-profile-status-glass: ok");
});
