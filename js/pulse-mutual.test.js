/**
 * PULSE mutual introductions: friendships only, caption on the picture, cap 5.
 * Run: node js/pulse-mutual.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var api = require("./pulse-mutual.js");

var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261018_pulse_mutual_introductions.sql"), "utf8");
var src = fs.readFileSync(path.join(__dirname, "pulse-mutual.js"), "utf8");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.strictEqual(api.REFRESH_MS, 15 * 60 * 1000, "refresh about every 15 minutes");
assert.ok(!/\bfollows\b/.test(sql) && !/\bfollows\b/.test(src), "friendships only");
assert.ok(!/toggle_profile_follow/.test(src) && !/Add friend/.test(src) && !/pulse-intro/.test(css), "no separate add row");
assert.ok(/circle-spot-caption/.test(tower) && /top:\s*100%/.test(css) && /padding:\s*0/.test(css), "caption sits on the frame");
assert.ok(/friendships/.test(sql) && /kind = 'personal'/.test(sql), "personal friends");
assert.ok(/not exists/.test(sql) && /already\.friend_user_id/.test(sql), "skip people you already friend");
assert.ok(/cognation_user_is_real/.test(sql) && /limit 5/.test(sql), "real people, five spots");
assert.ok(/security definer/.test(sql) && /grant execute on function public\.pulse_mutual_introductions\(\) to authenticated/.test(sql));
assert.ok(html.indexOf('src="js/pulse-mutual.js"') > 0 && html.indexOf("js/pulse-mutual.js") < html.indexOf("js/tower.js"), "loads before tower");

var blank = api.peopleFrom([
  { display_name: "", profile_id: "a", mutual_name: "Jo" },
  { display_name: "Riley", profile_id: "", mutual_name: "Jo" },
  { display_name: "Riley", profile_id: "p", mutual_name: "" },
  null,
]);
assert.strictEqual(blank.length, 0, "no invented people");

var rows = [];
for (var i = 0; i < 7; i++) rows.push({ display_name: "N" + i, profile_id: "id-" + i, mutual_name: "Jo" });
rows.push({ display_name: "N0", profile_id: "id-0", mutual_name: "Jo" });
var people = api.peopleFrom(rows);
assert.strictEqual(people.length, 5, "five introductions");
assert.strictEqual(people[0].name, "N0");
assert.strictEqual(people[0].mutualName, "Jo");
var wired = api.peopleFrom([{ display_name: "Ada", profile_id: "p1", mutual_name: "Jo", handle: "@ada", photo_url: "https://cdn.example.com/ada.jpg" }]);
assert.strictEqual(wired[0].handle, "ada", "Tower handle, without @");
assert.strictEqual(wired[0].photoUrl, "https://cdn.example.com/ada.jpg", "Tower picture url");
assert.ok(/p\.handle, p\.photo_url/.test(sql), "introductions return handle and picture");
assert.ok(/data-circle-handle/.test(tower) && /CognationTowerOpenProfile\(handle\)/.test(tower), "circle opens that Tower profile");
console.log("pulse-mutual.test.js ok");
