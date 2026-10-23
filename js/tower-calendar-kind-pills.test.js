/**
 * Tower calendar event form: Classroom and Auction pills before the event is added.
 * Run: node js/tower-calendar-kind-pills.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var src = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var start = src.indexOf("function calendarKindPills");
var end = src.indexOf("function renderPrivateCalendar");
var ctx = {};
vm.runInNewContext(src.slice(start, end), ctx);
var html = ctx.calendarKindPills("auction");
assert.ok(html.indexOf('value="classroom"') < html.indexOf('value="auction"'), "Classroom then Auction");
assert.ok(/value="auction"[^>]*checked/.test(html), "Auction pill can be checked");
assert.ok(!/value="classroom"[^>]*checked/.test(html));
assert.ok(!/checked/.test(ctx.calendarKindPills("")), "nothing checked until the person checks a pill");
var ev = { title: "Thursday session" };
ctx.applyEventKind(ev, "auction", { handle: "@acme" }, { item: "typed lot", start: 40 });
assert.strictEqual(ev.kind, "auction");
assert.strictEqual(ev.auction.chat && ev.auction.video, true);
assert.strictEqual(ev.auction.presenter, "handoff");
assert.strictEqual(ev.auction.bid, "professional-page");
assert.strictEqual(ev.auction.item, "typed lot");
assert.notStrictEqual(ev.auction.item, ev.title);
assert.strictEqual(ev.auction.start, 40);
assert.strictEqual(ev.auction.handle, "acme");
assert.strictEqual(ev.auction.minAge, 16);
assert.strictEqual(ev.auction.payInRoom, false);
ctx.applyEventKind(ev, "classroom", {});
assert.strictEqual(ev.kind, "classroom");
assert.ok(!("auction" in ev), "Classroom does not set up the auction room");
var form = src.slice(src.indexOf("function calendarEditorHtml"), src.indexOf("function renderPrivateCalendar"));
assert.ok(form.indexOf("calendarKindPills") < form.indexOf("tower-cal-edit-title"), "pills sit above the event fields");
assert.ok(/owner \? calendarEditorHtml\(editing, selected\)/.test(src), "owner calendar shows the event form");
assert.ok(/Check Classroom or Auction/.test(src));
assert.ok(/data-tower-cal-selling/.test(src) && /data-tower-cal-start/.test(src), "seller types the item and starting bid");
assert.ok(!/item: event\.title/.test(src), "the listing is not a programmed item");
assert.ok(/applyEventKind\(added, kind, p, sale\)/.test(src));
console.log("tower-calendar-kind-pills.test.js ok");
