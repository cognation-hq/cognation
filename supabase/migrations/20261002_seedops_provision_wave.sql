-- SeedOps wave provision: idempotent upsert of seed fleet profiles + ops bots.
-- Callable with service_role (SQL Editor or rpc). See docs/seedops-provision.md.
--
-- Matching js/seedops-schema.js: FIRST_NAMES, buildSeedRecord, OPS_BOTS, FLEET_SIZE=1000.
-- profiles.user_id → auth.users is NOT NULL; this migration creates minimal stub
-- auth.users (+ identities) so the FK is satisfied. Full login/auth binding = PR #2.

create extension if not exists pgcrypto with schema extensions;

create unique index if not exists profiles_seed_fleet_id_uidx
  on public.profiles (seed_fleet_id)
  where seed_fleet_id is not null;

create or replace function public.seedops_fleet_size()
returns int
language sql
immutable
as $$ select 1000 $$;

create or replace function public.seedops_first_name_at(p_index int)
returns text
language plpgsql
immutable
as $$
declare
  names text[] := array[
    'Ada','Aisha','Alex','Amir','Ana','Andre','Aria','Asher','Ava','Bea',
    'Ben','Blair','Cam','Cara','Chris','Cora','Dana','Dev','Drew','Eden',
    'Eli','Ella','Emma','Ezra','Finn','Fran','Gabe','Gia','Grey','Hank',
    'Harper','Hazel','Ian','Imani','Iris','Ivan','Jade','Jamie','Jay','Jess',
    'Jordan','Jules','Kai','Kara','Ken','Kim','Kit','Lane','Leo','Lex',
    'Lila','Liv','Luna','Mae','Mara','Max','Maya','Micah','Mila','Mina',
    'Morgan','Nia','Nik','Noa','Nora','Omar','Ora','Owen','Pax','Pearl',
    'Quinn','Rae','Remy','Rio','Robin','Rosa','Rowan','Sage','Sam','Sasha',
    'Shawn','Skye','Sol','Talia','Tess','Theo','Tia','Troy','Uma','Uri',
    'Val','Vera','Vince','Wade','Wes','Will','Wren','Xander','Yara','Zoe',
    'Ari','Bo','Cal','Dee','Eve','Faye','Gus','Hoyt','Ivy','Jo',
    'Kade','Lou','Mo','Ned','Otis','Pip','Quill','Reed','Syd','Ted',
    'Uli','Vic','Wynn','York','Zed','Ash','Blake','Casey','Dale','Ellis',
    'Frankie','Glen','Harley','Indie','Jackie','Kelly','Leslie','Marley','Nicky','Oakley',
    'Parker','Reese','Sidney','Taylor','Whitney','Avery','Bailey','Cameron','Dakota','Emerson',
    'Finley','Hayden','Jordan','Kendall','Logan','Morgan','Peyton','Quinn','Riley','Sawyer',
    'Charlie','Frankie','Jamie','Jessie','Pat','Ronnie','Stevie','Terry','Tracy','Bobby'
  ];
  n int := coalesce(array_length(names, 1), 0);
  i int;
begin
  if n < 1 then
    return 'Seed';
  end if;
  i := ((coalesce(p_index, 0) % n) + n) % n;
  return names[i + 1];
end;
$$;

create or replace function public.seedops_slugify(p_name text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      left(regexp_replace(lower(trim(coalesce(p_name, 'seed'))), '[^a-z]+', '', 'g'), 16),
      ''
    ),
    'seed'
  );
$$;

create or replace function public.seedops_pad4(p_n int)
returns text
language sql
immutable
as $$
  select lpad(greatest(p_n, 0)::text, 4, '0');
$$;

-- Deterministic stub UUID for a fleet id (not for production login secrets).
create or replace function public.seedops_stub_user_id(p_fleet_id text)
returns uuid
language sql
immutable
as $$
  select md5('cognation.seedops.v1:' || coalesce(p_fleet_id, ''))::uuid;
$$;

create or replace function public.seedops_ensure_stub_auth_user(
  p_fleet_id text,
  p_handle text,
  p_display_name text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid := public.seedops_stub_user_id(p_fleet_id);
  existing uuid;
begin
  select id into existing from auth.users where id = uid;
  if existing is not null then
    update auth.users
    set
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'handle', p_handle,
        'display_name', p_display_name,
        'seed_fleet_id', p_fleet_id
      ),
      updated_at = now()
    where id = uid;
    return uid;
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid,
    'authenticated',
    'authenticated',
    p_email,
    -- Unusable stub hash; real passwords / Admin API binding = PR #2
    extensions.crypt('seedops-disabled-' || uid::text, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'handle', p_handle,
      'display_name', p_display_name,
      'seed_fleet_id', p_fleet_id
    ),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  );

  -- Newer GoTrue expects an identity row for email provider.
  if not exists (
    select 1 from auth.identities
    where user_id = uid and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      uid,
      uid,
      jsonb_build_object(
        'sub', uid::text,
        'email', p_email,
        'email_verified', true
      ),
      'email',
      uid::text,
      now(),
      now(),
      now()
    );
  end if;

  return uid;
