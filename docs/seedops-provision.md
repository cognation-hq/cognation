# SeedOps — wave provision + auth binding (shared website fleet)

Idempotent Supabase provision for the **shared** seed fleet and three ops bots. This is **not** the localStorage `materializeSample` helper in `js/seedops-schema.js`.

Schema fit: `supabase/migrations/20261002_seedops_account_kind.sql` + `js/seedops-schema.js` (`FIRST_NAMES`, `buildSeedRecord`, `OPS_BOTS`).

## Free-trial Demo caps (LOCKED)

| Cap | Value | Rule |
|-----|-------|------|
| Wave 1 | **100** seeds | Default: `provision_seed_wave(0, 100)` |
| Free-trial Demo max | **250** seeds (+ **3** ops) | Grow past Wave 1 **only after Wave 1 is green** |
| Beyond 250 | Alexa unlock | Scripts refuse without `--unlock-fleet` / `SEEDOPS_UNLOCK_FLEET=1` |

Schema still knows fleet ids `seed-0001`…`seed-1000` for id math; **do not auto-grow** provision or auth-bind past the caps above. No public Demo unlock UI.

## What lands

### #1 Wave provision

Migration: `supabase/migrations/20261002_seedops_provision_wave.sql`

| Piece | Behavior |
|-------|----------|
| `provision_seed_wave(offset, limit)` | Upserts a wave of seed profiles by `seed_fleet_id`; always upserts ops bots first |
| `provision_ops_bots()` | Upserts `ops-curator`, `ops-mod`, `ops-wire` (`account_kind='ops'`) |
| Unique index | `profiles_seed_fleet_id_uidx` on `seed_fleet_id` (non-null) |

Each seed row:

- `account_kind = 'seed'`
- `seed_fleet_id = seed-0001` … (1-based, zero-padded)
- `display_name` = plain first name only (same cycle as `FIRST_NAMES` / `buildSeedRecord`)
- `handle` = `seed-<slug>-<nnnn>` (machine id)

Ops bots: `ops-curator` / `ops-mod` / `ops-wire` with display names Curator / Moderator / Wire.

### #2 Auth binding

| Piece | Behavior |
|-------|----------|
| `scripts/seedops-bind-auth.mjs` | Service-role **Admin API** upsert: confirm email + set shared ops password on deterministic stub UUIDs |
| `20261002_seedops_auth_binding.sql` | `seedops_demo_cap()`=250, `seedops_wave1_limit()`=100, `seedops_auth_binding_status(offset, limit)` |
| App metadata | `seedops: true`, `account_kind`, `seed_fleet_id` on bound users |

Deterministic UUID (same as #1 stubs): `md5('cognation.seedops.v1:' || seed_fleet_id)::uuid`.

Internal emails: `seed-NNNN@seed.cognation.internal`, `ops-*@ops.cognation.internal`.

**Friend graph:** `send_friend_request` uses `auth.uid()`. After binding, SeedOps can sign in as seed/ops (ops-only password) so **seed↔seed** (and ops↔seed) friending works. **real↛seed** stays blocked (`real_seed_friend_blocked` in `20261002_seedops_account_kind.sql` + `js/seedops-friend-gate.js`).

**No public Demo unlock UI** is added. Pages stay free of public demo unlock controls. Never put the service role key or `SEEDOPS_AUTH_PASSWORD` in frontend JS or Pages.

## Prerequisites

1. Apply `20260924_cognation_social.sql` (profiles + auth signup trigger).
2. Apply `20261002_seedops_account_kind.sql` (`account_kind`, `seed_fleet_id`, friend gate).
3. Apply `20261002_seedops_provision_wave.sql` (wave RPC + stubs).
4. Apply `20261002_seedops_auth_binding.sql` (cap helpers + status RPC).
5. Enable Email provider in Supabase Auth (password sign-in).

Run SQL in Supabase **SQL Editor** as a privileged role, or via CLI against the project.

## How to run Wave 1 (default)

### 1) Provision profiles + stub auth.users

```sql
-- Wave 1: seed-0001 … seed-0100 (+ ops bots). Default free-trial start.
select public.provision_seed_wave(0, 100);
```

RPC (service role key only):

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/provision_seed_wave" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_offset":0,"p_limit":100}'
```

### 2) Bind usable Auth passwords (Admin API)

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="…"   # never commit
export SEEDOPS_AUTH_PASSWORD="…"      # ≥12 chars; ops-only shared password; never commit

# Dry-run plan (Wave 1 defaults)
node scripts/seedops-bind-auth.mjs --dry-run

# Bind Wave 1 + 3 ops
node scripts/seedops-bind-auth.mjs
# equivalent: --offset 0 --limit 100
```

