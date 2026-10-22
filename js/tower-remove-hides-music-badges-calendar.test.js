/**
 * Oct 22: Remove really hides Music, Badges and Calendar. Their old flags
 * follow content (the page turns music/badges off when empty, and that copy
 * gets saved), so an owner's Remove is its own switch, publicWidgets
 * "shown.<id>": false. It hides the widget for the owner and visitors, lists
 * it in Edit profile > Show hidden widgets, and only Show / Undo turns it back
 * on. Nothing on load writes it; Reset layout keeps it.
 * Run: node js/tower-remove-hides-music-badges-calendar.test.js
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
var hStart = tower.indexOf("var RESTORABLE_HIDDEN_WIDGETS =");

function fakeEl(id) {
  var cls = {};
  return {
    id: id, hidden: false, attrs: {},
    classList: {
      add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
      toggle: function (c, on) { if (on) cls[c] = 1; else delete cls[c]; },
      contains: function (c) { return !!cls[c]; },
    },
    querySelector: function () { return null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
  };
}

var ctx = { saves: 0, owner: true, musicInits: 0 };
vm.createContext(ctx);
vm.runInContext([
  constSrc("PUBLIC_WIDGET_IDS"),
  "var DEFAULT_PUBLIC_WIDGETS = " + blockFrom(tower.indexOf("{", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS ="))) + ";",
  fnSrc("normalizePublicWidgets"),
  constSrc("OWNER_REMOVABLE_WIDGET_IDS"), fnSrc("ownerShownKey"), fnSrc("widgetRemovedByOwner"),
  fnSrc("isProTower"), fnSrc("stripProMusic"), fnSrc("visibleMusicSkin"), fnSrc("appliedMilestoneList"),
  "var milestoneByProfile = {};",
  fnSrc("pruneEmptyPublicWidgetsInProfile"), fnSrc("applyPublicWidgetsInner"),
  tower.slice(hStart, tower.indexOf("];", hStart) + 2),
  fnSrc("hiddenWidgetRestorable"), fnSrc("hiddenWidgetsToShow"), fnSrc("setPublicWidgetVisible"),
  "function profileHasSocialLinks() { return false; } function profileHasVisibleBadges() { return false; }",
  "function loadAppliedMilestones() {} function socialNetIdFromWidget() { return ''; } function optedInSocialNetIds() { return []; }",
  "function showYoutubeSticker() {} function resolveTopFriendIds() { return []; }",
  "function isTowerOwner() { return owner; }",
  "function applyPublicWidgets(root, p) { applyPublicWidgetsInner(root, p); } function syncPublicWidgetsForm() {}",
  "function renderFriendPins() {} function renderBadgePins() {} function initTowerMusic() { musicInits++; }",
  "var profile;",
  "var TowerProfileStore = { get: function () { return profile; }, save: function () { saves++; return true; } };",
].join("\n"), ctx);

function makeRoot() {
  var els = {};
  ctx.PUBLIC_WIDGET_IDS.forEach(function (id) { els[id] = fakeEl(id); });
  var visitorCal = fakeEl("visitor-calendar");
  return {
    els: els, visitorCal: visitorCal,
    querySelector: function (q) {
      if (q === "[data-tower-visitor-calendar]") return visitorCal;
      var m = /^\[data-tower-widget="([^"]+)"\]$/.exec(q);
      return m ? els[m[1]] || null : null;
    },
  };
}
function withContent(pw) {
  return {
    _profileId: "aaaaaaaa-1111-4111-8111-111111111111",
    slogan: "Hi", customHtml: "", musicSkin: "classic", musicEnabled: true, musicUrl: "https://example.com/a.mp3",
    awardedBadges: [{ id: "m1", kind: "milestone", applied: true, title: "First post" }],
    publicWidgets: pw,
  };
}
var THREE = ["music", "badges", "calendar"];

/* 1. normalize keeps the owner's switch as saved and never invents it. */
var n = ctx.normalizePublicWidgets({ "shown.music": false, "shown.badges": true, "shown.bogus": false });
assert.strictEqual(n["shown.music"], false);
assert.strictEqual(n["shown.badges"], true);
assert.ok(!("shown.calendar" in n), "no key = shown");
assert.ok(!("shown.bogus" in n), "only the three ids");
assert.ok(!Object.keys(ctx.normalizePublicWidgets({})).some(function (k) { return /^shown\./.test(k); }), "old rows unchanged");

/* 2. With content, before this change: old flags off (as prune saves them) still show. */
ctx.owner = true;
ctx.profile = withContent({ music: false, badges: false, calendar: false });
var root = makeRoot();
ctx.applyPublicWidgetsInner(root, ctx.profile);
assert.strictEqual(root.visitorCal.hidden, false, "visitors' Calendar card untouched without the owner switch");
THREE.forEach(function (id) {
  assert.strictEqual(root.els[id].hidden, false, id + ": old content-driven flag alone does not hide it (no surprise hide on load)");
});
assert.ok(!Object.keys(ctx.profile.publicWidgets).some(function (k) { return /^shown\./.test(k); }), "load / render never writes the owner switch");
assert.strictEqual(ctx.saves, 0, "render never saves");

