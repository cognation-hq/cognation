/**
 * SIGNAL Feed Post must submit with the Event fields hidden and empty.
 * The Event fields live inside the Post form ([data-tower-compose]); a
 * `required` control there blocks the native submit ("An invalid form control
 * ... is not focusable") and no tower_posts request is sent.
 * Event when/what are validated only by the Post event button handler.
 * Run: node js/feed-post-event-fields.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");

var start = html.indexOf("data-tower-compose");
assert.ok(start > 0, "Feed Post form present");
var end = html.indexOf("</form>", start);
var form = html.slice(start, end);
assert.ok(/data-tower-event-when/.test(form) && /data-tower-event-what/.test(form), "Event fields sit inside the Post form");

/* Model native constraint validation: with Event fields empty, any `required`
   control in the form makes form.checkValidity() false and blocks submit. */
var controls = form.match(/<(input|textarea|select)\b[^>]*>/g) || [];
var blocking = controls.filter(function (tag) {
  if (!/\brequired\b/.test(tag)) return false;
  return !/\bvalue="[^"]+"/.test(tag); /* empty on load */
});
assert.deepStrictEqual(blocking, [], "no empty required control inside the Post form, so Post submit fires");

/* Event fields are still validated, in the Post event button handler only. */
assert.ok(/data-tower-event-post[\s\S]{0,1600}Add when and what\./.test(tower), "Post event button validates when + what");
console.log("feed-post-event-fields.test.js: OK");
