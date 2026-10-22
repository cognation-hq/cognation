/**
 * #240 follow-up (PM, Oct 22): browser roles cannot write account_kind or
 * seed_fleet_id on profiles, so a real member cannot self-label as fleet and
 * unlock seed- handles. Static check of the (not auto-run) migration.
 * Run: node js/reserved-handle-label-lock.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261022_reserved_handle_fleet_owner.sql"), "utf8");
var fn = sql.slice(sql.indexOf("function public.profiles_lock_account_labels()"));
assert.ok(sql.indexOf("function public.profiles_lock_account_labels()") > 0, "label lock function");
assert.ok(/jwt_role not in \('anon', 'authenticated'\)[\s\S]{0,40}return new/.test(fn), "service_role / SQL editor unchanged");
assert.ok(/new\.account_kind is distinct from old\.account_kind/.test(fn), "UPDATE of account_kind rejected");
assert.ok(/new\.seed_fleet_id is distinct from old\.seed_fleet_id/.test(fn), "UPDATE of seed_fleet_id rejected");
assert.ok(/coalesce\(new\.account_kind::text, 'real'\) <> 'real'[\s\S]{0,120}seed_fleet_id/.test(fn), "INSERT must use the defaults");
assert.ok(/raise exception 'profile_label_locked'/.test(fn), "clear error");
assert.ok(/drop trigger if exists profiles_a_lock_account_labels on public\.profiles;/.test(sql), "idempotent");
assert.ok(/create trigger profiles_a_lock_account_labels\s+before insert or update on public\.profiles/.test(sql), "fires on every insert/update");
/* Fires before the handle trigger (name order), so the fleet Pro-page fill-in still works. */
assert.ok("profiles_a_lock_account_labels" < "profiles_block_reserved_handle", "lock runs first");
console.log("reserved-handle-label-lock: ok");
