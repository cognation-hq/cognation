# Closing a confirmed under-13 account (Investigator, manual for now)

There is no admin/moderator role in the schema yet, so the close action is a
manual SQL-editor step. When one exists, wrap `coppa_record_closed_u13` in a
role-checked endpoint.

1. Confirm on clear information only (self-stated age or credible report; never appearance, never face scanning).
2. Compute the fingerprint locally (email read from stdin, not shell history):
   `COPPA_EMAIL_PEPPER=<same value as Pages env> node scripts/coppa-fingerprint.mjs`
3. In the Supabase SQL editor: `select public.coppa_record_closed_u13('<64-hex fingerprint>');`
4. Delete the account (Supabase Auth → Users → delete) so its data cascades.
5. Do not write the raw email into tickets, notes, or chat.

Setup (once): run `supabase/migrations/20261014_coppa_email_fingerprints.sql`, and set the
Pages secret `COPPA_EMAIL_PEPPER` (long random value; changing it invalidates every stored fingerprint).