Script caps:

- Default end ≤ **100** (Wave 1).
- Past 100 up to **250**: requires `--allow-grow` or `SEEDOPS_ALLOW_GROW=1` (only after Wave 1 green).
- Past **250**: requires `--unlock-fleet` or `SEEDOPS_UNLOCK_FLEET=1` (Alexa).

Ops only:

```bash
node scripts/seedops-bind-auth.mjs --ops-only
```

### 3) Status check (optional)

```sql
select public.seedops_auth_binding_status(0, 100);
```

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/seedops_auth_binding_status" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_offset":0,"p_limit":100}'
```

Password usability is **not** visible in SQL status; confirm by signing in as a seed email with `SEEDOPS_AUTH_PASSWORD`, then calling `send_friend_request` seed→seed.

## Growing toward Demo max 250 (after Wave 1 green)

```sql
-- Example: next 150 seeds → seed-0101 … seed-0250 (explicit; not automatic)
select public.provision_seed_wave(100, 150);
```

```bash
node scripts/seedops-bind-auth.mjs --offset 100 --limit 150 --allow-grow
```

Do **not** script a loop that auto-fills to 1000. Stop at 250 unless Alexa unlocks.

## Auth.users stubs (#1) vs binding (#2)

`profiles.user_id` is `NOT NULL` and references `auth.users(id)`. Wave provision creates **minimal stub** `auth.users` (+ `auth.identities` email rows) with unusable bcrypt (`seedops-disabled-…`).

`seedops-bind-auth.mjs` then:

1. Looks up each deterministic UUID via Auth Admin API.
2. **Updates** password + `email_confirm` + seedops `app_metadata` / `user_metadata` (or **creates** the user if the stub is missing and `--no-create` was not set).
3. Best-effort stamps `profiles.account_kind` / `seed_fleet_id` / handle / display_name via service-role REST.

Signup trigger `create_profile_for_new_user` may create the personal profile on first auth insert; wave provision / bind script then stamps SeedOps fields.

## #3 Ops trigger (internal pathway kick)

After Wave 1 profiles + auth bind, SeedOps / ops bots need a **controlled internal trigger** to smoke fleet pathways without any public Demo unlock UI.

| Piece | Behavior |
|-------|----------|
| `js/seedops-ops-trigger.js` → `window.CognationSeedOpsTrigger` | Arms only for `account_kind` **ops** or **seed** with seedops metadata / known ops fleet ids (`ops-curator`, `ops-mod`, `ops-wire`). Never for real users. |
| Pathway kick | `triggerPathway(name, seedFleetId?)` / `triggerAll(seedFleetId?)` → existing `CognationSeedOpsPathways` |
| Events | Channel `ops-trigger` via `CognationSeedOpsLog` + `cognation:seedops-ops-trigger` |
| Thin chrome | Hash `#seedops-ops` (or `?seedops-ops=1`) opens a small operator panel **only when armed**. Unreachable to real users. No Demo unlock copy/controls. |
| Act-as policy | Target must be a seed/ops `seed_fleet_id`. **Real-user targets are refused.** Act-as sets pathway **context only** — it does **not** impersonate `auth.uid()`, spoof friend requests, or bypass `CognationSeedOpsFriendGate` / SQL `real_seed_friend_blocked`. |

### How SeedOps runs Wave 1 pathway smoke (after auth bind)

