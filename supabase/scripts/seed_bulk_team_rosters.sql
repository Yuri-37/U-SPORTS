-- =============================================================================
-- Bulk roster demo: tryout + official teams with full squads
--
-- Creates ONE season "[BULK] Demo season", tryout events per sport, and teams:
--   Basketball:  50 tryout students (10×5) + 50 official athletes (10×5)
--   Volleyball:  60 tryout students (10×6) + 60 official athletes (10×6)
--   Table tennis: 20 tryout students (10×2) + 20 official athletes (10×2)
--
-- Login (all accounts):  BulkSeed123!
-- Emails (student domain from institution table, fallback students.nu-dasma.edu.ph):
--   bulk-bb-try-001 .. bulk-bb-try-050 @ domain   (students → tryout BB teams)
--   bulk-bb-off-001 .. bulk-bb-off-050 @ domain  (athletes → official BB teams)
--   bulk-vb-try-001 .. bulk-vb-try-060
--   bulk-vb-off-001 .. bulk-vb-off-060
--   bulk-tt-try-001 .. bulk-tt-try-020
--   bulk-tt-off-001 .. bulk-tt-off-020
--
-- Idempotent: skips auth users / teams / members that already exist (by email / team name).
--
-- Apply locally (single statement for Supabase CLI):
--   npx supabase db query --local -f supabase/scripts/seed_bulk_team_rosters.sql --agent=no
-- =============================================================================

DO $bulk$
DECLARE
  rec                      record;
  dom                      text;
  season_id_var            uuid;
  ev_bb                    uuid;
  ev_vb                    uuid;
  ev_tt                    uuid;
  uid                      uuid;
  em                       text;
  fn                       text;
  sid                      text;
  team_no                  int;
  team_label               text;
  tid                      uuid;
  sport_slug               text;
  ev_id                    uuid;
  prefix_try               text;
  prefix_off               text;
  count_try                int;
  count_off                int;
  team_size                int;
  j                        int;
