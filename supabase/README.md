# Cognation Supabase setup

The browser is configured for Cognation's Supabase project. Before enabling
multi-user UI flows, create the database objects:

1. In Supabase, open **SQL Editor** → **New query**.
2. Paste and run `migrations/20260924_cognation_social.sql`.
3. For SeedOps fleet columns, run `migrations/20261002_seedops_account_kind.sql`.
4. For shared-website wave provision, run `migrations/20261002_seedops_provision_wave.sql` (see `docs/seedops-provision.md`). Wave 1 default: `provision_seed_wave(0, 100)`. Free-trial Demo max = **250** seeds (+3 ops); do not auto-grow past 250 without Alexa unlock.
5. For auth binding helpers, run `migrations/20261002_seedops_auth_binding.sql`, then Eng/SeedOps runs `node scripts/seedops-bind-auth.mjs` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SEEDOPS_AUTH_PASSWORD` (never commit secrets).
6. In **Authentication** → **Providers** → **Email**, enable email/password.
7. For the initial preview, turn off **Confirm email** only if you need
   immediate test logins. Turn it back on before inviting real users. Bound seeds are confirmed via Admin API.
8. Add the deployed Cognation address in **Authentication** → **URL
   Configuration** → **Site URL** and **Redirect URLs**.

The Supabase URL and publishable key are not committed. Cloudflare Pages
reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` and serves them from
`/runtime-config`. `js/cognation-config.js` only holds empty defaults.
Never place the Supabase `service_role` secret in frontend JavaScript or commit
it to the repository.
