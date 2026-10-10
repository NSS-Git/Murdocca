-- Ejecutar después de la migración, como postgres. Los datos de prueba se revierten.
begin;

do $test$
declare
  first_user uuid := gen_random_uuid();
  second_user uuid := gen_random_uuid();
  google_user uuid := gen_random_uuid();
  first_name text := 'Prueba puntuación ' || first_user::text;
  second_name text := 'Prueba ranking ' || second_user::text;
  google_name text := 'Nombre Google ' || google_user::text;
  case_codes text[] := array[
    'MD4-CAFE-MUY_FACIL-00000001-D0',
    'MD4-CAFE-FACIL-00000001-8F',
    'MD4-CAFE-MEDIO-00000001-E8',
    'MD4-CAFE-DIFICIL-00000001-4A',
    'MD4-CAFE-EXPERTO-00000001-16'
  ];
  difficulties text[] := array['MUY_FACIL', 'FACIL', 'MEDIO', 'DIFICIL', 'EXPERTO'];
  expected_points integer[] := array[10, 20, 40, 70, 100];
  case_code text;
  result jsonb;
  total integer := 0;
  actual_total bigint;
  actual_cases bigint;
  actual_name text;
  first_rank bigint;
  second_rank bigint;
  visible_other_users bigint;
  i integer;