/* 3. Owner's switch off hides all three, for the owner and for visitors, even with content. */
[true, false].forEach(function (isOwner) {
  ctx.owner = isOwner;
  ctx.profile = withContent({ "shown.music": false, "shown.badges": false, "shown.calendar": false });
  var r = makeRoot();
  ctx.applyPublicWidgetsInner(r, ctx.profile);
  ["music", "badges"].forEach(function (id) {
    assert.strictEqual(r.els[id].hidden, true, id + " hidden for " + (isOwner ? "owner" : "visitor"));
    assert.ok(r.els[id].classList.contains("is-widget-off"));
  });
  /* Calendar: the sticker in Edit profile > Calendar stays (sessions, bookings);
     the visitors' Calendar card is what goes. */
  assert.strictEqual(r.els.calendar.hidden, false, "Edit profile Calendar sticker stays");
  assert.strictEqual(r.visitorCal.hidden, true, "visitors' Calendar card hidden while Calendar is removed");
  assert.strictEqual(r.els.identity.hidden, false, "others untouched");
  /* prune ran on this profile (load path): the owner's off survives it. */
  THREE.forEach(function (id) { assert.strictEqual(ctx.profile.publicWidgets["shown." + id], false, id + " off survives prune"); });
});
/* prune with empty music / no badges still never writes the switch. */
var empty = { musicSkin: "none", publicWidgets: { "shown.badges": false } };
ctx.pruneEmptyPublicWidgetsInProfile(empty);
assert.ok(!("shown.music" in empty.publicWidgets), "prune never sets shown.music");
assert.strictEqual(empty.publicWidgets["shown.badges"], false, "prune keeps shown.badges");
assert.ok(!/shown\.|ownerShownKey/.test(fnSrc("pruneEmptyPublicWidgetsInProfile")), "prune does not touch the owner switch");

/* 4. Remove (setPublicWidgetVisible off) flips only the owner switch; Show flips it back. */
ctx.owner = true;
THREE.forEach(function (id) {
  ctx.profile = withContent({ music: false, badges: true, calendar: true });
  ctx.saves = 0;
  var r = makeRoot();
  /* Baseline after the page's usual in-memory prune (empty html, no links, no friends). */
  ctx.pruneEmptyPublicWidgetsInProfile(ctx.profile);
  var before = JSON.parse(JSON.stringify(ctx.profile.publicWidgets));
  ctx.setPublicWidgetVisible(r, id, false);
  assert.strictEqual(ctx.saves, 1, id + ": Remove saves once");
  var after = ctx.profile.publicWidgets;
  Object.keys(before).forEach(function (k) { assert.strictEqual(after[k], before[k], id + " Remove leaves " + k); });
  assert.strictEqual(after["shown." + id], false, id + " switch off");
  if (id === "calendar") {
    assert.strictEqual(r.els.calendar.hidden, false, "Edit profile Calendar sticker stays on Remove");
    assert.strictEqual(r.visitorCal.hidden, true, "visitors' Calendar card hidden right away");
  } else assert.strictEqual(r.els[id].hidden, true, id + " hidden right away");
  var listed = ctx.hiddenWidgetsToShow(ctx.profile).map(function (w) { return w.id; });
  assert.strictEqual(listed.join(","), id, id + " listed in Show hidden widgets");
  var snap = JSON.parse(JSON.stringify(after));
  ctx.setPublicWidgetVisible(r, id, true);
  assert.strictEqual(ctx.saves, 2, id + ": Show saves once");
  Object.keys(snap).forEach(function (k) {
    if (k === "shown." + id) assert.strictEqual(ctx.profile.publicWidgets[k], true, id + " switch back on");
    else assert.strictEqual(ctx.profile.publicWidgets[k], snap[k], id + " Show leaves " + k);
  });
  assert.strictEqual(r.els[id].hidden, false, id + " visible again");
  assert.strictEqual(ctx.hiddenWidgetsToShow(ctx.profile).length, 0, id + " no longer listed");
});
assert.ok(ctx.musicInits >= 2, "Music player stops on Remove and is rebuilt on Show");
/* Non-owner: no write. */
ctx.owner = false;
ctx.saves = 0;
ctx.profile = withContent({});
ctx.setPublicWidgetVisible(makeRoot(), "music", false);
assert.strictEqual(ctx.saves, 0);
assert.ok(!("shown.music" in ctx.profile.publicWidgets));
assert.strictEqual(ctx.hiddenWidgetsToShow(withContent({ "shown.music": false })).length, 0, "visitors get no list");
ctx.owner = true;

/* 5. The list: labels and order; Pro has no music; Badges needs an applied milestone. */
ctx.profile = withContent({ "shown.music": false, "shown.badges": false, "shown.calendar": false, identity: false });
assert.strictEqual(ctx.hiddenWidgetsToShow(ctx.profile).map(function (w) { return w.label; }).join(","), "Name,Music,Badges,Calendar");
var pro = withContent({ "shown.music": false, "shown.calendar": false });
pro._profileKind = "professional";
assert.strictEqual(ctx.hiddenWidgetsToShow(pro).map(function (w) { return w.id; }).join(","), "calendar", "Pro: no Music row");
var noBadges = withContent({ "shown.badges": false });
noBadges.awardedBadges = [];
assert.strictEqual(ctx.hiddenWidgetsToShow(noBadges).length, 0, "Badges row only with something to show");

