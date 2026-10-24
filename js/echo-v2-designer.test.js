/**
 * ECHO #231 v2 (Designer, 2026-10-22 CT):
 * 1. Deck end hides Pass / Keep and the "Passed" status line.
 * 2. Centered "You're caught up." (#f7f9ff, 16px) over "New cards show up as people share." (#d9d2f0, 14px).
 * 3. "Professionals you might know" card hugs its content with 20px padding.
 * 4. › chevron (#d9d2f0 at 60%) on each know row; #ED9300 ring (existing --color-accent) on hover / focus.
 * 5. Why-line "Matched to your field and interests."; heading stays "Professionals you might know".
 * 6. Job title (#236 job_title, only when present) on its own line, #d9d2f0 14px (13px at <=390),
 *    one line with an ellipsis. Rows without a title stay one line.
 * Run: node js/echo-v2-designer.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

function rule(sel) {
  var i = css.indexOf(sel + " {");
  assert.ok(i >= 0, "rule present: " + sel);
  return css.slice(i, css.indexOf("}", i));
}

function memoryStorage() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function fakeEl() {
  var attrs = {};
  return {
    innerHTML: "", className: "",
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
    removeAttribute: function (k) { delete attrs[k]; },
    addEventListener: function () {}, querySelector: function () { return null; },
    querySelectorAll: function () { return []; }, appendChild: function () {}, style: {},
  };
}
function load(pages) {
  var local = memoryStorage();
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "demo" }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: 30, field: "Software", interests: ["software engineering"] }));
  var profiles = { ada: { id: "ada", kind: "personal", displayName: "Ada", friendIds: [] } };
  pages.forEach(function (p) { profiles[p.id] = p; });
  local.setItem("cognation.profiles.v1", JSON.stringify({ profiles: profiles }));
  var session = memoryStorage();
  session.setItem("cognation.commune.mode", "professional");
  var win = {};
  var ctx = vm.createContext({
    window: win,
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {}, createElement: function () { return fakeEl(); } },
    localStorage: local, sessionStorage: session, console: console,
    CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; },
    setTimeout: setTimeout, isFinite: isFinite, parseInt: parseInt,
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  });
  vm.runInContext(src, ctx);
  win.CognationCommuneSwipe.noteViewerSeedStatus(false);
  return win.CognationCommuneSwipe;
}
function pro(id, name, extra) {
  var p = { id: id, kind: "professional", handle: id, displayName: name, headline: "Software engineering team", accountKind: "real" };
  Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
  return p;
}

var LONG = "Principal Software Engineer, Distributed Systems and Developer Platform";
var api = load([
  pro("jordan", "Jordan", { job_title: LONG }),
  pro("riley", "Riley", { job_title: null }),
  pro("sky", "Sky"),
]);
var card = api.buildProfessionalLanes()["pro-know"][0];
var html = api.renderCard(card).innerHTML;

/* 5. Why-line + heading. */
assert.strictEqual(card.why, "Matched to your field and interests.", "why-line copy");
assert.ok(/Why you see this: Matched to your field and interests\./.test(html), "why-line rendered");
assert.ok(/data-type-mark="know">Professionals you might know</.test(html), "heading stays");