begin
  if to_regprocedure('public.murdocca_score_transition(uuid,text,text)') is not null then
    raise exception 'Se mantuvo la sobrecarga antigua de tres argumentos';
  end if;
  if not has_function_privilege('service_role', 'public.murdocca_score_transition(uuid,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.murdocca_score_transition(uuid,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.murdocca_score_transition(uuid,text,text,boolean)', 'EXECUTE') then
    raise exception 'La transición no está reservada a service_role';
  end if;

  insert into auth.users (id, raw_user_meta_data)
  values
    (first_user, jsonb_build_object('display_name', first_name, 'full_name', 'Nombre completo proveedor')),
    (second_user, jsonb_build_object('name', second_name, 'email', 'privado@example.com')),
    (google_user, jsonb_build_object('full_name', google_name, 'email', 'google-private@example.com'));

  select display_name into actual_name
    from public.murdocca_profiles where user_id = first_user;
  if actual_name is distinct from first_name then
    raise exception 'Se perdió el display_name configurado';
  end if;
  select display_name into actual_name
    from public.murdocca_profiles where user_id = second_user;
  if actual_name is distinct from second_name then
    raise exception 'No se usó la metadata name del proveedor';
  end if;
  select display_name into actual_name
    from public.murdocca_profiles where user_id = google_user;
  if actual_name is distinct from google_name or actual_name = 'google-private@example.com' then
    raise exception 'No se usó full_name sin exponer el correo';
  end if;

  -- La función SQL es interna; la función Edge valida antes el checksum y la solución.
  for i in 1..array_length(difficulties, 1) loop
    case_code := case_codes[i];
    result := public.murdocca_score_transition(first_user, case_code, 'start', false);
    if result ->> 'status' is distinct from 'playing'
       or (result ->> 'eligible')::boolean is distinct from true
       or (result ->> 'points')::integer is distinct from expected_points[i]
       or (result ->> 'hintsUsed')::boolean is distinct from false then
      raise exception 'El inicio sin pistas no es elegible: %', result;
    end if;
    result := public.murdocca_score_transition(first_user, case_code, 'complete', false);
    total := total + expected_points[i];
    if (result ->> 'awarded')::boolean is distinct from true
       or (result ->> 'points')::integer is distinct from expected_points[i]
       or (result ->> 'totalPoints')::bigint is distinct from total
       or (result ->> 'solvedCases')::bigint is distinct from i
       or (result ->> 'hintsUsed')::boolean is distinct from false then
      raise exception 'La dificultad % no otorga los puntos previstos: %', difficulties[i], result;
    end if;
    result := public.murdocca_score_transition(first_user, case_code, 'complete', false);
    if (result ->> 'awarded')::boolean is distinct from false
       or (result ->> 'totalPoints')::bigint is distinct from total
       or (result ->> 'solvedCases')::bigint is distinct from i then
      raise exception 'Un expediente repetido vuelve a puntuar: %', result;
    end if;
  end loop;

  case_code := 'MD4-CAFE-EXPERTO-00000002-1F';
  perform public.murdocca_score_transition(first_user, case_code, 'start', false);
  perform public.murdocca_score_transition(first_user, case_code, 'reveal', false);
  result := public.murdocca_score_transition(first_user, case_code, 'complete', false);
  if result ->> 'status' is distinct from 'revealed'
     or (result ->> 'awarded')::boolean is distinct from false
     or (result ->> 'totalPoints')::bigint is distinct from total then
    raise exception 'Una solución revelada no debe puntuar: %', result;
  end if;

  begin
    perform public.murdocca_score_transition(second_user, 'MD4-LAB-MEDIO-00000003-BA', 'complete', false);
    raise exception 'Se aceptó un expediente que no se había iniciado';
  exception when no_data_found then
    null;
  end;
  perform public.murdocca_score_transition(second_user, 'MD4-LAB-MEDIO-00000003-BA', 'start', false);
  result := public.murdocca_score_transition(second_user, 'MD4-LAB-MEDIO-00000003-BA', 'complete', false);
  if (result ->> 'awarded')::boolean is distinct from true
     or (result ->> 'points')::integer is distinct from 40
     or (result ->> 'totalPoints')::bigint is distinct from 40
     or (result ->> 'solvedCases')::bigint is distinct from 1 then
    raise exception 'El caso sin asistencia no recibió puntos completos: %', result;
  end if;

  case_code := 'MD4-LAB-DIFICIL-00000004-32';
  result := public.murdocca_score_transition(second_user, case_code, 'start', true);
  if result ->> 'status' is distinct from 'playing'
     or (result ->> 'eligible')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0
     or (result ->> 'hintsUsed')::boolean is distinct from true then
    raise exception 'Un inicio con pistas debe excluir los puntos: %', result;
  end if;
  result := public.murdocca_score_transition(second_user, case_code, 'start', false);
  if result ->> 'status' is distinct from 'playing'
     or (result ->> 'eligible')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0
     or (result ->> 'hintsUsed')::boolean is distinct from true then
    raise exception 'Las pistas deben persistir al reiniciar el expediente: %', result;
  end if;
  result := public.murdocca_score_transition(second_user, case_code, 'complete', false);
  if result ->> 'status' is distinct from 'solved'
     or (result ->> 'awarded')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0
     or (result ->> 'totalPoints')::bigint is distinct from 40
     or (result ->> 'solvedCases')::bigint is distinct from 2
     or (result ->> 'hintsUsed')::boolean is distinct from true then
    raise exception 'Un caso con pistas debe resolverse sin premio: %', result;
  end if;
  result := public.murdocca_score_transition(second_user, case_code, 'complete', false);
  if (result ->> 'awarded')::boolean is distinct from false
     or (result ->> 'totalPoints')::bigint is distinct from 40
     or (result ->> 'solvedCases')::bigint is distinct from 2 then
    raise exception 'Completar de nuevo no debe volver a conceder puntos: %', result;
  end if;

  case_code := 'MD4-LAB-EXPERTO-00000005-4E';
  result := public.murdocca_score_transition(second_user, case_code, 'assist', false);
  if result ->> 'status' is distinct from 'playing'
     or (result ->> 'eligible')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0
     or (result ->> 'hintsUsed')::boolean is distinct from true then
    raise exception 'La acción assist debe iniciar y excluir puntos: %', result;
  end if;
  result := public.murdocca_score_transition(second_user, case_code, 'start', false);
  if (result ->> 'eligible')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0 then
    raise exception 'La asistencia debe persistir después de start: %', result;
  end if;
  result := public.murdocca_score_transition(second_user, case_code, 'complete', false);
  if result ->> 'status' is distinct from 'solved'
     or (result ->> 'awarded')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0
     or (result ->> 'totalPoints')::bigint is distinct from 40
     or (result ->> 'solvedCases')::bigint is distinct from 3 then
    raise exception 'Un caso asistido debe resolverse sin premio: %', result;
  end if;
  result := public.murdocca_score_transition(second_user, case_code, 'complete', false);
  if (result ->> 'awarded')::boolean is distinct from false
     or (result ->> 'totalPoints')::bigint is distinct from 40
     or (result ->> 'solvedCases')::bigint is distinct from 3 then
    raise exception 'Una finalización asistida repetida no debe puntuar: %', result;
  end if;
  case_code := 'MD4-LAB-MEDIO-00000006-6F';
  perform public.murdocca_score_transition(second_user, case_code, 'start', false);
  result := public.murdocca_score_transition(second_user, case_code, 'complete', true);
  if result ->> 'status' is distinct from 'solved'
     or (result ->> 'awarded')::boolean is distinct from false
     or (result ->> 'points')::integer is distinct from 0
     or (result ->> 'totalPoints')::bigint is distinct from 40
     or (result ->> 'solvedCases')::bigint is distinct from 4
     or (result ->> 'hintsUsed')::boolean is distinct from true then
    raise exception 'hintsUsed=true al completar debe marcar y excluir el premio: %', result;
  end if;


  perform set_config('request.jwt.claim.sub', first_user::text, true);
  execute 'set local role authenticated';
  select total_points, solved_cases into actual_total, actual_cases
    from public.murdocca_profiles where user_id = first_user;
  if actual_total is distinct from total or actual_cases is distinct from 5::bigint then
    raise exception 'El perfil no refleja los premios recibidos';
  end if;
  select count(*) into visible_other_users from public.murdocca_profiles where user_id = second_user;
  if visible_other_users <> 0 then
    raise exception 'Un usuario puede leer el perfil privado de otro';
  end if;
  select rank into first_rank from public.murdocca_leaderboard() where display_name = first_name;
  select rank into second_rank from public.murdocca_leaderboard() where display_name = second_name;
  if first_rank is null or second_rank is null or first_rank >= second_rank then
    raise exception 'El ranking no ordena según puntos';
  end if;
  begin
    perform public.murdocca_score_transition(first_user, case_code, 'complete', false);
    raise exception 'Un cliente autenticado puede concederse puntos directamente';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform public.murdocca_leaderboard();
    raise exception 'El invitado puede acceder al ranking';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end;
$test$;

rollback;
