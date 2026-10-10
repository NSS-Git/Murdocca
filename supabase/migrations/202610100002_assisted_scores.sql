alter table public.murdocca_case_runs
  add column if not exists hints_used boolean not null default false;

alter table public.murdocca_case_runs
  drop constraint if exists murdocca_case_runs_check;

alter table public.murdocca_case_runs
  add constraint murdocca_case_runs_completion_check
  check (
    (status = 'playing' and points = 0 and revealed_at is null and completed_at is null)
    or (status = 'revealed' and points = 0 and revealed_at is not null and completed_at is null)
    or (status = 'solved' and completed_at is not null and revealed_at is null)
  );

create or replace function public.murdocca_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    'Jugador ' || substr(replace(new.id::text, '-', ''), 1, 8)
  );
  v_display_name := left(v_display_name, 80);

  insert into public.murdocca_profiles (user_id, display_name)
  values (new.id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  return new;
end;
$function$;

update public.murdocca_profiles as p
  set display_name = left(
        coalesce(
          nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
          nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
          nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
        ),
        80
      ),
      updated_at = now()
  from auth.users as u
  where u.id = p.user_id
    and p.display_name = 'Jugador ' || substr(replace(u.id::text, '-', ''), 1, 8)
    and coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
    ) is not null;

insert into public.murdocca_profiles (user_id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'Jugador ' || substr(replace(u.id::text, '-', ''), 1, 8)
    ),
    80
  )
from auth.users as u
on conflict (user_id) do nothing;

drop function if exists public.murdocca_score_transition(uuid, text, text, boolean);
drop function if exists public.murdocca_score_transition(uuid, text, text);

create function public.murdocca_score_transition(
  p_user_id uuid,
  p_case_code text,
  p_action text,
  p_hints_used boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_points integer;
  v_status text;
  v_hints_used boolean;
  v_awarded boolean := false;
  v_total_points bigint;
  v_solved_cases bigint;
begin
  if p_user_id is null then
    raise exception 'A user id is required.' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('start', 'reveal', 'assist', 'complete') then
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
    insert into public.murdocca_case_runs as r (user_id, case_code, hints_used)
    values (p_user_id, p_case_code, coalesce(p_hints_used, false))
    on conflict (user_id, case_code) do update
      set hints_used = r.hints_used or coalesce(p_hints_used, false),
          updated_at = now()
    returning status, hints_used into v_status, v_hints_used;

    return pg_catalog.jsonb_build_object(
      'status', v_status,
      'eligible', v_status = 'playing' and not v_hints_used,
      'points', case when v_status = 'playing' and not v_hints_used then v_points else 0 end,
      'hintsUsed', v_hints_used
    );
  end if;

  if p_action = 'assist' then
    insert into public.murdocca_case_runs (user_id, case_code, hints_used)
    values (p_user_id, p_case_code, true)
    on conflict (user_id, case_code) do update
      set hints_used = true,
          updated_at = now()
    returning status into v_status;

    return pg_catalog.jsonb_build_object(
      'status', v_status,
      'eligible', false,
      'points', 0,
      'hintsUsed', true
    );
  end if;

  select r.status, r.hints_used
    into v_status, v_hints_used
    from public.murdocca_case_runs as r
    where r.user_id = p_user_id and r.case_code = p_case_code
    for update;
  if not found then
    if p_action = 'reveal' then
      raise exception 'The case must be started before it can be revealed.' using errcode = 'P0002';
    end if;
    raise exception 'The case must be started before it can be completed.' using errcode = 'P0002';
  end if;

  if coalesce(p_hints_used, false) and not v_hints_used then
    update public.murdocca_case_runs as r
      set hints_used = true,
          updated_at = now()
      where r.user_id = p_user_id and r.case_code = p_case_code;
    v_hints_used := true;
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

    return pg_catalog.jsonb_build_object(
      'status', v_status,
      'eligible', false,
      'points', 0,
      'hintsUsed', v_hints_used
    );
  end if;

  if v_status = 'playing' then
    v_awarded := not v_hints_used;

    update public.murdocca_case_runs as r
      set status = 'solved',
          points = case when v_awarded then v_points else 0 end,
          completed_at = now(),
          updated_at = now()
      where r.user_id = p_user_id and r.case_code = p_case_code;

    update public.murdocca_profiles as p
      set total_points = p.total_points + case when v_awarded then v_points else 0 end,
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
      'awarded', v_awarded,
      'points', case when v_awarded then v_points else 0 end,
      'totalPoints', v_total_points,
      'solvedCases', v_solved_cases,
      'hintsUsed', v_hints_used
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
    'solvedCases', v_solved_cases,
    'hintsUsed', v_hints_used
  );
end;
$function$;

revoke all on function public.murdocca_score_transition(uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.murdocca_score_transition(uuid, text, text, boolean) to service_role;

revoke all on function public.murdocca_leaderboard() from public, anon, authenticated, service_role;
grant execute on function public.murdocca_leaderboard() to authenticated;
