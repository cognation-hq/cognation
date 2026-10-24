/* Staff milestones: no upload, widget hidden until Apply, mailto, no rules engine. */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html");
var tower = src("js/tower.js");
var sql = src("supabase/migrations/20261019_staff_milestone_badges.sql");

assert.ok(!/data-tower-badge-file|Upload a badge/.test(html), "no upload box");
assert.ok(!/data-tower-private-badges/.test(html), "no badge editor on the profile");
assert.ok(/data-tower-widget="badges"[^>]*hidden>/.test(html), "badge sticker hidden until Apply");
assert.ok(!/Move Badges sticker/.test(html), "no six-dot handle on Badges");
assert.ok(/data-tower-widget="friends"[^>]*hidden>/.test(html), "default Top friends bar starts hidden");
assert.ok(/if \(id === "friends"\) on = false;/.test(tower), "default Top friends bar stays off");
assert.ok(!/data-tower-side-toggle/.test(html) && !/data-tower-side-jump/.test(html), "Connections pill and back link are gone");
assert.ok(/appliedMilestoneList\(p\)/.test(tower) && /kind === "milestone" && b\.applied === true/.test(tower), "widget only after an applied milestone");
assert.ok(/mailto:" \+ email/.test(tower), "email uses mailto");
assert.ok(/staff_award_milestone/.test(tower) && /apply_milestone/.test(tower), "staff award and Apply");
assert.ok(!/rules engine|cron|milestone_rules/i.test(tower + sql), "no automatic rules");
assert.ok(/cognation_is_staff/.test(sql) && /not_staff/.test(sql), "staff gate");
assert.ok(/applied_at is not null/.test(sql), "unapplied awards stay off the page");
assert.ok(/revoke all on public\.milestone_awards/.test(sql), "award rows are not a public gallery");
console.log("staff-milestone.test.js: ok");
