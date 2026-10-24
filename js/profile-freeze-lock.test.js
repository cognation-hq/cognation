/* Freeze lock: browser roles cannot change profiles.frozen_at / freeze_reason;
   server roles and the Investigator security-definer path still can. Static SQL checks. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function read(p) { return fs.readFileSync(path.join(root, p), "utf8"); }
function stripComments(s) { return s.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n"); }

var sql = read("supabase/migrations/20261022_lock_profile_freeze.sql");
var code = stripComments(sql);
var check = stripComments(read("supabase/checks/20261022_lock_profile_freeze_check_readonly.sql"));

/* Guard: needs the freeze columns and the Investigator check from 20261016_investigator_review. */
assert.ok(/column_name = 'frozen_at'/.test(code) && /column_name = 'freeze_reason'/.test(code));
assert.ok(/to_regprocedure\('public\.am_i_cognation_investigator\(\)'\) is null/.test(code));
assert.ok(/raise exception 'freeze_lock_needs_investigator_review'/.test(code));

/* Trigger function: not security definer (it must see the caller's current_user). */
var fn = code.slice(code.indexOf("create or replace function public.profiles_lock_freeze_columns()"),
  code.indexOf("drop trigger if exists profiles_a_lock_freeze_columns"));
assert.ok(fn.length > 0, "trigger function present");
assert.ok(!/security definer/i.test(fn), "trigger function must not be security definer");
assert.ok(/set search_path = public/.test(fn));

/* Same JWT-role read as 01_lock_account_labels; server roles pass. */
assert.ok(/request\.jwt\.claim\.role/.test(fn) && /request\.jwt\.claims/.test(fn));
assert.ok(/if jwt_role not in \('anon', 'authenticated'\) then\s+return new;/.test(fn));

/* Investigator exemption needs BOTH a definer context and an Investigator caller. */
assert.ok(/current_user not in \('anon', 'authenticated'\)\s+and public\.am_i_cognation_investigator\(\) then\s+return new;/.test(fn),
  "investigator path must require current_user <> browser role AND am_i_cognation_investigator()");

/* UPDATE: any change to either column is rejected. INSERT: must arrive unfrozen. */
assert.ok(/new\.frozen_at is distinct from old\.frozen_at/.test(fn));
assert.ok(/new\.freeze_reason is distinct from old\.freeze_reason/.test(fn));
assert.ok(/new\.frozen_at is not null or new\.freeze_reason is not null/.test(fn));
assert.equal((fn.match(/raise exception 'profile_freeze_locked'/g) || []).length, 2);

/* Idempotent trigger, fires before the other profiles triggers (name order). */
assert.ok(/drop trigger if exists profiles_a_lock_freeze_columns on public\.profiles;/.test(code));
assert.ok(/create trigger profiles_a_lock_freeze_columns\s+before insert or update on public\.profiles\s+for each row execute function public\.profiles_lock_freeze_columns\(\);/.test(code));

/* Changes no rows, removes nothing, no policy or grant changes, no emails. */
assert.ok(!/\b(update|delete from|truncate)\s+public\./i.test(code), "no row changes");
assert.ok(!/\bdrop (table|policy|function|column)\b/i.test(code), "no removals");
assert.ok(!/\b(revoke|grant|alter policy|create policy)\b/i.test(code), "no grant/policy changes");
assert.ok(!/\bemail\b/i.test(code));

/* Investigator writers still exist and are security definer + Investigator-gated. */
var takedown = read("supabase/migrations/20261016_investigator_room_lock.sql");
assert.ok(/frozen_at = coalesce\(frozen_at, now\(\)\)/.test(takedown));
assert.ok(/security definer/i.test(takedown) && /am_i_cognation_investigator\(\)/.test(takedown));
var weight = read("supabase/migrations/20261016_reporter_weight.sql");
assert.ok(/frozen_at/.test(weight) && /security definer/i.test(weight) && /am_i_cognation_investigator\(\)/.test(weight));

/* The app never writes the freeze columns (so normal saves are unaffected). */
fs.readdirSync(path.join(root, "js")).filter(function (f) { return /\.js$/.test(f) && !/\.test\.js$/.test(f); })
  .forEach(function (f) {
    var src = read("js/" + f);
    assert.ok(!/frozen_at\s*:/.test(src) && !/freeze_reason\s*:/.test(src), f + " must not write freeze columns");
  });

/* Pre-check is read-only: selects only. */
assert.ok(/pg_policies/.test(check) && /pg_trigger/.test(check) && /has_table_privilege/.test(check));
assert.ok(!/\b(update|insert into|delete from|alter|drop|create|grant|revoke|truncate)\b/i.test(check.replace(/'[^']*'/g, "''")),
  "pre-check must be read-only");
assert.ok(!/\bemail\b/i.test(check));