BEGIN
  EXECUTE $fu$
    CREATE OR REPLACE FUNCTION public._bulk_seed_auth_user(p_email text, p_full_name text, p_role text)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, auth, extensions
    AS $fn$
    DECLARE
      uid uuid;
      instance uuid := '00000000-0000-0000-0000-000000000000'::uuid;
      enc_pwd text := extensions.crypt('BulkSeed123!', extensions.gen_salt('bf'));
    BEGIN
      SELECT u.id INTO uid FROM auth.users u WHERE u.email = p_email LIMIT 1;
      IF uid IS NOT NULL THEN
        RETURN uid;
      END IF;

      uid := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token
      ) VALUES (
        instance, uid, 'authenticated', 'authenticated', p_email, enc_pwd, now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', p_full_name, 'role', p_role),
        now(), now(), '', '', '', '', '', ''
      );

      INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        uid::text, uid,
        jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );

      RETURN uid;
    END;
    $fn$;
  $fu$;

  SELECT COALESCE(NULLIF(trim(student_email_domain), ''), 'students.nu-dasma.edu.ph')
  INTO dom
  FROM public.institution
  LIMIT 1;

  INSERT INTO public.seasons (name, status, start_date, end_date)
  SELECT '[BULK] Demo season', 'active'::public.season_lifecycle, CURRENT_DATE, CURRENT_DATE + interval '400 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.seasons s WHERE s.name = '[BULK] Demo season');

  SELECT s.id INTO season_id_var FROM public.seasons s WHERE s.name = '[BULK] Demo season' LIMIT 1;

  INSERT INTO public.events (
    name, sport, season_id, format, status, is_tryout, table_tennis_format, description
  )
  SELECT v.ename, v.spt, season_id_var, 'single_elim'::public.event_format,
         'registration'::public.event_status, true,
         CASE WHEN v.spt = 'table-tennis' THEN 'singles'::text ELSE NULL END,
         'Bulk roster seed — tryout registration anchor.'
  FROM (
    VALUES
      ('[BULK] Tryout — Basketball', 'basketball'::text),
      ('[BULK] Tryout — Volleyball', 'volleyball'::text),
      ('[BULK] Tryout — Table Tennis', 'table-tennis'::text)
  ) AS v(ename, spt)
  WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.name = v.ename);

  SELECT e.id INTO ev_bb FROM public.events e WHERE e.name = '[BULK] Tryout — Basketball' LIMIT 1;
  SELECT e.id INTO ev_vb FROM public.events e WHERE e.name = '[BULK] Tryout — Volleyball' LIMIT 1;
  SELECT e.id INTO ev_tt FROM public.events e WHERE e.name = '[BULK] Tryout — Table Tennis' LIMIT 1;

  FOR rec IN
    SELECT * FROM (
      VALUES
        ('basketball'::text, 5),
        ('volleyball'::text, 6),
        ('table-tennis'::text, 2)
    ) AS x(spt, sz)
  LOOP
    sport_slug := rec.spt;
    team_size := rec.sz;
    FOR j IN 1..10 LOOP
      team_label := lpad(j::text, 2, '0');

      INSERT INTO public.teams (name, sport, season_id, roster_context)
      SELECT format('[BULK] %s tryout %s', sport_slug, team_label), sport_slug, season_id_var, 'tryout'::public.team_roster_context
      WHERE NOT EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.season_id = season_id_var AND t.sport = sport_slug
          AND t.name = format('[BULK] %s tryout %s', sport_slug, team_label)
      );

      INSERT INTO public.teams (name, sport, season_id, roster_context)
      SELECT format('[BULK] %s official %s', sport_slug, team_label), sport_slug, season_id_var, 'official'::public.team_roster_context
      WHERE NOT EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.season_id = season_id_var AND t.sport = sport_slug
          AND t.name = format('[BULK] %s official %s', sport_slug, team_label)
      );
    END LOOP;
  END LOOP;

  sport_slug := 'basketball';
  ev_id := ev_bb;
  count_try := 50;
  team_size := 5;
  prefix_try := 'bulk-bb-try-';
  FOR j IN 1..count_try LOOP
    em := format('%s%s@%s', prefix_try, lpad(j::text, 3, '0'), dom);
    fn := format('Bulk BB Tryout Player %s', j);
    sid := format('BULK-BB-T-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'student');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(department, ''), 'Bulk Seed')
    WHERE p.id = uid;

    IF NOT EXISTS (
      SELECT 1 FROM public.tryout_registrations tr
      WHERE tr.profile_id = uid AND tr.season_id = season_id_var AND tr.sport = sport_slug AND tr.status = 'registered'
    ) THEN
      INSERT INTO public.tryout_registrations (event_id, profile_id, season_id, sport, status)
      VALUES (ev_id, uid, season_id_var, sport_slug, 'registered'::public.tryout_registration_status);
    END IF;

    team_no := ((j - 1) / team_size) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug
      AND t.name = format('[BULK] %s tryout %s', sport_slug, lpad(team_no::text, 2, '0'))
    LIMIT 1;

    INSERT INTO public.team_members (team_id, student_profile_id)
    SELECT tid, uid
    WHERE tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.student_profile_id = uid
      );
  END LOOP;

  prefix_off := 'bulk-bb-off-';
  FOR j IN 1..count_try LOOP
    em := format('%s%s@%s', prefix_off, lpad(j::text, 3, '0'), dom);
    fn := format('Bulk BB Official Player %s', j);
    sid := format('BULK-BB-O-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'athlete');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(department, ''), 'Bulk Seed')
    WHERE p.id = uid;

    INSERT INTO public.athletes (profile_id, student_id, sport, position, verification_status, medical_cleared, season_status)
    SELECT uid, sid, sport_slug, 'Guard'::text, 'approved'::public.verification_status, true, 'active'::public.season_player_status
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.profile_id = uid);

    team_no := ((j - 1) / team_size) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug
      AND t.name = format('[BULK] %s official %s', sport_slug, lpad(team_no::text, 2, '0'))
    LIMIT 1;

    INSERT INTO public.team_members (team_id, athlete_id)
    SELECT tid, a.id
    FROM public.athletes a
    WHERE a.profile_id = uid
      AND tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.athlete_id = a.id
      );
  END LOOP;

  sport_slug := 'volleyball';
  ev_id := ev_vb;
  count_try := 60;
  team_size := 6;
  prefix_try := 'bulk-vb-try-';
  FOR j IN 1..count_try LOOP
    em := format('%s%s@%s', prefix_try, lpad(j::text, 3, '0'), dom);
    fn := format('Bulk VB Tryout Player %s', j);
    sid := format('BULK-VB-T-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'student');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(department, ''), 'Bulk Seed')
    WHERE p.id = uid;

    IF NOT EXISTS (
      SELECT 1 FROM public.tryout_registrations tr
      WHERE tr.profile_id = uid AND tr.season_id = season_id_var AND tr.sport = sport_slug AND tr.status = 'registered'
    ) THEN
      INSERT INTO public.tryout_registrations (event_id, profile_id, season_id, sport, status)
      VALUES (ev_id, uid, season_id_var, sport_slug, 'registered'::public.tryout_registration_status);
    END IF;

    team_no := ((j - 1) / team_size) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug
      AND t.name = format('[BULK] %s tryout %s', sport_slug, lpad(team_no::text, 2, '0'))
    LIMIT 1;

    INSERT INTO public.team_members (team_id, student_profile_id)
    SELECT tid, uid
    WHERE tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.student_profile_id = uid
      );
  END LOOP;

  prefix_off := 'bulk-vb-off-';
  count_off := 60;
  FOR j IN 1..count_off LOOP
    em := format('%s%s@%s', prefix_off, lpad(j::text, 3, '0'), dom);
    fn := format('Bulk VB Official Player %s', j);
    sid := format('BULK-VB-O-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'athlete');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(department, ''), 'Bulk Seed')
    WHERE p.id = uid;

    INSERT INTO public.athletes (profile_id, student_id, sport, position, verification_status, medical_cleared, season_status)
    SELECT uid, sid, sport_slug, 'Outside'::text, 'approved'::public.verification_status, true, 'active'::public.season_player_status
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.profile_id = uid);

    team_no := ((j - 1) / team_size) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug
      AND t.name = format('[BULK] %s official %s', sport_slug, lpad(team_no::text, 2, '0'))
    LIMIT 1;

    INSERT INTO public.team_members (team_id, athlete_id)
    SELECT tid, a.id
    FROM public.athletes a
    WHERE a.profile_id = uid
      AND tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.athlete_id = a.id
      );
  END LOOP;

  sport_slug := 'table-tennis';
  ev_id := ev_tt;
  count_try := 20;
  team_size := 2;
  prefix_try := 'bulk-tt-try-';
  FOR j IN 1..count_try LOOP
    em := format('%s%s@%s', prefix_try, lpad(j::text, 3, '0'), dom);
    fn := format('Bulk TT Tryout Player %s', j);
    sid := format('BULK-TT-T-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'student');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(department, ''), 'Bulk Seed')
    WHERE p.id = uid;

    IF NOT EXISTS (
      SELECT 1 FROM public.tryout_registrations tr
      WHERE tr.profile_id = uid AND tr.season_id = season_id_var AND tr.sport = sport_slug AND tr.status = 'registered'
    ) THEN
      INSERT INTO public.tryout_registrations (event_id, profile_id, season_id, sport, status)
      VALUES (ev_id, uid, season_id_var, sport_slug, 'registered'::public.tryout_registration_status);
    END IF;

    team_no := ((j - 1) / team_size) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug
      AND t.name = format('[BULK] %s tryout %s', sport_slug, lpad(team_no::text, 2, '0'))
    LIMIT 1;

    INSERT INTO public.team_members (team_id, student_profile_id)
    SELECT tid, uid
    WHERE tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.student_profile_id = uid
      );
  END LOOP;

  prefix_off := 'bulk-tt-off-';
  FOR j IN 1..20 LOOP
    em := format('%s%s@%s', prefix_off, lpad(j::text, 3, '0'), dom);
    fn := format('Bulk TT Official Player %s', j);
    sid := format('BULK-TT-O-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'athlete');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(department, ''), 'Bulk Seed')
    WHERE p.id = uid;

    INSERT INTO public.athletes (profile_id, student_id, sport, position, verification_status, medical_cleared, season_status)
    SELECT uid, sid, sport_slug, 'Singles'::text, 'approved'::public.verification_status, true, 'active'::public.season_player_status
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.profile_id = uid);

    team_no := ((j - 1) / team_size) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug
      AND t.name = format('[BULK] %s official %s', sport_slug, lpad(team_no::text, 2, '0'))
    LIMIT 1;

    INSERT INTO public.team_members (team_id, athlete_id)
    SELECT tid, a.id
    FROM public.athletes a
    WHERE a.profile_id = uid
      AND tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.athlete_id = a.id
      );
  END LOOP;

  EXECUTE 'DROP FUNCTION IF EXISTS public._bulk_seed_auth_user(text, text, text)';
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$bulk$;
