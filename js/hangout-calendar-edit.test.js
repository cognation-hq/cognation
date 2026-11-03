/** Edit on a calendar hangout opens that hangout and saves it as a hangout. */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");

function fn(name) {
  var s = tower.indexOf("function " + name + "(");
  assert.ok(s >= 0, name);
  var i = tower.indexOf("{", s), d = 0;
  for (; i < tower.length; i++) {
    if (tower[i] === "{") d++;
    else if (tower[i] === "}" && --d === 0) break;
  }
  return tower.slice(s, i + 1);
}

var ctx = {
  escapeHtml: function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
};
vm.createContext(ctx);
vm.runInContext(fn("isHangoutEvent") + "\n" + fn("hangoutEditorHtml"), ctx);

assert.strictEqual(ctx.isHangoutEvent({ title: "Hangout", notes: "Suggested open time" }), true);
assert.strictEqual(ctx.isHangoutEvent({ title: "Coffee", notes: "Bring coffee", kind: "hangout" }), true);
assert.strictEqual(ctx.isHangoutEvent({ title: "Hangout", notes: "Booked from the calendar" }), true);
assert.strictEqual(ctx.isHangoutEvent({ title: "Hangout", kind: "classroom" }), false);
assert.strictEqual(ctx.isHangoutEvent({ title: "Studio", kind: "webinar" }), false);
assert.strictEqual(ctx.isHangoutEvent({ title: "Sale", kind: "auction" }), false);

var html = ctx.hangoutEditorHtml({
  id: 'h"1',
  title: "Hangout",
  date: "2026-10-24",
  time: "09:00",
  notes: "Suggested open time"
});
assert.ok(/data-tower-cal-hangout-editor/.test(html) && !/data-tower-cal-editor[^-]/.test(html.replace("data-tower-cal-hangout-editor", "")));
assert.ok(/value="h&quot;1" data-tower-cal-edit-id/.test(html));
assert.ok(/value="Hangout"/.test(html) && /value="2026-10-24"/.test(html) && /value="09:00"/.test(html));
assert.ok(/value="Suggested open time"/.test(html) && /Save changes/.test(html) && /data-tower-cal-cancel-edit/.test(html));
assert.ok(!/Classroom|Auction|Webinar|data-tower-cal-kind/.test(html));

var pub = fn("renderPublicCalendar");
assert.ok(/isHangoutEvent\(e\)/.test(pub) && /hangoutEditorHtml\(editingHangout\)/.test(pub));
assert.ok(/kind: "hangout"/.test(fn("addScheduledHangout")));
assert.ok(/ev\.kind === "hangout"/.test(fn("normalizeCalendarEvent")));

var save = tower.slice(
  tower.indexOf('form.matches("[data-tower-cal-hangout-editor]")'),
  tower.indexOf('form.matches("[data-tower-cal-editor]")')
);
assert.ok(/e\.kind = "hangout"/.test(save) && /e\.title = hTitle/.test(save) && /e\.time = hTime/.test(save) && /e\.notes = hNotes/.test(save));
assert.ok(!/applyChosen|applyEventKind|CognationClassroomEvent|Check Classroom/.test(save));
assert.ok(/Check Classroom or Auction\./.test(tower.slice(tower.indexOf('form.matches("[data-tower-cal-editor]")'))));

console.log("hangout-calendar-edit.test.js ok");
