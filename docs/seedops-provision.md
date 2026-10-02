# SeedOps — wave provision (shared website fleet)

Idempotent Supabase provision for the **shared** seed fleet (`seed-0001`…`seed-1000`) and three ops bots. This is **not** the localStorage `materializeSample` helper in `js/seedops-schema.js`.

Schema fit: `supabase/migrations/20261002_seedops_account_kind.sql` + `js/seedops-schema.js` (`FIRST_NAMES`, `buildSeedRecord`, `OPS_BOTS`).

## What lands

Migration: `supabase/migrations/20261002_seedops_provision_wave.sql`

| Piece | Behavior |
|-------|----------|
| `provision_seed_wave(offset, limit)` | Upserts a wave of seed profiles by `seed_fleet_id`; always upserts ops bots first |
| `provision_ops_bots()` | Upserts `ops-curator`, `ops-mod`, `ops-wire` (`account_kind='ops'`) |
| Unique index | `profiles_seed_fleet_id_uidx` on `seed_fleet_id` (non-null) |

Each seed row:

- `account_kind = 'seed'`
- `seed_fleet_id = seed-0001` … `seed-1000` (1-based, zero-padded)
- `display_name` = plain first name only (same cycle as `FIRST_NAMES` / `buildSeedRecord`)
- `handle` = `seed-<slug>-<nnnn>` (machine id)

Ops bots: `ops-curator` / `ops-mod` / `ops-wire` with display names Curator / Moderator / Wire.

**No public Demo unlock UI** is added. Pages stay free of public demo unlock controls.

## Prerequisites

1. Apply `20260924_cognation_social.sql` (profiles + auth signup trigger).
2. Apply `20261002_seedops_account_kind.sql` (`account_kind`, `seed_fleet_id`).
3. Apply `20261002_seedops_provision_wave.sql` (this wave RPC).

Run in Supabase **SQL Editor** as a privileged role (same as prior Cognation migrations), or via CLI against the project.

## How to run a wave

### SQL Editor (service role / postgres)

```sql
-- Wave 1: seed-0001 … seed-0100 (+ ops bots)
select public.provision_seed_wave(0, 100);

-- Wave 2: seed-0101 … seed-0200
select public.provision_seed_wave(100, 100);

-- Continue until 1000, e.g. last wave:
select public.provision_seed_wave(900, 100);
```

Args match `CognationSeedOps.listSeedAccounts({ offset, limit })`: **0-based offset**, `limit` capped at fleet size 1000. Re-running the same wave is safe (upsert by `seed_fleet_id`).

Return JSON shape:

```json
{
  "ok": true,
  "fleetSize": 1000,
  "offset": 0,
  "limit": 100,
  "seedUpserted": 100,
  "opsBots": 3,
  "fromFleetId": "seed-0001",
  "toFleetId": "seed-0100",
  "seedFleetIds": ["seed-0001", "…"]
}
```

### RPC (service role key only)

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/provision_seed_wave" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_offset":0,"p_limit":100}'
```

Never put the service role key in frontend JS or Pages.

### Ops bots only

```sql
select * from public.provision_ops_bots();
```

## Auth.users stubs (gap → PR #2)

`profiles.user_id` is `NOT NULL` and references `auth.users(id)`. This migration therefore creates **minimal stub** `auth.users` (+ `auth.identities` email rows) with:

- Deterministic UUID: `md5('cognation.seedops.v1:' || seed_fleet_id)::uuid`
- Internal emails: `seed-NNNN@seed.cognation.internal`, `ops-*@ops.cognation.internal`
- Unusable bcrypt password (`seedops-disabled-…`) — **not** for human login

Signup trigger `create_profile_for_new_user` may create the personal profile on first auth insert; the wave then stamps `account_kind` / `seed_fleet_id` / handle / display_name.

### Still needed in PR #2 (auth binding)

- Usable seed/ops sign-in (Admin API or controlled passwords), if SeedOps must act as those accounts in the browser
- Align identities / email confirmation / banned flags with GoTrue version quirks
- Optional: map stub users to a dedicated Auth app metadata flag and RLS helpers
- Optional: scripted roll of all 10 waves with logging / dry-run

Until PR #2, treat stubs as **DB presence for social graph / News / friend-gate testing**, not as public login accounts.
