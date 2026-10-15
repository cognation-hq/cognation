/* Room lock: pattern check → incident form + freeze/hide (never delete). */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261016_investigator_room_lock.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
var invJs = fs.readFileSync(path.join(root, "js/investigator.js"), "utf8");
var page = fs.readFileSync(path.join(root, "investigator.html"), "utf8");
var reportSql = fs.readFileSync(path.join(root, "supabase/migrations/20261016_investigator_review.sql"), "utf8");

assert.ok(/create table if not exists public\.incident_report_forms/.test(code));
assert.ok(/subject_handle/.test(code) && /findings/.test(code));
assert.ok(/investigator_pattern_check/.test(code));
assert.ok(/investigator_incident_takedown/.test(code));
assert.ok(/generated_by uuid not null references auth\.users\(id\) on delete restrict/.test(code),
  "generated_by NOT NULL must use ON DELETE RESTRICT");
assert.ok(/cognation_attachment_meta/.test(code));
assert.ok(/'deleted', false/.test(code) || /deleted', false/.test(code));
assert.ok(!/\bdelete from public\.(tower_posts|profiles|auth)/i.test(code), "never delete account/content");
assert.ok(!/drop table if exists public\.tower_posts/.test(code));
assert.ok(!/\bemail\b/i.test(code.replace(/'[^']*'/g, "''")), "no email fields");
assert.ok(!/base64|bytea|image_bytes|data:image/i.test(code));

assert.ok(/hidden_reason = 'investigator'/.test(code));
assert.ok(/frozen_at = coalesce\(frozen_at, now\(\)\)/.test(code));

/* Seeds still only flag public ordinary content */
assert.ok(/Seed report of ordinary content: FLAG ONLY/.test(reportSql));

/* Client */
assert.ok(/confirm_illegal/.test(invJs) && /investigator_pattern_check/.test(invJs));
assert.ok(/investigator_incident_takedown/.test(invJs));
assert.ok(/Generate incident report/.test(invJs));
assert.ok(/No trend — done/.test(invJs));
assert.ok(/inv-btn-danger/.test(invJs));
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(invJs));
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(invJs));
assert.ok(/pattern-check|pattern check/i.test(page));

console.log("investigator-room-lock.test.js: ok");
