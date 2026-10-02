-- SeedOps #2: auth-binding helpers (Admin API script does password work).
-- Free-trial Demo cap = 250 seeds (+3 ops). Wave 1 = 100.
-- See docs/seedops-provision.md and scripts/seedops-bind-auth.mjs.

create or replace function public.seedops_demo_cap()
returns int
language sql
immutable
as $$ select 250 $$;

create or replace function public.seedops_wave1_limit()
returns int
language sql
immutable
as $$ select 100 $$;

comment on function public.seedops_demo_cap() is
  'Free-trial Demo max seed count (+3 ops). Never exceed without Alexa unlock.';
comment on function public.seedops_wave1_limit() is
  'Default Wave 1 size for provision_seed_wave(0, 100). Grow to demo_cap only after Wave 1 green.';

-- Status for a wave: which fleet ids have auth.users + profiles ready for bind/sign-in.
create or replace function public.seedops_auth_binding_status(
  p_offset int default 0,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  fleet int := public.seedops_fleet_size();
  demo int := public.seedops_demo_cap();
  off int := greatest(coalesce(p_offset, 0), 0);
  lim int := least(fleet, greatest(coalesce(p_limit, 0), 0));
  i int;
  nnn text;
  fleet_id text;
  uid uuid;
  has_user boolean;
  has_profile boolean;
  kind public.cognation_account_kind;
  ready int := 0;
  missing_user int := 0;
  missing_profile int := 0;
  rows jsonb := '[]'::jsonb;
  ops_ready int := 0;
  r record;
begin
  if off >= fleet then
    raise exception 'offset % beyond fleet size %', off, fleet;
  end if;
  if off + lim > demo then
    raise exception
      'status window end % exceeds free-trial Demo cap % (Alexa unlock required to inspect beyond)',
      off + lim, demo;
  end if;

  for r in
    select * from (
      values
        ('ops-curator'),
        ('ops-mod'),
        ('ops-wire')
    ) as t(fleet_id)
  loop
    uid := public.seedops_stub_user_id(r.fleet_id);
    select exists(select 1 from auth.users u where u.id = uid) into has_user;
    select exists(
      select 1 from public.profiles p
      where p.seed_fleet_id = r.fleet_id and p.kind = 'personal'
    ) into has_profile;
    if has_user and has_profile then
      ops_ready := ops_ready + 1;
    end if;
    rows := rows || jsonb_build_array(jsonb_build_object(
      'seedFleetId', r.fleet_id,
      'accountKind', 'ops',
      'userId', uid,
      'hasAuthUser', has_user,
      'hasProfile', has_profile
    ));
  end loop;

  i := off;
  while i < off + lim and i < fleet loop
    nnn := public.seedops_pad4(i + 1);
    fleet_id := 'seed-' || nnn;
    uid := public.seedops_stub_user_id(fleet_id);
    select exists(select 1 from auth.users u where u.id = uid) into has_user;
    select exists(
      select 1 from public.profiles p
      where p.seed_fleet_id = fleet_id and p.kind = 'personal'
    ) into has_profile;
    select p.account_kind into kind
    from public.profiles p
    where p.seed_fleet_id = fleet_id and p.kind = 'personal'
    limit 1;

    if has_user and has_profile then
      ready := ready + 1;
    elsif not has_user then
      missing_user := missing_user + 1;
    else
      missing_profile := missing_profile + 1;
    end if;

    rows := rows || jsonb_build_array(jsonb_build_object(
      'seedFleetId', fleet_id,
      'accountKind', coalesce(kind, 'seed'),
      'userId', uid,
      'hasAuthUser', has_user,
      'hasProfile', has_profile
    ));
    i := i + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'demoCap', demo,
    'wave1Limit', public.seedops_wave1_limit(),
    'offset', off,
    'limit', lim,
    'seedsReady', ready,
    'seedsMissingAuthUser', missing_user,
    'seedsMissingProfile', missing_profile,
    'opsReady', ops_ready,
    'note', 'Password usability is set by scripts/seedops-bind-auth.mjs (Admin API), not by this status RPC.',
    'rows', rows
  );
end;
$$;

revoke all on function public.seedops_auth_binding_status(int, int) from public;
grant execute on function public.seedops_auth_binding_status(int, int) to service_role;

comment on function public.seedops_auth_binding_status(int, int) is
  'SeedOps #2: wave readiness (auth.users + profiles). service_role only. Passwords via seedops-bind-auth.mjs.';
