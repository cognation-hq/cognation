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
var dir = path.join(__dirname, "..", "supabase", "migrations");
var LOCK = "20261022_01_lock_account_labels.sql";
var HANDLE = "20261022_02_reserved_handle_fleet_owner.sql";
var sql = fs.readFileSync(path.join(dir, LOCK), "utf8");
var handleSql = fs.readFileSync(path.join(dir, HANDLE), "utf8");
/* Split (PM, Oct 22): the lock is its own file, ordered first; the handle file has no lock. */
assert.ok(!fs.existsSync(path.join(dir, "20261022_reserved_handle_fleet_owner.sql")), "old combined file gone");
var names = fs.readdirSync(dir).sort();
assert.ok(names.indexOf(LOCK) !== -1 && names.indexOf(LOCK) < names.indexOf(HANDLE), "lock migration sorts first");
assert.ok(!/profiles_block_reserved_handle/.test(sql.replace(/^--.*$/gm, "")), "lock file is only the lock");
assert.ok(!/profiles_lock_account_labels|profiles_a_lock_account_labels/.test(handleSql), "handle file has no lock");
assert.ok(/owner_is_fleet/.test(handleSql) && /Run AFTER 01_lock_account_labels\.sql/.test(handleSql), "handle file keeps the fleet exception and says it runs after 01");
/* PM, Oct 22: the owner lookup with LIMIT 1 is ordered so it always picks the same row. */
assert.ok(/p\.kind = 'personal'\s+order by p\.created_at, p\.id\s+limit 1;/.test(handleSql), "owner lookup is deterministic (order by created_at, id)");
/* Fleet Pro-page fill-in sets ONLY account_kind. seed_fleet_id is unique (profiles_seed_fleet_id_uidx)
   and the owner's Personal page already holds it, so copying it would make every seed Pro create fail. */
var handleCode = handleSql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
assert.ok(/new\.account_kind := case when owner_kind in \('seed', 'ops'\) then owner_kind else 'seed' end;/.test(handleCode), "fleet Pro page gets the owner's account_kind");
assert.ok(!/new\.seed_fleet_id\s*:=/.test(handleCode), "must not copy seed_fleet_id onto the new Pro page (unique index)");
var provision = fs.readFileSync(path.join(dir, "20261002_seedops_provision_wave.sql"), "utf8");
assert.ok(/create unique index if not exists profiles_seed_fleet_id_uidx\s+on public\.profiles \(seed_fleet_id\)/.test(provision), "fleet id is unique, which is why it is not copied");
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
