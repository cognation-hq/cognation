/* PM option B: store birth year + month only; under 13 stores nothing; owner-only read. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var gate = require("./signup-age-gate.js");
var now = new Date(2026, 9, 14);
assert.deepStrictEqual(gate.yearMonth("2000-03-09", now), { year: 2000, month: 3 });
assert.strictEqual(gate.yearMonth("2014-01-01", now), null, "under 13: nothing");
assert.strictEqual(gate.yearMonth("bad", now), null);
assert.ok(!("day" in gate.yearMonth("2000-03-09", now)), "never the day");

var shell = fs.readFileSync(path.join(root, "js/login-signup-shell.js"), "utf8");
assert.ok(/birthYear: profile\.birthYearMonth \? profile\.birthYearMonth\.year/.test(shell));
assert.ok(/delete profile\.birthYearMonth;/.test(shell), "not kept on device");
assert.ok(!/birthdate:\s*birth/.test(shell), "full date never sent");
var client = fs.readFileSync(path.join(root, "js/supabase-client.js"), "utf8");
assert.ok(/birth_year: fields\.birthYear/.test(client) && /birth_month: fields\.birthMonth/.test(client));
assert.ok(!/birth_day|birthdate/.test(client), "client never sends a full date");

var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261015_user_birth_year_month.sql"), "utf8");
assert.ok(!/birth_day|birth_date\b|date of birth/i.test(sql.replace(/--.*$/gm, "")), "no full-date column");
assert.ok(/revoke all on public\.user_birth from anon, authenticated;/.test(sql));
assert.ok(/using \(user_id = auth\.uid\(\)\)/.test(sql), "owner-only read");
assert.ok(!/for (insert|update|all)/.test(sql), "no direct write policies");
assert.ok(/>= 13 then\s*insert into public\.user_birth/.test(sql), "signup trigger stores 13+ only");
assert.ok(/< 13 then\s*return false;/.test(sql), "confirm refuses under 13");
assert.ok(/raw_user_meta_data - 'birth_year' - 'birth_month'/.test(sql), "stripped from auth metadata");
assert.ok(/<= m then 1 else 0/.test(sql), "birth month counts as younger");
console.log("birth-year-month.test.js: ok");
