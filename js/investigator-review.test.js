/* Investigator review queue: allowlist, report paths, decide + log, no emails/ids in client. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261016_investigator_review.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
var invJs = fs.readFileSync(path.join(root, "js/investigator.js"), "utf8");
var reportJs = fs.readFileSync(path.join(root, "js/content-report.js"), "utf8");
var page = fs.readFileSync(path.join(root, "investigator.html"), "utf8");

assert.ok(/create table if not exists public\.cognation_investigators/.test(code));
assert.ok(/cognation_admins/.test(sql), "docs note separation from admins");
assert.ok(/revoke all on public\.cognation_investigators from anon, authenticated;/.test(code));
assert.ok(/am_i_cognation_investigator\(\)/.test(code));

/* Report paths */
assert.ok(/reason not in \('harmful','untruthful','misrated','illegal_image'\)/.test(code));
assert.ok(/Seed report of ordinary content: FLAG ONLY/.test(sql) || /FLAG ONLY/.test(sql));
assert.ok(/seed_today >= 20/.test(code), "seed daily cap");
assert.ok(/hidden_attachment_indexes/.test(code) && /illegal_image/.test(code));
assert.ok(/frozen_at = coalesce\(frozen_at, now\(\)\)/.test(code), "freeze only on confirm_illegal");
assert.ok(!/frozen_at/.test(code.slice(code.indexOf("report_tower_post"), code.indexOf("mark_report_as_test"))), "report never freezes");

/* Seed-to-seed tests out of real queue */
assert.ok(/if reporter_seed and author_seed then is_test := true;/.test(code));
assert.ok(/where r\.status = 'open' and not r\.is_test/.test(code));

/* Decide: reason required, log, poster notice, one appeal already exists */
assert.ok(/reason_required/.test(code));
assert.ok(/investigator_decision_log/.test(code));
assert.ok(/poster_notices/.test(code));
assert.ok(/You can appeal once/.test(code));

/* Client: no emails/uids; fail closed; never send image bytes */
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(invJs + reportJs));
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(invJs + reportJs));
assert.ok(/am_i_cognation_investigator/.test(invJs));
assert.ok(/Never attach or describe image bytes/.test(reportJs));
assert.ok(/attachment_index: attachmentIndex/.test(reportJs));
assert.ok(page.indexOf("js/investigator.js") > 0 && /noindex/.test(page));

/* Content report API surface */
var CR = require("./content-report.js");
assert.deepStrictEqual(CR.REASONS, ["harmful", "untruthful", "misrated", "illegal_image"]);
assert.ok(typeof CR.reportTowerPost === "function");

console.log("investigator-review.test.js: ok");
