/** Auction pills and the buyer–seller note. Run: node js/tower-calendar-kind-pills.test.js */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var src = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var msg = fs.readFileSync(path.join(__dirname, "commune-messages.js"), "utf8");
var swipe = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
var ctx = {};
vm.runInNewContext(src.slice(src.indexOf("function calendarKindPills"), src.indexOf("function renderPrivateCalendar")), ctx);
var html = ctx.calendarKindPills("");
assert.ok(/value="classroom"/.test(html) && /value="auction"/.test(html) && !/checked/.test(html));
var ev = { title: "Session" };
ctx.applyEventKind(ev, "auction", { handle: "host" }, { item: "", start: "" });
assert.strictEqual(ev.auction.item, "");
assert.ok(!(ev.auction.start > 0) && ev.auction.payInRoom === false && ev.auction.bid === "message");
assert.ok(/data-tower-cal-selling/.test(src) && /data-tower-cal-start/.test(src));
var note = msg.slice(msg.indexOf("Hello! You have agreed"));
assert.ok(/data-auction-amt/.test(note) && /data-auction-seller/.test(note) && /data-auction-date/.test(note));
assert.ok(!/value=/.test(note.slice(0, note.indexOf("> amount of money"))));
assert.ok(/data-auction-draft/.test(msg) && /Buyer connected/.test(msg) && /data-auction-send>Send/.test(msg) && /Please keep a copy of this message for your records/.test(msg) && /data-auction-pay>Apple Pay/.test(msg) && /No payment was taken/.test(msg) && !/receipt|purchase completed/i.test(msg));
/* #183 added Apple Pay for the Marketplace high bid (data-market-pay / payHighBid) to commune-swipe.js.
   The auction's Apple Pay still lives only in the buyer-seller note (commune-messages.js), never in the deck. */
function fnBody(src0, name) {
  var st = src0.indexOf("function " + name + "("); if (st < 0) return "";
  var d = 0, k = src0.indexOf("{", st);
  for (; k < src0.length; k++) { if (src0[k] === "{") d++; else if (src0[k] === "}" && --d === 0) break; }
  return src0.slice(st, k + 1);
}
var payFn = fnBody(swipe, "payHighBid");
assert.ok(!/data-auction-pay/.test(swipe), "no auction Apple Pay button in the deck");
assert.strictEqual((swipe.match(/>Apple Pay<\/button>/g) || []).length, (swipe.match(/data-market-pay>Apple Pay<\/button>/g) || []).length, "the only Apple Pay button in the deck is the Marketplace one");
assert.ok(payFn && /ApplePaySession/.test(payFn) && !/ApplePaySession|\/apple-pay\//.test(swipe.replace(payFn, "")), "Apple Pay session only in the Marketplace payHighBid");
assert.ok(/CognationAuctionRoom\.mount/.test(swipe) && !/tower-profile/.test(msg.slice(msg.lastIndexOf("function mount"))));
console.log("tower-calendar-kind-pills.test.js ok");
