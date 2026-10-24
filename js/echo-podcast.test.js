/** Podcast Echo chat. Run: node js/echo-podcast.test.js */
"use strict";
var assert = require("assert"), fs = require("fs"), vm = require("vm"), path = require("path");
function mem() { var d = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); } }; }
var local = mem(), profiles = { ada: { id: "ada", kind: "personal", accountUsername: "ada", calendarEvents: [] }, pro: { id: "pro", kind: "professional", calendarEvents: [] } };
var w = { CognationAccounts: { getProfilesForUsername: function () { return [profiles.ada, profiles.pro]; }, saveProfileRecord: function (r) { profiles[r.id] = r; return r; } } };
vm.runInContext(fs.readFileSync(path.join(__dirname, "echo-podcast.js"), "utf8"), vm.createContext({ window: w, localStorage: local, document: { dispatchEvent: function () {}, getElementById: function () { return null; } }, CustomEvent: function () {}, Date: Date, JSON: JSON, Object: Object, Array: Array, String: String }));
function who(id) { local.setItem("cognation.session.v2", JSON.stringify({ username: id, activeProfileId: id, profileDisplayName: id })); }
who("ada");
var api = w.CognationEchoPodcast, card = { id: "pro-podcast-leaders", podcastId: "pro-podcast-leaders", title: "Top industry performers" }, joined = api.join(card.id, card, "2026-10-24"), room = joined.roomId;
assert.ok(joined.ok && api.post(room, "hello").ok && profiles.ada.calendarEvents[0].kind === "podcast" && profiles.ada.calendarEvents[0].roomId === room && profiles.ada.calendarEvents[0].date === "2026-10-24" && !profiles.pro.calendarEvents.length && api.CAP === 100 && api.CAM === 15 && api.KICK_AT === 10 && /data-podcast-cal-add/.test(api.addBar()));
var msg = JSON.parse(local.getItem(api.KEY)).rooms[room].messages[0].id, i; for (i = 1; i < 100; i++) { who("p" + i); assert.ok(api.join(room).ok); }
who("extra"); assert.ok(api.join(room).full && api.present([card]).some(function (c) { return c.splitOf === card.id && c.presenter === false && c.cap === 100; }));
for (i = 0; i < 9; i++) { who("rep" + i); assert.ok(!api.report(room, msg).kicked); } who("rep9"); assert.ok(api.report(room, msg).kicked); who("ada"); assert.ok(api.join(room).kicked);
console.log("echo-podcast.test.js: OK");
