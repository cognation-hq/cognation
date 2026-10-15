-- 13+ signup: keyed email fingerprints of CLOSED under-13 accounts.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor.
--
-- fp = hex(HMAC-SHA256(lowercase(trim(email)), COPPA_EMAIL_PEPPER)).
-- The pepper is a Cloudflare Pages env var only; it is never stored in the DB.
-- No raw emails, birthdates or signup attempts are stored anywhere. Rows are
-- added ONLY when Investigator confirms an under-13 account and closes it.

create table if not exists public.coppa_email_fingerprints (
  fp text primary key check (fp ~ '^[0-9a-f]{64}$'),
  closed_at timestamptz not null default now()
);

alter table public.coppa_email_fingerprints enable row level security;
-- No policies: anon/authenticated cannot select, insert, update or delete.
revoke all on public.coppa_email_fingerprints from anon, authenticated;

-- Signup check (called server-side by /api/signup-check with the publishable key).
-- Answers yes/no for one exact fingerprint; cannot list the table.
create or replace function public.coppa_email_fingerprint_blocked(fp text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coppa_email_fingerprints f
    where f.fp = lower(coppa_email_fingerprint_blocked.fp)
  );
$$;

revoke all on function public.coppa_email_fingerprint_blocked(text) from public;
grant execute on function public.coppa_email_fingerprint_blocked(text) to anon, authenticated, service_role;

-- Investigator close action. No admin/moderator role exists yet, so this is
-- service_role / SQL-editor only (manual step, see docs/coppa-under13-close.md).
create or replace function public.coppa_record_closed_u13(fp text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.coppa_email_fingerprints (fp)
  values (lower(coppa_record_closed_u13.fp))
  on conflict (fp) do nothing;
$$;

revoke all on function public.coppa_record_closed_u13(text) from public, anon, authenticated;
grant execute on function public.coppa_record_closed_u13(text) to service_role;

comment on table public.coppa_email_fingerprints is
  '13+ gate: HMAC-SHA256 email fingerprints of closed under-13 accounts. No raw emails. Pepper is env-only (COPPA_EMAIL_PEPPER).';
