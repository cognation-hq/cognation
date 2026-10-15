/* Admin-only, read-only seed preview. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(root, "js/seed-preview.js"), "utf8");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261015_admin_seed_preview.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
/* Server decides admin; no emails or ids in code. */
assert.ok(/rpc\("am_i_cognation_admin"/.test(src) && /if \(yes === true\) addEntry\(\);/.test(src));
assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(src) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(src), "no emails/uids in client");
/* Read-only: only the two rpcs, no REST writes. */
var calls = src.match(/\.(rpc|rest)\("([a-z_]+)"/g) || [];
assert.deepStrictEqual(calls.sort(), ['.rpc("admin_seed_preview"', '.rpc("am_i_cognation_admin"']);
assert.ok(!/method:\s*"(POST|PATCH|DELETE|PUT)"/.test(src));
assert.ok(/data-seed-preview-banner/.test(src) && /data-seed-preview-exit/.test(src), "banner with exit");
assert.ok(/function esc\(/.test(src) && !/innerHTML = [^;]*\+ p\.body/.test(src), "escaped output");
/* SQL: allowlist hidden, stable definer, seeds only, no emails. */
assert.ok(/revoke all on public\.cognation_admins from anon, authenticated;/.test(code));
assert.ok(/returns jsonb\s*language plpgsql\s*stable\s*security definer\s*set search_path = public/.test(code), "STABLE: cannot write");
assert.ok(/if not public\.am_i_cognation_admin\(\) then\s*raise exception 'not_admin';/.test(code));
assert.ok(/p\.account_kind <> 'real'/.test(code) && /pf\.account_kind <> 'real'/.test(code) && /pa\.account_kind <> 'real'/.test(code), "seed data only");
assert.ok(!/email/i.test(code) && !/'user_id',/.test(code), "no emails or user ids returned");
assert.ok(/t\.rating in \('G', 'PG', 'PG-13'\)/.test(code));
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf("js/seed-preview.js") > html.indexOf("js/supabase-client.js"));
console.log("seed-preview.test.js: ok");
