/**
 * Calendar is its own card under the bio card (Pro + Personal, visitors).
 * Alexa: "calender should be a separate widget from the page bio widget".
 * Run: node js/pro-calendar-widget.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

function grab(src, a, b) {
  var i = src.indexOf(a), j = src.indexOf(b, i + 1);
  assert.ok(i !== -1 && j > i, "found " + a);
  return src.slice(i, j);
}

/* 1. Markup: the calendar card is a stage widget, not inside the bio card. */
var avatarStart = html.indexOf('data-tower-widget="avatar"');
var calStart = html.indexOf('data-tower-widget="visitor-calendar"');
var sloganStart = html.indexOf('data-tower-widget="slogan"');
assert.ok(avatarStart > 0 && calStart > avatarStart && sloganStart > calStart, "calendar card sits after the bio card, before the slogan");
assert.strictEqual((html.match(/data-tower-visitor-calendar/g) || []).length, 1, "one calendar card");
var calTag = html.slice(html.lastIndexOf("<section", calStart), html.indexOf(">", calStart) + 1);
assert.ok(/tower-sticker--visitor-calendar/.test(calTag) && /tower-visitor-calendar/.test(calTag), "keeps the old calendar class (same colours) + its own sticker class");
assert.ok(/\shidden[\s>]/.test(calTag), "hidden until a visitor view renders it");
var calSection = html.slice(html.lastIndexOf("<section", calStart), html.indexOf("</section>", calStart));
["data-tower-visitor-sessions", "data-tower-cal-visitor", "data-tower-cal-visitor-body", 'href="/calendar.html"', "Cognation Calendar"].forEach(function (k) {
  assert.ok(calSection.indexOf(k) !== -1, "calendar card keeps " + k);
});
assert.ok(calSection.indexOf("data-tower-sticker-handle") === -1, "no drag handle: no new drag behaviour");
/* Not nested in the avatar sticker: the avatar block closes before the calendar. */
var avatarBlock = grab(html, 'data-tower-widget="avatar"', 'data-tower-widget="visitor-calendar"');
assert.ok(avatarBlock.indexOf("data-tower-visitor-calendar") === -1, "no calendar inside the bio card");
assert.ok(/data-tower-profile-edit/.test(avatarBlock) && /tower-profile-actions/.test(avatarBlock), "bio card keeps follow + Edit profile");
assert.ok(/data-tower-edit-calendar/.test(html) && /data-tower-widget="calendar"/.test(html), "owner calendar stays in Edit profile");

/* 2. Default layout, Personal AND Professional: one full row right under the bio card. */
var code = grab(tower, "  var SPAWN_GAP = 24;", "  /* Place every visible, unplaced widget");
var ctx = vm.createContext({});
vm.runInContext(code + "\nthis.SPAWN_ROWS = SPAWN_ROWS; this.packSpawn = packSpawn; this.VISITOR_CALENDAR_ID = VISITOR_CALENDAR_ID;", ctx);
assert.strictEqual(ctx.VISITOR_CALENDAR_ID, "visitor-calendar");
["personal", "professional"].forEach(function (kind) {
  var rows = JSON.parse(JSON.stringify(ctx.SPAWN_ROWS[kind]));
  var flat = rows.map(function (r) { return r.join(","); });
  var i = flat.indexOf("visitor-calendar");
  assert.ok(i > 0, kind + ": calendar card in the default rows");
  assert.strictEqual(flat[i - 1], "slogan", kind + ": right after the bio card (avatar, name, slogan)");
  assert.strictEqual(rows[i].length, 1, kind + ": calendar card has its own full row");
  /* Every widget from main is still in the defaults (nothing removed). */
  var main = kind === "personal"
    ? ["avatar", "identity", "slogan", "music", "friends", "__socials__", "badges", "calendar", "polaroid", "html", "instax"]
    : ["avatar", "identity", "slogan", "youtube", "__socials__", "badges", "followers", "calendar", "html"];
  var ids = [].concat.apply([], rows);
  main.forEach(function (id) { assert.ok(ids.indexOf(id) !== -1, kind + " still spawns " + id); });
  [[1120, false], [390, true]].forEach(function (cfg) {
    var sz = {};
    ids.forEach(function (id) { sz[id] = { w: 300, h: 100 }; });
    sz["visitor-calendar"] = { w: 300, h: 430 };
    var o = ctx.packSpawn(rows.filter(function (r) { return r[0] !== "__socials__"; }), sz, [], cfg[0], cfg[1]);
    assert.strictEqual(o["visitor-calendar"].x, o.avatar.x, kind + " " + cfg[0] + ": lines up with the bio card");
    assert.strictEqual(o["visitor-calendar"].y, o.slogan.y + 100 + 24, kind + " " + cfg[0] + ": one widget gap under the bio card");
  });
});

