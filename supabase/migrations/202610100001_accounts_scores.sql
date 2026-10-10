create table if not exists public.murdocca_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  total_points bigint not null default 0 check (total_points >= 0),
  solved_cases bigint not null default 0 check (solved_cases >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.murdocca_case_runs (
  user_id uuid not null references public.murdocca_profiles (user_id) on delete cascade,
  case_code text collate "C" not null
    check (case_code ~ '^MD4-(CAFE|DENTAL|LAB)-(MUY_FACIL|FACIL|MEDIO|DIFICIL|EXPERTO)-[0-9A-F]{8}-[0-9A-F]{2}$'),
  status text not null default 'playing' check (status in ('playing', 'revealed', 'solved')),
  points integer not null default 0 check (points >= 0),
  started_at timestamptz not null default now(),
  revealed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, case_code),
  check (
    (status = 'playing' and points = 0 and revealed_at is null and completed_at is null)
    or (status = 'revealed' and points = 0 and revealed_at is not null and completed_at is null)
    or (status = 'solved' and points > 0 and completed_at is not null and revealed_at is null)
  )
);

alter table public.murdocca_profiles enable row level security;
alter table public.murdocca_case_runs enable row level security;

revoke all on table public.murdocca_profiles from public, anon, authenticated, service_role;
revoke all on table public.murdocca_case_runs from public, anon, authenticated, service_role;
grant select on table public.murdocca_profiles to authenticated;

create policy murdocca_profiles_read_self
  on public.murdocca_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.murdocca_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_display_name text;
begin
  v_display_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if v_display_name = '' then
    v_display_name := 'Jugador ' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  v_display_name := left(v_display_name, 80);

  insert into public.murdocca_profiles (user_id, display_name)
  values (new.id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  return new;
end;
$function$;

revoke all on function public.murdocca_sync_profile() from public, anon, authenticated, service_role;
grant execute on function public.murdocca_sync_profile() to supabase_auth_admin;

drop trigger if exists murdocca_sync_profile_after_auth_change on auth.users;
create trigger murdocca_sync_profile_after_auth_change
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.murdocca_sync_profile();

insert into public.murdocca_profiles (user_id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      'Jugador ' || substr(replace(u.id::text, '-', ''), 1, 8)
    ),
    80
  )
from auth.users as u
on conflict (user_id) do update
  set display_name = excluded.display_name,
      updated_at = now();

create or replace function public.murdocca_score_transition(
  p_user_id uuid,
  p_case_code text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_points integer;
  v_status text;
  v_total_points bigint;
  v_solved_cases bigint;
begin
  if p_user_id is null then
    raise exception 'A user id is required.' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('start', 'reveal', 'complete') then
    raise exception 'Unsupported case action.' using errcode = '22023';
  end if;
  if p_case_code is null or p_case_code !~ '^MD4-(CAFE|DENTAL|LAB)-(MUY_FACIL|FACIL|MEDIO|DIFICIL|EXPERTO)-[0-9A-F]{8}-[0-9A-F]{2}$' then
    raise exception 'A canonical MD4 case code is required.' using errcode = '22023';
  end if;

  v_points := case pg_catalog.split_part(p_case_code, '-', 3)
    when 'MUY_FACIL' then 10
    when 'FACIL' then 20
    when 'MEDIO' then 40
    when 'DIFICIL' then 70
    when 'EXPERTO' then 100
    else null
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_case_code, 0)
  );

  if p_action = 'start' then
    insert into public.murdocca_case_runs (user_id, case_code)
    values (p_user_id, p_case_code)
    on conflict (user_id, case_code) do nothing;

    select r.status
      into v_status
      from public.murdocca_case_runs as r
      where r.user_id = p_user_id and r.case_code = p_case_code;

    return pg_catalog.jsonb_build_object(
      'status', v_status,
      'eligible', v_status = 'playing',
      'points', case when v_status = 'playing' then v_points else 0 end
    );
  end if;

  if p_action = 'reveal' then
    update public.murdocca_case_runs as r
      set status = 'revealed',
          revealed_at = coalesce(r.revealed_at, now()),
          updated_at = now()
      where r.user_id = p_user_id
        and r.case_code = p_case_code
        and r.status = 'playing';

    select r.status
      into v_status
      from public.murdocca_case_runs as r
      where r.user_id = p_user_id and r.case_code = p_case_code;
    if not found then
      raise exception 'The case must be started before it can be revealed.' using errcode = 'P0002';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', v_status,
      'eligible', false,
      'points', 0
    );
  end if;

  select r.status
    into v_status
    from public.murdocca_case_runs as r
    where r.user_id = p_user_id and r.case_code = p_case_code
    for update;
  if not found then
    raise exception 'The case must be started before it can be completed.' using errcode = 'P0002';
  end if;

  if v_status = 'playing' then
    update public.murdocca_case_runs as r
      set status = 'solved',
          points = v_points,
          completed_at = now(),
          updated_at = now()
      where r.user_id = p_user_id and r.case_code = p_case_code;

    update public.murdocca_profiles as p
      set total_points = p.total_points + v_points,
          solved_cases = p.solved_cases + 1,
          updated_at = now()
      where p.user_id = p_user_id
      returning p.total_points, p.solved_cases
        into v_total_points, v_solved_cases;

    if not found then
      raise exception 'The account profile is unavailable.' using errcode = 'P0002';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'solved',
      'awarded', true,
      'points', v_points,
      'totalPoints', v_total_points,
      'solvedCases', v_solved_cases
    );
  end if;

  select p.total_points, p.solved_cases
    into v_total_points, v_solved_cases
    from public.murdocca_profiles as p
    where p.user_id = p_user_id;
  if not found then
    raise exception 'The account profile is unavailable.' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'awarded', false,
    'points', 0,
    'totalPoints', v_total_points,
    'solvedCases', v_solved_cases
  );
end;
$function$;

revoke all on function public.murdocca_score_transition(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.murdocca_score_transition(uuid, text, text) to service_role;

create or replace function public.murdocca_leaderboard()
returns table (
  rank bigint,
  display_name text,
  total_points bigint,
  solved_cases bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select
    pg_catalog.row_number() over (
      order by p.total_points desc, p.solved_cases desc, p.display_name collate "C" asc, p.user_id asc
    ) as rank,
    p.display_name,
    p.total_points,
    p.solved_cases
  from public.murdocca_profiles as p;
end;
$function$;

revoke all on function public.murdocca_leaderboard() from public, anon, service_role;
grant execute on function public.murdocca_leaderboard() to authenticated;