/* 6. Removal line ends "— Show it again in Edit profile." for all three. */
var removeStart = tower.indexOf("var removeSelectedWidget = function");
var removeFn = blockFrom(removeStart);
assert.ok(removeFn.indexOf('label + " removed — Show it again in Edit profile."') > 0);
THREE.forEach(function (id) { assert.ok(ctx.hiddenWidgetRestorable(id), id + " gets the Show-it-again copy"); });
assert.ok(!ctx.hiddenWidgetRestorable("friends") && !ctx.hiddenWidgetRestorable("social"));

/* 7. Reset layout keeps the switches. */
var resetAt = tower.indexOf('resetBtn.addEventListener("click", function () {');
var resetFn = blockFrom(tower.indexOf("function ()", resetAt));
var rctx = { saved: null };
vm.createContext(rctx);
vm.runInContext([
  constSrc("PUBLIC_WIDGET_IDS"),
  "var DEFAULT_PUBLIC_WIDGETS = " + blockFrom(tower.indexOf("{", tower.indexOf("var DEFAULT_PUBLIC_WIDGETS ="))) + ";",
  fnSrc("normalizePublicWidgets"), fnSrc("setInstaxSwitch"),
  "var profile = { _profileId: 'seed-0037', widgetLayout: {}, publicWidgets: { 'shown.music': false, 'shown.badges': false, 'shown.calendar': false, instax: false } };",
  "var TowerProfileStore = { get: function () { return profile; }, save: function (p) { saved = JSON.parse(JSON.stringify(p)); return true; } };",
  "function isTowerOwner() { return true; } function writeTopFriendLocal() {}",
  "function applyWidgetLayout() {} function applyPublicWidgets() {} function syncPublicWidgetsForm() {}",
  "function renderFriendPins() {} function renderBadgePins() {} function syncOwnerStickerHandles() {}",
  "function syncUndoButton() {} function setProfileStatusSafe() {}",
  "var root = {};",
  "(" + resetFn + ")();",
].join("\n"), rctx);
THREE.forEach(function (id) { assert.strictEqual(rctx.saved.publicWidgets["shown." + id], false, id + " stays removed after Reset"); });
assert.strictEqual(rctx.saved.publicWidgets.instax, true, "camera back");

/* 8. The other places that showed these widgets respect the switch. */
var cal = fnSrc("renderPublicCalendar");
assert.ok(/calRoot\.hidden = false;/.test(cal), "Edit profile Calendar sticker always renders (owners manage sessions and bookings there)");
assert.ok(cal.indexOf("widgetRemovedByOwner") < 0, "Remove does not empty Edit profile > Calendar");
assert.ok(tower.indexOf('querySelector("[data-tower-edit-calendar]")') < 0, "Edit profile > Calendar entry is never hidden by Remove");
assert.ok(/if \(widgetRemovedByOwner\(p, "calendar"\)\) \{\s*box\.hidden = true;[\s\S]{0,80}return;\s*\}\s*box\.hidden = false;/.test(fnSrc("renderVisitorCalendar")), "visitors' Calendar card stays hidden while removed");
var music = fnSrc("initTowerMusic");
assert.ok(/if \(widgetRemovedByOwner\(p, "music"\)\) \{[\s\S]*?clearTowerAudio\(audio\);[\s\S]*?showMusicSticker\(root, false, p\);[\s\S]*?return;/.test(music), "player cleared when removed");
assert.ok(/if \(on && widgetRemovedByOwner\(p \|\| TowerProfileStore\.get\(\), "music"\)\) on = false;/.test(fnSrc("showMusicSticker")));
/* Badge upload turns the old flag on but never the owner's switch. */
assert.ok(/p\.publicWidgets\.badges = true;/.test(tower) && !/\["shown\.badges"\]\s*=\s*true/.test(tower));
/* Only Remove / Show (setPublicWidgetVisible) and the form-read carry-over assign the switch. */
var assigns = tower.match(/\[ownerShownKey\([a-z]+\)\]\s*=(?!=)/g) || [];
assert.strictEqual(assigns.length, 2, "two writers: setPublicWidgetVisible and the form-read keep");

/* 9. The switch rides in the layout row (and changes its signature, so Remove uploads). */
var sync = require("./tower-layout-sync.js");
var cw = sync._cleanWidgets({ publicWidgets: { "shown.music": false, music: true } });
assert.strictEqual(cw.publicWidgets["shown.music"], false, "row keeps shown.music");
assert.notStrictEqual(sync._widgetsSignature({ publicWidgets: { "shown.calendar": false } }), sync._widgetsSignature({ publicWidgets: {} }), "Remove is an upload-worthy change");

console.log("tower-remove-hides-music-badges-calendar: ok");
