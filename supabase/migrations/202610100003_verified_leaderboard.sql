-- Solo las cuentas con correo confirmado participan en la clasificación.
-- El orden de salida coincide con los puestos: puntos, casos y desempate estable.
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
  from public.murdocca_profiles as p
  join auth.users as u on u.id = p.user_id
  where u.email_confirmed_at is not null
  order by p.total_points desc, p.solved_cases desc, p.display_name collate "C" asc, p.user_id asc;
end;
$function$;

revoke all on function public.murdocca_leaderboard() from public, anon, service_role;
grant execute on function public.murdocca_leaderboard() to authenticated;
