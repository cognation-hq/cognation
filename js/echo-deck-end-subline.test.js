/**
 * Signed-out ECHO deck end: the line "No chat rooms match your age and interests yet…"
 * uses the existing muted subline style (commune-swipe-end-sub: 14px, #d9d2f0, same
 * #panel-commune overrides as "New cards show up as people share."), and the note's
 * lines sit 8px apart, so the sublines start 8px under "You're caught up.".
 * Copy is unchanged, nothing is removed, and the "Sign in to join rooms." link (#322)
 * is untouched. Signed in, the deck end markup is unchanged.
 *
 * Renders the real deck-end template from js/commune-swipe.js paintDeck with stubbed
 * viewer state. Run: node --test js/echo-deck-end-subline.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = process.env.LRR_ROOT || path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var ROOMS_COPY = "No chat rooms match your age and interests yet. Update age or interests in your profile, then come back.";

/* The deck-end template: from "var empty =" to its closing "</div>" statement. */
function deckEnd(opts) {
  var src = read("js/commune-swipe.js");
  var start = src.indexOf("      var empty =\n        '<div class=\"commune-swipe-end");
  assert.ok(start > 0, "deck-end template found");
  var end = src.indexOf('"</div>";', start);
  assert.ok(end > start, "deck-end template ends");
  var body = "var endSignedOut = signedOutViewer();\n" + src.slice(start, end + '"</div>";'.length) + "\nreturn empty;";
  var fn = new Function("signedOutViewer", "liveBirthMissing", "birthAgePending", "roomsOpen", body);
  return fn(function () { return opts.signedOut; }, function () { return !!opts.birthMissing; },
    function () { return false; }, opts.roomsOpen || 0);
}
function lines(html) {
  var out = [], re = /<p class="([^"]*)"[^>]*>([^<]*)<\/p>/g, m;
  while ((m = re.exec(html))) out.push({ cls: m[1].split(/\s+/), text: m[2] });
  return out;
}

test("signed out: the rooms end line is a muted subline, copy unchanged, nothing removed", function () {
  var html = deckEnd({ signedOut: true });
  var ls = lines(html);
  assert.deepStrictEqual(ls.map(function (l) { return l.text; }),
    ["You're caught up.", "New cards show up as people share.", ROOMS_COPY], "same three lines, same copy");
  var rooms = ls[2];
  assert.ok(rooms.cls.indexOf("commune-swipe-end-sub") >= 0, "rooms line has the muted subline class: " + rooms.cls.join(" "));
  assert.ok(rooms.cls.indexOf("commune-swipe-empty--rooms") >= 0, "existing rooms hook kept");
  assert.ok(/class="commune-swipe-end commune-swipe-end--signed-out"/.test(html), "signed-out deck end marker");
});

test("signed in: deck end markup is unchanged", function () {
  var html = deckEnd({ signedOut: false });
  assert.ok(/^<div class="commune-swipe-end" data-commune-deck-end>/.test(html), "no signed-out marker");
  var ls = lines(html);
  assert.strictEqual(ls[2].text, ROOMS_COPY);
  assert.deepStrictEqual(ls[2].cls, ["commune-swipe-empty", "commune-swipe-empty--rooms"], "rooms line classes unchanged");
  var birth = lines(deckEnd({ signedOut: false, birthMissing: true }))[2];
  assert.deepStrictEqual(birth.cls, ["commune-swipe-empty", "commune-swipe-empty--rooms"], "birth-needed line unchanged");
});

test("CSS: same size and color token as the muted sublines, 8px apart under the title", function () {
  var css = read("css/styles.css");
  assert.ok(/\.commune-swipe-end \.commune-swipe-end-sub \{\s*margin: 0;\s*color: #d9d2f0;\s*font-size: 14px;/.test(css), "muted subline: 14px #d9d2f0");
  assert.ok(/#panel-commune \.commune-swipe-end \.commune-swipe-end-sub \{\s*color: #d9d2f0 !important;\s*font-size: 14px !important;/.test(css), "panel override: 14px #d9d2f0");
  assert.ok(/\.commune-swipe-end\.commune-swipe-end--signed-out \{\s*gap: 8px;\s*\}/.test(css), "signed-out deck end lines sit 8px apart");
});

test("the 'Sign in to join rooms.' link from #322 is untouched", function () {
  var html = read("index.html");
  var m = html.match(/<p class="commune-signed-out-rooms" data-commune-signed-out-rooms hidden><a class="commune-rooms-signin" href="\/" data-rooms-signin>Sign in to join rooms\.<\/a><\/p>/g) || [];
  assert.strictEqual(m.length, 1);
});
