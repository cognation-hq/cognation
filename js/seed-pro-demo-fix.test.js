/* One-off seed Pro Demo fix: relabels only the 3 named seed Professional pages, idempotent,
   guarded by the owner's seed Personal page. Read-only check lists ids/handles only. Static SQL checks. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function read(p) { return fs.readFileSync(path.join(root, p), "utf8"); }
function stripComments(s) { return s.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n"); }
var HANDLES = ["seed-shawn-0251-pro", "seed-alex-0003-pro", "seed-skye-0252-pro"];
var IN_LIST = "in ('seed-shawn-0251-pro', 'seed-alex-0003-pro', 'seed-skye-0252-pro')";

var fix = stripComments(read("supabase/migrations/20261022_seed_pro_demo_fix.sql"));
var check = stripComments(read("supabase/checks/20261022_seed_pro_demo_check_readonly.sql"));

/* Fix: exactly one UPDATE, scoped to the 3 handles, in one transaction. */
assert.equal((fix.match(/\bupdate public\.profiles\b/g) || []).length, 1, "exactly one update");
assert.ok(fix.indexOf("pro.handle " + IN_LIST) >= 0, "scoped to the 3 handles");
HANDLES.forEach(function (h) { assert.equal(fix.split("'" + h + "'").length - 1, 1, h + " named once"); });
assert.ok(!/like 'seed-%'/.test(fix), "no broad seed-% sweep");
assert.ok(/^begin;/m.test(fix) && /^commit;/m.test(fix));

/* Guards. */
assert.ok(/and pro\.kind = 'professional'/.test(fix));
assert.ok(/and pro\.account_kind = 'real'/.test(fix), "only still-mislabelled rows (idempotent)");
assert.ok(/and per\.user_id = pro\.user_id/.test(fix));
assert.ok(/and per\.kind = 'personal'/.test(fix));
assert.ok(/and per\.id <> pro\.id/.test(fix));
assert.ok(/and per\.account_kind in \('seed', 'ops'\)/.test(fix), "owner must be a fleet account");
assert.ok(/and per\.seed_fleet_id is not null/.test(fix));

/* Sets only account_kind, copied from the owner; never the unique fleet id. */
assert.ok(/set account_kind = per\.account_kind\s+from/.test(fix));
assert.ok(!/set[^;]*seed_fleet_id\s*=/.test(fix), "must not copy the unique seed_fleet_id");
assert.ok(/returning pro\.id, pro\.handle, pro\.account_kind;/.test(fix));

/* No deletes, removals, schema/grant changes or emails. */
assert.ok(!/\b(delete from|truncate|drop|alter|grant|revoke|create)\b/i.test(fix));
assert.ok(!/\bemail\b/i.test(fix) && !/\bemail\b/i.test(check));

/* Check: read-only, lists ids and handles for the 3 pages, plus a safety sweep. */
assert.ok(!/\b(update|insert into|delete from|alter|drop|create|grant|revoke|truncate|begin|commit)\b/i.test(check.replace(/'[^']*'/g, "''")),
  "check must be read-only");
assert.ok(check.indexOf("pro.handle " + IN_LIST) >= 0);
assert.ok(/pro\.id\s+as pro_id/.test(check) && /pro\.handle\s+as pro_handle/.test(check));
assert.ok(/as needs_fix/.test(check) && /as still_real/.test(check));
assert.ok(/pro\.handle not in \('seed-shawn-0251-pro', 'seed-alex-0003-pro', 'seed-skye-0252-pro'\)/.test(check));
assert.ok(!/raw_user_meta_data|auth\.users/.test(check + fix), "never reads auth users");

/* The Demo badge reads account_kind, so 'seed' alone is enough (client fleetKindOf). */
var social = read("js/supabase-social.js");
assert.ok(/if \(k === "seed" \|\| k === "ops"\) return k;/.test(social));
