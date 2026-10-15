/**
 * ECHO room empty-state + local-demo clarity (step 1).
 * Run: node js/echo-room-clarity.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");

assert.ok(src.indexOf("Enter room (local demo)") !== -1, "Enter button says local demo");
assert.ok(src.indexOf("not a live group yet") !== -1, "card meta explains local demo");
assert.ok(src.indexOf("No chat rooms match your age and interests yet") !== -1, "empty rooms copy");
assert.ok(src.indexOf("You're caught up.") !== -1, "deck empty copy");
assert.ok(src.indexOf("Local demo room — only you are here") !== -1, "openRoom status");
console.log("echo-room-clarity tests passed");
