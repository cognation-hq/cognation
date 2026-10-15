/* Bad-reporter weight: groundless dismissals lower auto-hide, then suspend Report. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261016_reporter_weight.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
var inv = fs.readFileSync(path.join(root, "js/investigator.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

assert.ok(/dismiss_groundless/.test(code));
assert.ok(/low_weight := groundless >= 3/.test(code), ">=3 groundless: no auto-hide");
assert.ok(/groundless >= 5/.test(code) && /reporter_suspensions/.test(code), ">=5: suspend Report");
assert.ok(/report_suspended/.test(code));
assert.ok(/can_i_report/.test(code));
assert.ok(/investigator_restore_reporter/.test(code));
assert.ok(/r\.reporter_user_id/.test(code), "Investigator queue includes filer id");
assert.ok(/dismiss_groundless/.test(inv));
assert.ok(/inv-btn-danger/.test(inv) && /inv-btn-danger/.test(css), "Confirm illegal is danger-styled");
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(inv));
console.log("reporter-weight.test.js: ok");
