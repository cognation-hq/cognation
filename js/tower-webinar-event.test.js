/** Webinar pill on Add event. Run: node js/tower-webinar-event.test.js */
"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function fn(name) {
  var s = tower.indexOf("function " + name + "("), i = tower.indexOf("{", s), d = 0;
  for (; i < tower.length; i++) { if (tower[i] === "{") d++; else if (tower[i] === "}" && --d === 0) break; }
  return tower.slice(s, i + 1);
}
var room = fn("webinarRoomHtml"), limits = fn("webinarLimits"), editor = fn("calendarEditorHtml");
assert.ok(/data-tower-cal-webinar/.test(editor) && /> Webinar</.test(editor) && /on \? " checked" : ""/.test(editor));
assert.ok(/Check Webinar\./.test(tower));
assert.ok(/Up to 200,000 viewers/.test(room) && /Up to 50 live/.test(room) && /Main presenter/.test(room) && /Raise your hand/.test(room) && /Join on video/.test(room));
assert.ok(!/<textarea|<input|comment|Apple Pay|Bid|data-auction|watching/.test(room));
assert.ok(/viewers: 200000/.test(limits) && /live: 50/.test(limits) && /presenters: 1/.test(limits) && /comments: false/.test(limits));
console.log("tower-webinar-event.test.js ok");