/* 3. Saved layouts: the card is seated under a saved bio card, never saved itself. */
var mixed = grab(tower, "    var avatarEl = stage.querySelector('[data-tower-widget=\"avatar\"]');", "    var stageH = Math.max(");
assert.ok(/isPlacedPos\(layout, "avatar"\)\) calSeat = el;/.test(mixed), "saved bio card: calendar seated under it");
assert.ok(/y: avatarEl\.offsetTop \+ avatarEl\.offsetHeight \+ SPAWN_GAP/.test(mixed), "one widget gap under the saved bio card");
assert.ok(/--visitor-cal-w", aw \+ "px"/.test(mixed), "same width as the bio card");
assert.ok(/occupied\.push\(\{ x: calPos\.x/.test(mixed), "other unplaced widgets pack around it");
var freeze = grab(tower, "  function freezeSpawnedWidgets(", "  function ");
assert.ok(/el\.hidden/.test(freeze), "hidden cards (owner view) are never frozen into a save");
var lift = grab(tower, "  function ensureStickersOnStage(", "  function normalizePolaroidScale");
assert.ok(/id === "calendar"/.test(lift), "owner Edit-profile calendar is still never lifted to the stage");

/* 4. Data + owner/visitor rules unchanged. */
var render = grab(tower, "  function renderVisitorCalendar(", "  function respawnVisitorCalendar(");
assert.ok(/if \(!p \|\| isTowerOwner\(p\)\) \{\s*box\.hidden = true;/.test(render), "owner never sees the visitor card");
assert.ok(/api\.forHost\(p\._profileId \|\| p\.id\)/.test(render), "sessions from the same source");
assert.ok(/sessionsBox\.hidden = !pro;/.test(render), "Classroom sessions only on Pro");
assert.ok(/Classroom sessions/.test(render) && /No sessions booked yet\./.test(render), "same copy");
assert.ok(/\[data-tower-is-owner="true"\] \[data-tower-visitor-calendar\]\s*\{\s*display:\s*none !important;?\s*\}/.test(css), "owner-hide CSS kept");

/* 5. CSS: own glass card, bio card order on saved layouts, no yellow. */
var cardCss = grab(css, "/* Calendar is its own card directly under the bio card", "/* Cream follow-up");
assert.ok(/background: rgba\(18,16,38,\.92\)/.test(cardCss) && /border-radius: 18px/.test(cardCss), "glass card");
assert.ok(/width: var\(--visitor-cal-w/.test(cardCss), "bio card width");
assert.ok(/\[hidden\] \{ display: none !important; \}/.test(cardCss), "hidden really hides");
assert.ok(/data-tower-is-owner="false"\][^{]*\.tower-sticker--identity \{ grid-row: 2;/.test(cardCss), "visitor: name under the photo");
assert.ok(/data-tower-is-owner="false"\][^{]*\.tower-profile-actions \{ grid-row: 3;/.test(cardCss), "visitor: + follow under the name");
assert.ok(/data-tower-is-owner="false"\][^{]*\.tower-under-photo \{ grid-row: 4;/.test(cardCss), "visitor: Mutual friends + message last");
assert.ok(!/#ED9300|#ed9300|yellow|#ffd|#ff0/i.test(cardCss), "no yellow");
assert.ok(!/localStorage/.test(render) && !/[Dd]emo/.test(calSection), "no localStorage stubs, no demo copy");

console.log("pro-calendar-widget.test.js: ok");
