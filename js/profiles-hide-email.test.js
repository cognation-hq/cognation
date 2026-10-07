/**
 * Profiles: browser roles cannot read profiles.email, and no name is built from an email.
 * Run: node js/profiles-hide-email.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

var sql = src("supabase/migrations/20261007_profiles_hide_email.sql");
var code = sql.replace(/--[^\n]*/g, "");

/* 1. Column-level SELECT: table-level revoke, email revoked, explicit grant list. */
assert.ok(/revoke select on public\.profiles from anon, authenticated;/.test(code), "table-level SELECT revoked");
assert.ok(/revoke select \(email\) on public\.profiles from anon, authenticated;/.test(code), "email column revoked");
var listMatch = code.match(/allowed text\[\] := array\[([\s\S]*?)\];/);
assert.ok(listMatch, "explicit grant list present");
var granted = listMatch[1].match(/'([a-z_]+)'/g).map(function (s) { return s.slice(1, -1); });
assert.strictEqual(granted.indexOf("email"), -1, "email is never granted");
assert.ok(/grant select \(%I\) on public\.profiles to anon, authenticated/.test(code), "grants per column");
assert.ok(!/grant select on public\.profiles to/.test(code), "no table-level re-grant outside rollback notes");
assert.ok(!/drop column/i.test(code), "email column is not dropped");

/* Every profiles column the browser selects (direct or embedded) must be granted. */
var clientFiles = fs.readdirSync(path.join(root, "js"))
  .filter(function (f) { return /\.js$/.test(f) && !/\.test\.js$/.test(f); })
  .map(function (f) { return "js/" + f; });
var selected = {};
clientFiles.forEach(function (rel) {
  var text = src(rel);
  var m;
  var embed = /profiles!?[a-z_]*\(([a-z_,]+)\)/g;
  while ((m = embed.exec(text))) m[1].split(",").forEach(function (c) { selected[c] = rel; });
  var direct = /rest\("profiles",\s*\{[\s\S]{0,200}?select=([a-z_,]+)/g;
  while ((m = direct.exec(text))) m[1].split(",").forEach(function (c) { selected[c] = rel; });
  assert.ok(!/profiles[^\n]{0,80}select=\*/.test(text), rel + ": no select=* on profiles");
  assert.ok(!/profiles!?[a-z_]*\(\*\)/.test(text), rel + ": no profiles(*) embed");
});
["display_name", "account_kind", "handle", "user_id", "seed_fleet_id", "bio", "kind", "id"].forEach(function (c) {
  assert.ok(selected[c], "fixture sanity: code selects " + c);
});
Object.keys(selected).forEach(function (c) {
  assert.ok(granted.indexOf(c) !== -1, "column " + c + " selected in " + selected[c] + " is granted");
});
assert.ok(!selected.email, "no client select of profiles.email");

/* PATCH/POST with return=representation must not fall back to select=*. */
var social = src("js/supabase-social.js");
assert.ok(/var PROFILE_RETURN_COLUMNS = "id,user_id,kind,handle,display_name,bio";/.test(social));
assert.ok(/method: "PATCH",[\s\S]{0,260}"&select=" \+ PROFILE_RETURN_COLUMNS/.test(social), "profile PATCH selects explicit columns");
assert.ok(/rest\("profiles", \{\s*method: "POST",\s*query: "select=" \+ PROFILE_RETURN_COLUMNS/.test(social), "profile POST selects explicit columns");
"id,user_id,kind,handle,display_name,bio".split(",").forEach(function (c) {
  assert.ok(granted.indexOf(c) !== -1, "return column " + c + " granted");
});

/* 2. Signup trigger falls back to 'Member', never the email. */
var fn = code.slice(code.indexOf("create or replace function public.create_profile_for_new_user()"));
fn = fn.slice(0, fn.indexOf("$$;") + 3);
assert.ok(fn.length > 100, "function replaced in this migration");
assert.ok(fn.indexOf("new.email") === -1, "trigger does not read new.email");
assert.ok(/coalesce\(supplied_name, 'Member'\)/.test(fn), "Member fallback");
assert.ok(/security definer set search_path = public/.test(fn), "keeps security definer + search_path");

/* 3. One-time cleanup: real rows only, in SQL, count only. */
assert.ok(/set display_name = 'Member'\s+where account_kind = 'real'\s+and email is not null\s+and display_name = split_part\(email, '@', 1\)/.test(code), "one-time rename of email-derived names");
assert.ok(/raise notice 'profiles renamed to Member: %', renamed;/.test(code), "reports a count only");
assert.ok(!/raise notice[^;]*email/i.test(code), "never logs email values");
assert.ok(!/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(sql), "no addresses in the migration");

/* Fresh setups that replay the base migration get the same fallback. */
var base = src("supabase/migrations/20260924_cognation_social.sql");
assert.ok(base.indexOf("split_part(new.email") === -1, "base signup trigger no longer uses the email");
assert.ok(/'display_name'\), ''\), 'Member'\);/.test(base), "base signup trigger falls back to Member");

/* 4. Client name fallbacks never show an email. */
function mem(seed) {
  var d = seed || {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
var ls = mem({ "cognation.session.demo.v1": JSON.stringify({ username: "someone" + "@" + "example.invalid" }) });
var w = {};
vm.runInNewContext(src("js/news-comments.js"), { window: w, localStorage: ls, Date: Date, Math: Math });
var added = w.CognationNewsComments.addComment({ storyId: "s-email", body: "hi" });
assert.ok(added.ok);
assert.strictEqual(added.comment.authorName, "Member", "email-shaped session username shows as Member");
assert.strictEqual(w.CognationNewsComments.authorBadge("real"), "", "Member (real) shows no Demo badge");

var tower = src("js/tower.js");
var fdn = tower.slice(tower.indexOf("function followerDisplayName(id)"));
fdn = fdn.slice(0, fdn.indexOf("\n  }\n"));
assert.ok(/if \(sessionName\.indexOf\("@"\) !== -1\) sessionName = "Member";/.test(fdn), "tower session name fallback guards email");
assert.ok(/if \(id\.indexOf\("@"\) !== -1\) return "Member";/.test(fdn), "tower raw id fallback guards email");

console.log("profiles-hide-email.test.js OK");