exception
  when unique_violation then
    select id into existing from auth.users where id = uid;
    if existing is not null then
      return uid;
    end if;
    raise;
end;
$$;

create or replace function public.seedops_upsert_fleet_profile(
  p_fleet_id text,
  p_account_kind public.cognation_account_kind,
  p_handle text,
  p_display_name text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  pid uuid;
begin
  if p_fleet_id is null or p_fleet_id = '' then
    raise exception 'seed_fleet_id required';
  end if;
  if p_handle !~ '^[a-z0-9_-]{3,40}$' then
    raise exception 'invalid handle: %', p_handle;
  end if;

  select id into pid
  from public.profiles
  where seed_fleet_id = p_fleet_id and kind = 'personal'
  limit 1;

  if pid is not null then
    update public.profiles
    set
      handle = p_handle,
      display_name = left(p_display_name, 80),
      account_kind = p_account_kind,
      updated_at = now()
    where id = pid;
    return pid;
  end if;

  uid := public.seedops_ensure_stub_auth_user(p_fleet_id, p_handle, p_display_name, p_email);

  select id into pid
  from public.profiles
  where user_id = uid and kind = 'personal'
  limit 1;

  if pid is not null then
    update public.profiles
    set
      handle = p_handle,
      display_name = left(p_display_name, 80),
      account_kind = p_account_kind,
      seed_fleet_id = p_fleet_id,
      updated_at = now()
    where id = pid;
    return pid;
  end if;

  insert into public.profiles (
    user_id,
    kind,
    handle,
    display_name,
    account_kind,
    seed_fleet_id
  ) values (
    uid,
    'personal',
    p_handle,
    left(p_display_name, 80),
    p_account_kind,
    p_fleet_id
  )
  returning id into pid;

  return pid;
end;
$$;

create or replace function public.provision_ops_bots()
returns table (
  seed_fleet_id text,
  profile_id uuid,
  handle text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  pid uuid;
begin
  for r in
    select * from (
      values
        ('ops-curator', 'Curator', 'ops-curator'),
        ('ops-mod', 'Moderator', 'ops-mod'),
        ('ops-wire', 'Wire', 'ops-wire')
    ) as t(fleet_id, disp, hnd)
  loop
    pid := public.seedops_upsert_fleet_profile(
      r.fleet_id,
      'ops'::public.cognation_account_kind,
      r.hnd,
      r.disp,
      r.fleet_id || '@ops.cognation.internal'
    );
    seed_fleet_id := r.fleet_id;
    profile_id := pid;
    handle := r.hnd;
    display_name := r.disp;
    return next;
  end loop;
end;
$$;

-- Wave provision: offset+limit over 0-based indices (same as CognationSeedOps.listSeedAccounts).
-- Example: provision_seed_wave(0, 100) → seed-0001…seed-0100; then (100, 100) → seed-0101…seed-0200.
create or replace function public.provision_seed_wave(
  p_offset int default 0,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fleet int := public.seedops_fleet_size();
  off int := greatest(coalesce(p_offset, 0), 0);
  lim int := least(fleet, greatest(coalesce(p_limit, 0), 0));
  i int;
  nnn text;
  fname text;
  fleet_id text;
  hnd text;
  pid uuid;
  upserted int := 0;
  ops_count int := 0;
  seed_ids text[] := array[]::text[];
begin
  if off >= fleet then
    raise exception 'offset % beyond fleet size %', off, fleet;
  end if;

  perform public.provision_ops_bots();
  select count(*)::int into ops_count
  from public.profiles
  where account_kind = 'ops' and seed_fleet_id like 'ops-%';

  i := off;
  while i < off + lim and i < fleet loop
    fname := public.seedops_first_name_at(i);
    nnn := public.seedops_pad4(i + 1);
    fleet_id := 'seed-' || nnn;
    hnd := 'seed-' || public.seedops_slugify(fname) || '-' || nnn;
    pid := public.seedops_upsert_fleet_profile(
      fleet_id,
      'seed'::public.cognation_account_kind,
      hnd,
      fname,
      fleet_id || '@seed.cognation.internal'
    );
    upserted := upserted + 1;
    seed_ids := array_append(seed_ids, fleet_id);
    i := i + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'fleetSize', fleet,
    'offset', off,
    'limit', lim,
    'seedUpserted', upserted,
    'opsBots', ops_count,
    'fromFleetId', case when upserted > 0 then seed_ids[1] else null end,
    'toFleetId', case when upserted > 0 then seed_ids[array_length(seed_ids, 1)] else null end,
    'seedFleetIds', to_jsonb(seed_ids)
  );
end;
$$;

revoke all on function public.seedops_ensure_stub_auth_user(text, text, text, text) from public;
revoke all on function public.seedops_upsert_fleet_profile(text, public.cognation_account_kind, text, text, text) from public;
revoke all on function public.provision_ops_bots() from public;
revoke all on function public.provision_seed_wave(int, int) from public;

grant execute on function public.provision_ops_bots() to service_role;
grant execute on function public.provision_seed_wave(int, int) to service_role;

comment on function public.provision_seed_wave(int, int) is
  'SeedOps: idempotent wave upsert of seed-* profiles (+ ops bots). service_role only. See docs/seedops-provision.md.';
