/**
 * #242 follow-up (Oct 22): Reset layout restores widget positions and the
 * camera only. It keeps the owner's other visibility choices (it used to copy
 * DEFAULT_PUBLIC_WIDGETS over them, turning hidden widgets back on), and the
 * removal status lines no longer point at an Undo control the page does not have.
 * Run: node js/tower-reset-keeps-visibility.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function blockFrom(start) {
  var depth = 0, i = tower.indexOf("{", start);
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
function fnSrc(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  return blockFrom(start);
}
function constSrc(name) {
  var start = tower.indexOf("var " + name + " =");
  assert.ok(start > 0, name + " exists");
  return tower.slice(start, tower.indexOf(";", start) + 1);
}

/* 1. The Reset click handler. */
var resetAt = tower.indexOf('resetBtn.addEventListener("click", function () {');
assert.ok(resetAt > 0, "Reset layout handler exists");
var resetFn = blockFrom(tower.indexOf("function ()", resetAt));
assert.ok(!/DEFAULT_PUBLIC_WIDGETS/.test(resetFn), "Reset no longer copies DEFAULT_PUBLIC_WIDGETS over the owner's flags");
assert.ok(!/p\.publicWidgets\s*=/.test(resetFn), "Reset does not replace publicWidgets");
assert.ok(/setInstaxSwitch\(p, true\)|publicWidgets\.instax = true/.test(resetFn), "Reset still turns the camera on");
assert.ok(/p\.polaroidRemoved = false/.test(resetFn), "Reset still restores the Polaroid");
assert.ok(/p\.widgetLayout = \{\}/.test(resetFn), "Reset still restores positions");

