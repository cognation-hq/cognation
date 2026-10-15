/**
 * ECHO swipe-left refill contract.
 * Run: node js/echo-swipe-refill.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");

assert.ok(/function topUpDeck\(/.test(src), "topUpDeck helper");
assert.ok(/if \(state\.index >= state\.cards\.length\)/.test(src), "OOB index triggers fresh sampleDeck");
assert.ok(/No more ECHO cards right now/.test(src), "clear empty state copy");
/* Regression: old finishSwipe left index past kept.length after left-swiping the last queued card. */
assert.ok(/if \(state\.index > state\.cards\.length\) state\.index = state\.cards\.length/.test(src), "clamp index to length");
assert.ok(src.indexOf("function finishSwipe()") < src.indexOf("function topUpDeck()") === false || src.indexOf("topUpDeck()") > 0, "topUp used");
assert.ok(/topUpDeck\(\);/.test(src), "finishSwipe calls topUpDeck");
console.log("echo-swipe-refill tests passed");
