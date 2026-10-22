/* Edit profile > Calendar (owner): day heading "Thu, Oct 22" instead of
   "On 2026-10-22", display only; headers in Oswald with no new font. */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var childProcess = require("child_process");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function fnSrc(name) {
  var start = tower.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " exists");
  var i = tower.indexOf("{", start), depth = 0;
  for (; i < tower.length; i++) {
    if (tower[i] === "{") depth++;
    else if (tower[i] === "}" && --depth === 0) break;
  }
  return tower.slice(start, i + 1);
}
var src = fnSrc("formatCalendarDayLabel");
function load() {
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.formatCalendarDayLabel;
}
var fmt = load();

assert.strictEqual(fmt("2026-10-22"), "Thu, Oct 22");
assert.strictEqual(fmt("2026-01-01"), "Thu, Jan 1", "year start");
assert.strictEqual(fmt("2026-12-31"), "Thu, Dec 31", "year end");
assert.strictEqual(fmt("2028-02-29"), "Tue, Feb 29", "leap day");
assert.strictEqual(fmt("2026-03-08"), "Sun, Mar 8", "US DST start");
assert.strictEqual(fmt("2026-11-01"), "Sun, Nov 1", "US DST end");
/* Not dates: shown as they are, never "Invalid Date". */
assert.strictEqual(fmt(""), "");
assert.strictEqual(fmt(null), "");
assert.strictEqual(fmt("2026-02-30"), "2026-02-30", "rolled-over dates are not reformatted");
assert.strictEqual(fmt("not a date"), "not a date");
assert.strictEqual(fmt("2026-10-22T00:00:00Z"), "2026-10-22T00:00:00Z", "only plain YYYY-MM-DD");

/* Date boundary: the same YYYY-MM-DD shows the same day in every zone,
   including far west (UTC-11/-10), Chicago, UTC and far east (UTC+14).
   new Date("2026-10-22") would read as UTC midnight and show Wed, Oct 21 in Chicago. */
var zones = ["America/Chicago", "UTC", "Pacific/Pago_Pago", "Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati"];
var script = "var vm=require('vm');var c={};vm.createContext(c);vm.runInContext(" + JSON.stringify(src) + ",c);" +
  "process.stdout.write(JSON.stringify(['2026-10-22','2026-01-01','2026-12-31','2026-03-08','2026-11-01'].map(c.formatCalendarDayLabel)));";
zones.forEach(function (tz) {
  var out = childProcess.execFileSync(process.execPath, ["-e", script], { env: Object.assign({}, process.env, { TZ: tz }) }).toString();
  assert.deepStrictEqual(JSON.parse(out), ["Thu, Oct 22", "Thu, Jan 1", "Thu, Dec 31", "Sun, Mar 8", "Sun, Nov 1"], "same day in " + tz);
});
assert.ok(!/new Date\(\s*(iso|String\(iso\))\s*\)/.test(src), "never parses YYYY-MM-DD as UTC");

/* Wiring: the owner's day heading uses it; the stored value stays YYYY-MM-DD. */
var pub = fnSrc("renderPublicCalendar");
assert.ok(!/"On "/.test(pub), "no more \"On \" prefix");
assert.ok(/\(owner \? "" : "Busy · "\) \+\s*escapeHtml\(owner \? formatCalendarDayLabel\(selected\) : selected\)/.test(pub), "owner heading is the display label; visitor path unchanged");
assert.ok(!/formatCalendarDayLabel/.test(fnSrc("visitorDayHeading")), "the visitor Calendar card keeps its own formatter");
assert.strictEqual((tower.match(/formatCalendarDayLabel\(/g) || []).length, 2, "defined once, used once");
var priv = fnSrc("renderPrivateCalendar");
assert.ok(/type="date" required value="' \+\s*escapeHtml\(formDate\)/.test(priv), "date input keeps the raw YYYY-MM-DD value");

/* Oswald headers, scoped to Edit profile > Calendar, no new font loaded. */
var rule = /#panel-tower \[data-tower-edit-calendar\] :is\(\.tower-cal-label, \.tower-cal-dow\) \{\s*font-family: "Oswald", system-ui, sans-serif !important;\s*\}/;
assert.ok(rule.test(css), "Oswald on the month label and weekday row");
var bodyRule = /#panel-tower \[data-tower-edit-calendar\] :is\(\.tower-cal-public-title, \.tower-cal-day-heading\) \{\s*font-weight: 600 !important;\s*\}/;
assert.ok(bodyRule.test(css), "title and day heading: body sans at 600");
var editRules = css.match(/#panel-tower \[data-tower-edit-calendar\][^{]*\{[^}]*\}/g) || [];
editRules.forEach(function (r) {
  if (/tower-cal-public-title|tower-cal-day-heading/.test(r)) assert.ok(!/Oswald|font-family/.test(r), "title and day heading keep the body sans: " + r);
});
assert.ok(/<details class="tower-edit-entry" data-tower-edit-calendar>/.test(html), "the rule's scope exists");
assert.strictEqual((html.match(/fonts\.googleapis\.com\/css2/g) || []).length, 1, "one font stylesheet, unchanged");
assert.ok(/family=Oswald:wght@500;600;700&/.test(html), "Oswald already loaded");
assert.ok(!/@font-face[^}]*Oswald/.test(css), "no new Oswald font face");

console.log("tower-calendar-editor-date-label: ok");