1. Apply migrations + `provision_seed_wave(0, 100)` + `node scripts/seedops-bind-auth.mjs` (hooks #1 / #2).
2. Sign in as an ops bot or seed (e.g. `ops-curator@ops.cognation.internal` / `seed-0001@seed.cognation.internal` with `SEEDOPS_AUTH_PASSWORD`).
3. Console / RPC:

```js
// Must be armed (ops or seedops seed session)
CognationSeedOpsTrigger.isArmed() // true

// Kick one pathway for Wave 1 seed context
CognationSeedOpsTrigger.triggerPathway("tower", "seed-0001")
CognationSeedOpsTrigger.triggerPathway("circle", "seed-0001")

// Or all pathways
CognationSeedOpsTrigger.triggerAll("seed-0001")

// Optional operator panel (armed sessions only)
location.hash = "seedops-ops"
```

4. Inspect `CognationSeedOpsLog.list("ops-trigger")` and pathway events (`cognation:seedops-pathway-*`).

Caps unchanged: Wave 1 = **100**; free-trial Demo max = **250** (+3 ops). Soft budget 1000 with 750 real headroom — no auto-grow.

## #4 Shared Tower seed content

After Wave 1 bind (+ optional #3 pathway smoke), SeedOps can generate deterministic wellness-tone Tower posts so the fleet scrapbook feels alive and the News path (post → curator → age floor → newspaper) can be exercised.

| Piece | Behavior |
|-------|----------|
| `js/seedops-tower-posts.js` → `window.CognationSeedOpsTowerPosts` | Deterministic first-name-safe G/PG posts; Wave window default `(0,100)`; hard stop at Demo cap **250** unless `unlockFleet` |
| Write path | Prefer `CognationSupabaseSocial.createTowerPost` when signed in as that seed (client path via #2/#3). Else `CognationTowerStore` local/demo, or SeedOps overlay `cognation.seedops.tower.posts.v1` when Tower is remote for another session |
| News hooks | Each seeded post emits `tower-posts` log + `CognationSeedOpsNewsLog` rank/age_floor/render stages |
| Ops trigger | `triggerPathway("tower", id)` optionally seeds one post; `CognationSeedOpsTrigger.postWave` / `postOne` passthrough when armed |

### How SeedOps runs Wave 1 Tower seed (after bind)

1. Hooks #1 / #2 applied; optionally signed in as ops or a seed.
2. Console:

```js
// Wave 1 shared Tower content (local/demo store + News log)
CognationSeedOpsTowerPosts.postWave({ offset: 0, limit: 100 })

// One seed
CognationSeedOpsTowerPosts.postOne("seed-0001")

// Via armed ops trigger (same caps / act-as rules)
CognationSeedOpsTrigger.isArmed() // true when ops/seedops session
CognationSeedOpsTrigger.postWave({ offset: 0, limit: 100 })
CognationSeedOpsTrigger.triggerPathway("tower", "seed-0001") // pathway smoke + one seed post
```

3. Inspect `CognationSeedOpsLog.list("tower-posts")` and `CognationSeedOpsLog.list("news")`.

**Live Supabase multi-seed write:** sign in as each seed (or the target seed) and call `postOne` without `localOnly` so the client path posts as `auth.uid()`. Bulk service-role apply is **out of scope** for #4 (never put service role / `SEEDOPS_AUTH_PASSWORD` in frontend).

### Still later — gaps after #4

- Live Supabase apply / running bind against production (Alexa SQL; box cannot)
- Bulk service-role Tower insert for all 100 without per-seed sign-in
- Scheduled or CI-wrapped Wave 1 green → optional grow-to-250 gate
- Rotating / per-seed passwords (today: one shared `SEEDOPS_AUTH_PASSWORD`)
- Optional RLS helpers that trust `app_metadata.seedops` for service paths

## Friend policy reminder

| Pair | Result |
|------|--------|
| real ↔ real | OK |
| seed ↔ seed | OK (after auth binding) |
| ops ↔ seed/ops | OK |
| real ↔ seed/ops | **Blocked** (`real_seed_friend_blocked`) |
