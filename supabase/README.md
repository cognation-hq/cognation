# Cognation Supabase setup

The browser is configured for Cognation's Supabase project. Before enabling
multi-user UI flows, create the database objects:

1. In Supabase, open **SQL Editor** → **New query**.
2. Paste and run `migrations/20260924_cognation_social.sql`.
3. For SeedOps fleet columns, run `migrations/20261002_seedops_account_kind.sql`.
4. For shared-website wave provision, run `migrations/20261002_seedops_provision_wave.sql` (see `docs/seedops-provision.md`).
5. In **Authentication** → **Providers** → **Email**, enable email/password.
6. For the initial preview, turn off **Confirm email** only if you need
   immediate test logins. Turn it back on before inviting real users.
7. Add the deployed Cognation address in **Authentication** → **URL
   Configuration** → **Site URL** and **Redirect URLs**.

The Supabase URL and publishable key are not committed. Cloudflare Pages
reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` and serves them from
`/runtime-config`. `js/cognation-config.js` only holds empty defaults.
Never place the Supabase `service_role` secret in frontend JavaScript or commit
it to the repository.