/* 6. Job title from job_title (#236) on a second line; absent / null -> one line, nothing invented. */
assert.ok(new RegExp('<span class="commune-pro-know-person">Jordan</span><span class="commune-pro-know-title" data-pro-know-title title="' + LONG + '">' + LONG + "</span>").test(html), "title on its own line");
assert.strictEqual((html.match(/data-pro-know-title/g) || []).length, 1, "only the row with a title has a title line");
assert.ok(/<span class="commune-pro-know-person">Riley<\/span><\/span>/.test(html), "null job_title: name only");
assert.ok(/<span class="commune-pro-know-person">Sky<\/span><\/span>/.test(html), "no job_title: name only");
assert.ok(html.indexOf("Software engineering team") < 0, "headline never used as a title");
assert.ok(html.indexOf("Jordan \u00b7 " + LONG + "</") < 0, "no 'Name · Title' single line");
var t = rule(".commune-pro-know-title");
assert.ok(/font-size: 14px/.test(t) && /color: #d9d2f0/.test(t), "title 14px #d9d2f0");
assert.ok(/white-space: nowrap/.test(t) && /overflow: hidden/.test(t) && /text-overflow: ellipsis/.test(t), "one line with ellipsis");
assert.ok(/@media \(max-width: 390px\) \{\s*\.commune-pro-know-title \{ font-size: 13px; \}/.test(css), "13px at <=390");

/* 4. Chevron + accent ring. */
assert.strictEqual((html.match(/<span class="commune-pro-know-chevron" aria-hidden="true">\u203a<\/span>/g) || []).length, 3, "one chevron per row");
var ch = rule(".commune-pro-know-chevron");
assert.ok(/color: #d9d2f0/.test(ch) && /opacity: 0\.6/.test(ch), "chevron #d9d2f0 at 60%");
var ringIdx = css.indexOf(".commune-pro-know-open:hover,\n.commune-pro-know-open:focus-visible {");
assert.ok(ringIdx >= 0, "hover + focus-visible rule");
var ring = css.slice(ringIdx, css.indexOf("}", ringIdx));
assert.ok(/border-color: var\(--color-accent\)/.test(ring) && /box-shadow: 0 0 0 2px var\(--color-accent\)/.test(ring), "#ED9300 ring via --color-accent");
assert.ok(/--color-accent: #ED9300;/.test(css), "existing token");

/* 3. Hugging card, 20px padding. */
var k = rule('#panel-commune .commune-card[data-card-type="pro-know"]');
assert.ok(/position: relative/.test(k) && /padding: 20px/.test(k), "know card hugs content, 20px padding");
assert.ok(/\.commune-swipe-deck:has\(\.commune-card\[data-card-type="pro-know"\]\) \{\s*min-height: 0;/.test(css), "deck drops its fixed height for the know card");

/* 1 + 2. Deck end. */
assert.ok(/'<p class="commune-swipe-empty commune-swipe-end-title">You\\'re caught up\.<\/p>' \+\s*'<p class="commune-swipe-end-sub">New cards show up as people share\.<\/p>'/.test(src), "two-line end note");
assert.ok(/classList\.add\("is-deck-end"\);\s*setStatus\(""\);/.test(src), "end state flags the shell and clears the status line");
assert.ok(/classList\.remove\("is-deck-end"\)/.test(src), "flag clears when a card is back");
assert.ok(/\.is-deck-end \.commune-swipe-actions,\n\.is-deck-end \[data-commune-swipe-status\] \{\s*display: none !important;/.test(css), "Pass / Keep and status hidden at deck end");
var e = rule(".commune-swipe-end");
assert.ok(/justify-content: center/.test(e) && /align-items: center/.test(e) && /text-align: center/.test(e), "centered");
var et = rule(".commune-swipe-end .commune-swipe-end-title");
assert.ok(/color: #f7f9ff/.test(et) && /font-size: 16px/.test(et), "title #f7f9ff 16px");
var es = rule(".commune-swipe-end .commune-swipe-end-sub");
assert.ok(/color: #d9d2f0/.test(es) && /font-size: 14px/.test(es), "sub #d9d2f0 14px");

/* House rules on the new CSS. */
var added = css.slice(css.indexOf("/* Professionals you might know: up to 3 rows"), css.indexOf("/* ===== Shared pipe-switch sides"));
assert.ok(!/#1c1630/i.test(added), "never #1c1630");
assert.ok(!/--[a-z-]+\s*:/.test(added), "no new custom property (token) in the know / deck-end CSS");
assert.ok(!/#ff(f|e|d)[0-9a-f]{3}\b|yellow/i.test(added.replace(/#f7f9ff/gi, "")), "no yellow");

console.log("echo-v2-designer ok");