/* 2. Run it: hidden widgets stay hidden, the camera comes back. */
var ctx = { saved: null, statusMsg: "" };
vm.createContext(ctx);
vm.runInContext([
  constSrc("PUBLIC_WIDGET_IDS"),
  "var DEFAULT_PUBLIC_WIDGETS = " + blockFrom(tower.indexOf("{", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS ="))) + ";",
  fnSrc("normalizePublicWidgets"), fnSrc("setInstaxSwitch"),
  "var profile = { _profileId: 'seed-0037', widgetLayout: { music: { x: 9 } }, polaroidRemoved: true,",
  "  publicWidgets: { identity: true, slogan: true, social: false, music: false, badges: false, friends: false, html: false, calendar: true, envelope: true, instax: false },",
  "  removedFriendPinIds: ['f1'], featuredFriendIds: ['f2'] };",
  "var TowerProfileStore = { get: function () { return profile; }, save: function (p) { saved = JSON.parse(JSON.stringify(p)); return true; } };",
  "function isTowerOwner() { return true; }",
  "function writeTopFriendLocal() {}",
  "function applyWidgetLayout() {} function applyPublicWidgets() {} function syncPublicWidgetsForm() {}",
  "function renderFriendPins() {} function renderBadgePins() {} function syncOwnerStickerHandles() {}",
  "function syncUndoButton() {} function setProfileStatusSafe(m) { statusMsg = m; }",
  "var root = {};",
  "var runReset = " + resetFn + ";",
  "runReset();",
].join("\n"), ctx);
var pw = ctx.saved.publicWidgets;
["social", "music", "badges", "friends", "html"].forEach(function (id) {
  assert.strictEqual(pw[id], false, id + " stays hidden after Reset");
});
["identity", "slogan", "calendar", "envelope"].forEach(function (id) {
  assert.strictEqual(pw[id], true, id + " stays shown after Reset");
});
assert.strictEqual(pw.instax, true, "camera is back on after Reset");
assert.strictEqual(ctx.saved.polaroidRemoved, false, "Polaroid back");
assert.strictEqual(Object.keys(ctx.saved.widgetLayout).length, 0, "positions reset");
assert.strictEqual(ctx.saved.removedFriendPinIds.length, 0, "removed friend pins come back");
assert.ok(!/Undo/.test(ctx.statusMsg), "reset status has no Undo");

/* 3. Removal status lines: no Undo (no Undo control renders on the page). */
var removeStart = tower.indexOf("var removeSelectedWidget = function");
assert.ok(removeStart > 0, "removeSelectedWidget exists");
var removeFn = blockFrom(removeStart);
var lines = removeFn.match(/setProfileStatusSafe\([^;]*\);/g) || [];
assert.ok(lines.length >= 7, "status lines found");
lines.forEach(function (l) {
  assert.ok(!/Undo/.test(l), "no Undo in: " + l);
});
assert.ok(removeFn.indexOf('"Camera removed. Reset layout to restore."') > 0, "camera copy");
assert.ok(removeFn.indexOf('"Friend pin removed. Reset layout to restore."') > 0, "friend pin copy (Reset clears removed pins)");
assert.ok(removeFn.indexOf('"Badge pin removed."') > 0, "badge copy (Reset keeps badgeVisibility)");
assert.ok(removeFn.indexOf('"Emoji removed."') > 0, "emoji copy (Reset does not bring stickers back)");
assert.ok(removeFn.indexOf('"Quote removed."') > 0, "quote copy (Reset does not bring quotes back)");
assert.ok(removeFn.indexOf('label + " removed. Show it again in Edit profile."') > 0, "generic copy for widgets the Edit profile list restores");
assert.ok(/hiddenWidgetRestorable\(id\) \?[^:]+: label \+ " removed\."/.test(removeFn), "plain copy for widgets it cannot restore");
assert.ok(removeFn.indexOf('"Polaroid removed') < 0 && removeFn.indexOf('label + " removed. Reset layout to restore."') > 0, "Polaroid keeps Reset copy");

/* 4. Edit profile > Show hidden widgets. */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var panelAt = html.indexOf("data-tower-profile-edit-panel");
var sectionAt = html.indexOf("data-tower-hidden-widgets ");
assert.ok(panelAt > 0 && sectionAt > panelAt && sectionAt < html.indexOf("</form>", panelAt), "section lives inside the owner-only Edit profile panel");
assert.ok(/data-tower-hidden-widgets hidden>/.test(html), "section starts hidden");

function el(tag) {
  return {
    tagName: tag, children: [], attrs: {}, hidden: false, textContent: "", className: "", listeners: {},
    classList: { remove: function () {}, add: function () {}, toggle: function () {} },
    set innerHTML(v) { this.children = []; }, get innerHTML() { return ""; },
    appendChild: function (c) { c.parent = this; this.children.push(c); return c; },
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener: function (t, fn) { this.listeners[t] = fn; },
    contains: function (n) { for (var x = n; x; x = x.parent) if (x === this) return true; return false; },
    closest: function (sel) {
      var m = /^\[([^\]]+)\]$/.exec(sel);
      for (var x = this; x; x = x.parent) if (m && x.attrs && m[1] in x.attrs) return x;
      return null;
    },
  };
}
var box = el("div"), list = el("div"), status = el("p");
box.querySelector = function (q) { return q === "[data-tower-hidden-widgets-list]" ? list : null; };
list.parent = box;
var timers = [];
var hctx = {
  saves: 0, owner: true, box: box, status: status, applied: 0,
  setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms, live: true }); return timers.length; },
  clearTimeout: function (t) { if (timers[t - 1]) timers[t - 1].live = false; },
};
function runTimers() { timers.forEach(function (t) { if (t.live) { t.live = false; t.fn(); } }); }
vm.createContext(hctx);
var hStart = tower.indexOf("var RESTORABLE_HIDDEN_WIDGETS =");
vm.runInContext([
  constSrc("PUBLIC_WIDGET_IDS"),
  "var DEFAULT_PUBLIC_WIDGETS = " + blockFrom(tower.indexOf("{", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS ="))) + ";",
  fnSrc("normalizePublicWidgets"),
  tower.slice(hStart, tower.indexOf("];", hStart) + 2),
  constSrc("OWNER_REMOVABLE_WIDGET_IDS"), fnSrc("ownerShownKey"), fnSrc("widgetRemovedByOwner"),
  "function isProTower() { return false; } function appliedMilestoneList() { return []; } function initTowerMusic() {}",
  fnSrc("hiddenWidgetRestorable"), fnSrc("hiddenWidgetsToShow"), "var HIDDEN_WIDGET_NOTICE_MS = 4000;", fnSrc("clearHiddenWidgetNotice"), fnSrc("renderHiddenWidgetsList"), fnSrc("setPublicWidgetVisible"),
  "var document = { createElement: function (t) { return mk(t); } };",
  "var profile = { slogan: 'Hi there', customHtml: '', publicWidgets: { identity: false, slogan: false, envelope: true, html: false, music: false, badges: false, calendar: true, social: false, friends: false } };",
  "var TowerProfileStore = { get: function () { return profile; }, save: function () { saves++; return true; } };",
  "function isTowerOwner() { return owner; }",
  "function applyPublicWidgets() { applied++; } function syncPublicWidgetsForm() {} function renderFriendPins() {} function renderBadgePins() {}",
  "var root = { querySelector: function (q) { return q === '[data-tower-hidden-widgets]' ? box : (q === '[data-tower-profile-status]' ? status : null); } };",
].join("\n"), hctx);
hctx.mk = el;
/* Visitors: nothing rendered. */
hctx.owner = false;
hctx.renderHiddenWidgetsList(hctx.root, hctx.profile);
assert.strictEqual(box.hidden, true, "hidden from visitors");
assert.strictEqual(list.children.length, 0, "no rows for visitors");
/* Owner: hidden widgets with content are listed; opening/rendering does not write. */
hctx.owner = true;
hctx.renderHiddenWidgetsList(hctx.root, hctx.profile);
var ids = list.children.map(function (r) { return r.children[1].getAttribute("data-tower-show-widget"); });
assert.strictEqual(ids.join(","), "identity,slogan", "lists hidden Name and Quote/slogan (html is empty; music/badges/calendar/social/friends are not flag-hidden)");
assert.strictEqual(box.hidden, false, "section shows when something is hidden");
assert.strictEqual(hctx.saves, 0, "render never saves");
/* Show flips only that flag; the notice takes that row's place. */
var before = JSON.parse(JSON.stringify(hctx.profile.publicWidgets));
var showBtn = list.children[1].children[1];
box.listeners.click({ target: showBtn, preventDefault: function () {} });
assert.strictEqual(hctx.saves, 1, "Show saves once");
var after = hctx.profile.publicWidgets;
Object.keys(before).forEach(function (k) {
  if (k === "slogan") assert.strictEqual(after[k], true, "slogan turned on");
  else assert.strictEqual(after[k], before[k], k + " unchanged by Show");
});
function kids() { return list.children.map(function (c) { return c.className; }).join(","); }
assert.strictEqual(kids(), "tower-hidden-widget-row,tower-hidden-widget-notice", "notice sits where the Quote / slogan row was");
var notice = list.children[1];
assert.strictEqual(notice.tagName, "p");
assert.strictEqual(notice.textContent, "Quote / slogan is showing again.", "notice copy");
assert.strictEqual(notice.getAttribute("role"), "status");
assert.strictEqual(status.textContent, "", "not written to the commune-status line under Add a professional page");
assert.strictEqual(box.hidden, false);
assert.strictEqual(timers.filter(function (t) { return t.live; }).length, 1, "one clear timer");
assert.strictEqual(timers[timers.length - 1].ms, 4000, "clears after 4s");
runTimers();
assert.strictEqual(kids(), "tower-hidden-widget-row", "notice gone after 4s; Name row stays");
assert.strictEqual(box.hidden, false, "section stays while Name is still hidden");
assert.strictEqual(hctx.saves, 1, "clearing the notice never saves");
/* Non-owner click does nothing. */
hctx.owner = false;
box.listeners.click({ target: list.children[0].children[1], preventDefault: function () {} });
assert.strictEqual(hctx.saves, 1, "no save for a non-owner click");
assert.strictEqual(hctx.profile.publicWidgets.identity, false, "identity still hidden");
hctx.owner = true;
/* Last hidden widget: the notice shows in its place, then the whole section hides. */
box.listeners.click({ target: list.children[0].children[1], preventDefault: function () {} });
assert.strictEqual(hctx.saves, 2, "Show Name saves once");
assert.strictEqual(hctx.profile.publicWidgets.identity, true);
assert.strictEqual(kids(), "tower-hidden-widget-notice", "only the notice is left");
assert.strictEqual(list.children[0].textContent, "Name is showing again.");
assert.strictEqual(box.hidden, false, "section stays up for the notice");
runTimers();
assert.strictEqual(list.children.length, 0);
assert.strictEqual(box.hidden, true, "last widget shown: section hides after the notice");
/* Edit profile close clears the notice early. */
hctx.profile.publicWidgets.envelope = false;
hctx.renderHiddenWidgetsList(hctx.root, hctx.profile);
box.listeners.click({ target: list.children[0].children[1], preventDefault: function () {} });
assert.strictEqual(kids(), "tower-hidden-widget-notice");
hctx.clearHiddenWidgetNotice(hctx.root);
assert.strictEqual(list.children.length, 0, "close clears the notice");
assert.strictEqual(box.hidden, true, "and hides the now-empty section");
assert.strictEqual(timers.filter(function (t) { return t.live; }).length, 0, "its timer is cancelled");
var setOpenAt = tower.indexOf("function setOpen(open) {");
assert.ok(/\} else \{[\s\S]*clearHiddenWidgetNotice\(root\);[\s\S]*panel\.hidden = true;/.test(blockFrom(setOpenAt)), "Edit profile close calls clearHiddenWidgetNotice");
/* Nothing hidden: section hides entirely; render still never writes. */
var savesNow = hctx.saves;
hctx.profile.publicWidgets = { identity: true, slogan: true, envelope: true, html: false };
hctx.renderHiddenWidgetsList(hctx.root, hctx.profile);
assert.strictEqual(box.hidden, true, "nothing hidden = no section");
assert.strictEqual(hctx.saves, savesNow, "still no write from render");

/* 5. Styles: #237 dark glass notice; Edit profile status line loses the brown accent-dim tint. */
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var noticeRule = /\.tower-hidden-widget-notice \{([^}]*)\}/.exec(css);
assert.ok(noticeRule, "notice rule");
[/background: rgba\(18, 16, 38, 0\.92\)/, /-webkit-backdrop-filter: blur\(12px\)/, /[^-]backdrop-filter: blur\(12px\)/, /border: 1px solid rgba\(217, 210, 240, 0\.4\)/,
 /color: #f7f9ff/, /font-size: 14px/, /border-radius: 8px/, /padding: 10px 12px/].forEach(function (re) {
  assert.ok(re.test(noticeRule[1]), "notice style " + re);
});
var statusRule = /\.tower-profile-edit-dropdown \.commune-status\[data-tower-profile-status\]:not\(\.is-error\) \{([^}]*)\}/.exec(css);
assert.ok(statusRule && /background: rgba\(18, 16, 38, 0\.92\)/.test(statusRule[1]), "Edit profile status line is dark glass");
assert.ok(/\.commune-status \{[^}]*background: var\(--color-accent-dim\)/.test(css), "site-wide .commune-status unchanged");

console.log("tower-reset-keeps-visibility: ok");
