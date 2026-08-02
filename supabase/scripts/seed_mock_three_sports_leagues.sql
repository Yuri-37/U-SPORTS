-- =============================================================================
-- Mock league seed — three sports (spec-aligned)
--
-- Basketball:  50 tryout students on 10×5 tryout squads + 50 official athletes on 5×10 rosters
-- Volleyball:  60 tryout students on 10×6 tryout squads + 60 official athletes on 5×12 rosters
-- Table tennis (doubles): 20 tryout students on 10×2 tryout pairs + 20 official athletes on 10×2 rosters
--
-- Season: "[MOCK] Three-sport showcase"
-- Tryout anchor events: "[MOCK] Tryout pool — …" (TT uses doubles format)
-- Official league events: "[MOCK] Official — …" (is_tryout = false; status in_progress; TT doubles)
-- Registers official teams on those events + sets starting lineup_slot on all [MOCK]% teams.
-- Single-elim brackets: after SQL, run `pnpm seed:mock-brackets` (apps/server) so matches exist.
--
-- Login (all seeded accounts): MockLeague123!
-- Emails: mock-{bb|vb|tt}-{try|off}-{NNN}@<institution student_email_domain>
--
-- Companion manifest (team names & counts): supabase/scripts/mock_three_sports_manifest.json
--
-- Idempotent by email + team name.
--
--   npx supabase db query --local -f supabase/scripts/seed_mock_three_sports_leagues.sql --agent=no
--   pnpm seed:mock-brackets
-- =============================================================================

DO $mock$
DECLARE
  dom           text;
  season_id_var uuid;
  ev_bb         uuid;
  ev_vb         uuid;
  ev_tt         uuid;
  uid           uuid;
  em            text;
  fn            text;
  sid           text;
  tid           uuid;
  sport_slug    text;
  ev_id         uuid;
  team_ix       int;
  j             int;
  jersey_n      text;
  pos_bb        text[];
  pos_vb        text[];
  fn_first      text[];
  fn_last       text[];
  idx_f         int;
  idx_l         int;
  bb_teams      text[];
  vb_teams      text[];
  tt_teams      text[];
  bb_try_teams  text[];
  vb_try_teams  text[];
  tt_try_teams  text[];
  ev_off_bb     uuid;
  ev_off_vb     uuid;
  ev_off_tt     uuid;
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
      enc_pwd text := extensions.crypt('MockLeague123!', extensions.gen_salt('bf'));
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

  fn_first := ARRAY[
    'Marcus','Jordan','Elena','Sofia','Andre','Kwame','Diego','Priya','Lin','Noah',
    'Amara','Theo','Harper','Mateo','Zara','Ethan','Naomi','Luca','Maya','Daniel',
    'Aisha','Ryan','Chloe','James','Fatima','Logan','Ruby','Owen','Yuki','Carlos',
    'Emma','Jaylen','Nina','Victor','Layla','Isaiah','Tessa','Brandon','Julia','Malik',
    'Grace','Hector','Keira','Sean','Anika','Camila','Peter','Rosa','Alex','Samira'
  ];

  fn_last := ARRAY[
    'Nguyen','Patel','Okafor','Silva','Tanaka','Rivera','Kim','Olsen','Costa','Martinez',
    'Brown','Diaz','Sato','Anderson','Singh','Walker','Reyes','Park','Wright','Murphy',
    'Chen','Bennett','Torres','Hayes','Brooks','Collins','Morris','Sanders','Bell','Powell',
    'Gray','Ramirez','Cook','Ward','Bailey','Wood','James','Watson','Price','Hughes',
    'Alvarez','Castillo','Ng','Evans','Turner','Peterson','Kimura','Lopez','Griffin','Ford'
  ];

  pos_bb := ARRAY['Guard','Guard','Forward','Forward','Center'];
  pos_vb := ARRAY['Setter','Outside','Middle','Opposite','Libero','Defensive Specialist'];

  bb_teams := ARRAY[
    '[MOCK] Crimson Court Crushers',
    '[MOCK] Metro Midnight Dunkers',
    '[MOCK] Harbor Hoop Collective',
    '[MOCK] Summit Steel Guards',
    '[MOCK] Varsity Voltage'
  ];

  vb_teams := ARRAY[
    '[MOCK] Coastal Spike Syndicate',
    '[MOCK] Granite Block Brigade',
    '[MOCK] Aurora Ace Attackers',
    '[MOCK] Pacific Setter Squad',
    '[MOCK] Crown Court Royals'
  ];

  tt_teams := ARRAY[
    '[MOCK] TT Doubles — Raven Blacktops',
    '[MOCK] TT Doubles — Silver Spinners',
    '[MOCK] TT Doubles — Jade Spin Doctors',
    '[MOCK] TT Doubles — Cobalt Corners',
    '[MOCK] TT Doubles — Amber Arches',
    '[MOCK] TT Doubles — Vertex Volleys',
    '[MOCK] TT Doubles — Neon Net Nomads',
    '[MOCK] TT Doubles — Quartz Quickhands',
    '[MOCK] TT Doubles — Ember Edge Pair',
    '[MOCK] TT Doubles — Orion Paddle Pros'
  ];

  bb_try_teams := ARRAY[
    '[MOCK] BB Tryout — Copper Court',
    '[MOCK] BB Tryout — Slate Squad',
    '[MOCK] BB Tryout — Amber Arc',
    '[MOCK] BB Tryout — Indigo Heat',
    '[MOCK] BB Tryout — Pine Press',
    '[MOCK] BB Tryout — Coral Cutters',
    '[MOCK] BB Tryout — Opal Outlet',
    '[MOCK] BB Tryout — Teal Tempo',
    '[MOCK] BB Tryout — Ruby Rim',
    '[MOCK] BB Tryout — Onyx Drive'
  ];

  vb_try_teams := ARRAY[
    '[MOCK] VB Tryout — Crest Crew',
    '[MOCK] VB Tryout — Drift Division',
    '[MOCK] VB Tryout — Echo Elite',
    '[MOCK] VB Tryout — Forge Five',
    '[MOCK] VB Tryout — Glide Group',
    '[MOCK] VB Tryout — Haven Hitters',
    '[MOCK] VB Tryout — Ion Impact',
    '[MOCK] VB Tryout — Jolt Junction',
    '[MOCK] VB Tryout — Keel Keys',
    '[MOCK] VB Tryout — Lumen Line'
  ];

  tt_try_teams := ARRAY[
    '[MOCK] TT Tryout — Pair Nova',
    '[MOCK] TT Tryout — Pair Comet',
    '[MOCK] TT Tryout — Pair Atlas',
    '[MOCK] TT Tryout — Pair Vega',
    '[MOCK] TT Tryout — Pair Orion',
    '[MOCK] TT Tryout — Pair Lyra',
    '[MOCK] TT Tryout — Pair Sirius',
    '[MOCK] TT Tryout — Pair Polaris',
    '[MOCK] TT Tryout — Pair Zenith',
    '[MOCK] TT Tryout — Pair Apex'
  ];

  SELECT COALESCE(NULLIF(trim(student_email_domain), ''), 'students.nu-dasma.edu.ph')
  INTO dom
  FROM public.institution
  LIMIT 1;

  INSERT INTO public.seasons (name, status, start_date, end_date)
  SELECT '[MOCK] Three-sport showcase', 'active'::public.season_lifecycle, CURRENT_DATE, CURRENT_DATE + interval '365 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.seasons s WHERE s.name = '[MOCK] Three-sport showcase');

  SELECT s.id INTO season_id_var FROM public.seasons s WHERE s.name = '[MOCK] Three-sport showcase' LIMIT 1;

  INSERT INTO public.events (
    name, sport, season_id, format, status, is_tryout, table_tennis_format, description
  )
  SELECT v.ename, v.spt, season_id_var, 'single_elim'::public.event_format,
         'registration'::public.event_status, true,
         CASE WHEN v.spt = 'table-tennis' THEN 'doubles'::text ELSE NULL END,
         'Mock seed — open tryout pool registration anchor.'
  FROM (
    VALUES
      ('[MOCK] Tryout pool — Basketball', 'basketball'::text),
      ('[MOCK] Tryout pool — Volleyball', 'volleyball'::text),
      ('[MOCK] Tryout pool — Table Tennis', 'table-tennis'::text)
  ) AS v(ename, spt)
  WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.name = v.ename);

  INSERT INTO public.events (
    name, sport, season_id, format, status, is_tryout, table_tennis_format, description
  )
  SELECT v.ename, v.spt, season_id_var, 'single_elim'::public.event_format,
         'in_progress'::public.event_status, false,
         CASE WHEN v.spt = 'table-tennis' THEN 'doubles'::text ELSE NULL END,
         'Mock seed — official competition event (not a tryout). Teams registered below; run pnpm seed:mock-brackets for bracket.'
  FROM (
    VALUES
      ('[MOCK] Official — Basketball Championship', 'basketball'::text),
      ('[MOCK] Official — Volleyball Championship', 'volleyball'::text),
      ('[MOCK] Official — Table Tennis Doubles Open', 'table-tennis'::text)
  ) AS v(ename, spt)
  WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.name = v.ename);

  SELECT e.id INTO ev_bb FROM public.events e WHERE e.name = '[MOCK] Tryout pool — Basketball' LIMIT 1;
  SELECT e.id INTO ev_vb FROM public.events e WHERE e.name = '[MOCK] Tryout pool — Volleyball' LIMIT 1;
  SELECT e.id INTO ev_tt FROM public.events e WHERE e.name = '[MOCK] Tryout pool — Table Tennis' LIMIT 1;

  FOR team_ix IN 1..array_upper(bb_teams, 1) LOOP
    INSERT INTO public.teams (name, sport, season_id, roster_context)
    SELECT bb_teams[team_ix], 'basketball', season_id_var, 'official'::public.team_roster_context
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = bb_teams[team_ix]
    );
  END LOOP;

  FOR team_ix IN 1..array_upper(vb_teams, 1) LOOP
    INSERT INTO public.teams (name, sport, season_id, roster_context)
    SELECT vb_teams[team_ix], 'volleyball', season_id_var, 'official'::public.team_roster_context
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = vb_teams[team_ix]
    );
  END LOOP;

  FOR team_ix IN 1..array_upper(tt_teams, 1) LOOP
    INSERT INTO public.teams (name, sport, season_id, roster_context)
    SELECT tt_teams[team_ix], 'table-tennis', season_id_var, 'official'::public.team_roster_context
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = tt_teams[team_ix]
    );
  END LOOP;

  FOR team_ix IN 1..array_upper(bb_try_teams, 1) LOOP
    INSERT INTO public.teams (name, sport, season_id, roster_context)
    SELECT bb_try_teams[team_ix], 'basketball', season_id_var, 'tryout'::public.team_roster_context
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = bb_try_teams[team_ix]
    );
  END LOOP;

  FOR team_ix IN 1..array_upper(vb_try_teams, 1) LOOP
    INSERT INTO public.teams (name, sport, season_id, roster_context)
    SELECT vb_try_teams[team_ix], 'volleyball', season_id_var, 'tryout'::public.team_roster_context
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = vb_try_teams[team_ix]
    );
  END LOOP;

  FOR team_ix IN 1..array_upper(tt_try_teams, 1) LOOP
    INSERT INTO public.teams (name, sport, season_id, roster_context)
    SELECT tt_try_teams[team_ix], 'table-tennis', season_id_var, 'tryout'::public.team_roster_context
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = tt_try_teams[team_ix]
    );
  END LOOP;

  -- ─── Basketball tryout squads (student_profile_id on tryout teams) ─────────
  sport_slug := 'basketball';
  ev_id := ev_bb;
  FOR j IN 1..50 LOOP
    idx_f := 1 + ((j * 7919) % array_upper(fn_first, 1));
    idx_l := 1 + ((j * 4243) % array_upper(fn_last, 1));
    fn := fn_first[idx_f] || ' ' || fn_last[idx_l];
    em := format('mock-bb-try-%s@%s', lpad(j::text, 3, '0'), dom);
    sid := format('MOCK-BB-T-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'student');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(department, ''), 'Mock League')
    WHERE p.id = uid;

    IF NOT EXISTS (
      SELECT 1 FROM public.tryout_registrations tr
      WHERE tr.profile_id = uid AND tr.season_id = season_id_var AND tr.sport = sport_slug AND tr.status = 'registered'
    ) THEN
      INSERT INTO public.tryout_registrations (event_id, profile_id, season_id, sport, status)
      VALUES (ev_id, uid, season_id_var, sport_slug, 'registered'::public.tryout_registration_status);
    END IF;

    team_ix := ((j - 1) / 5) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug AND t.name = bb_try_teams[team_ix]
    LIMIT 1;

    INSERT INTO public.team_members (team_id, student_profile_id)
    SELECT tid, uid
    WHERE tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.student_profile_id = uid
      );
  END LOOP;

  -- ─── Basketball official (5 × 10) ────────────────────────────────────────
  FOR j IN 1..50 LOOP
    idx_f := 1 + ((j * 5197) % array_upper(fn_first, 1));
    idx_l := 1 + ((j * 6829) % array_upper(fn_last, 1));
    fn := fn_first[idx_f] || ' ' || fn_last[idx_l];
    em := format('mock-bb-off-%s@%s', lpad(j::text, 3, '0'), dom);
    sid := format('MOCK-BB-O-%s', lpad(j::text, 3, '0'));
    jersey_n := (10 + ((j * 17) % 80))::text;
    uid := public._bulk_seed_auth_user(em, fn, 'athlete');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(department, ''), 'Mock League')
    WHERE p.id = uid;

    INSERT INTO public.athletes (
      profile_id, student_id, sport, position, jersey_number,
      verification_status, medical_cleared, season_status
    )
    SELECT uid, sid, sport_slug,
           pos_bb[1 + ((j - 1) % array_upper(pos_bb, 1))],
           jersey_n,
           'approved'::public.verification_status, true, 'active'::public.season_player_status
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.profile_id = uid);

    team_ix := ((j - 1) / 10) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug AND t.name = bb_teams[team_ix]
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

  -- ─── Volleyball tryout squads ───────────────────────────────────────────────
  sport_slug := 'volleyball';
  ev_id := ev_vb;
  FOR j IN 1..60 LOOP
    idx_f := 1 + ((j * 6143) % array_upper(fn_first, 1));
    idx_l := 1 + ((j * 5333) % array_upper(fn_last, 1));
    fn := fn_first[idx_f] || ' ' || fn_last[idx_l];
    em := format('mock-vb-try-%s@%s', lpad(j::text, 3, '0'), dom);
    sid := format('MOCK-VB-T-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'student');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(department, ''), 'Mock League')
    WHERE p.id = uid;

    IF NOT EXISTS (
      SELECT 1 FROM public.tryout_registrations tr
      WHERE tr.profile_id = uid AND tr.season_id = season_id_var AND tr.sport = sport_slug AND tr.status = 'registered'
    ) THEN
      INSERT INTO public.tryout_registrations (event_id, profile_id, season_id, sport, status)
      VALUES (ev_id, uid, season_id_var, sport_slug, 'registered'::public.tryout_registration_status);
    END IF;

    team_ix := ((j - 1) / 6) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug AND t.name = vb_try_teams[team_ix]
    LIMIT 1;

    INSERT INTO public.team_members (team_id, student_profile_id)
    SELECT tid, uid
    WHERE tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.student_profile_id = uid
      );
  END LOOP;

  -- ─── Volleyball official (5 × 12) ──────────────────────────────────────────
  FOR j IN 1..60 LOOP
    idx_f := 1 + ((j * 7499) % array_upper(fn_first, 1));
    idx_l := 1 + ((j * 4723) % array_upper(fn_last, 1));
    fn := fn_first[idx_f] || ' ' || fn_last[idx_l];
    em := format('mock-vb-off-%s@%s', lpad(j::text, 3, '0'), dom);
    sid := format('MOCK-VB-O-%s', lpad(j::text, 3, '0'));
    jersey_n := (1 + ((j * 19) % 99))::text;
    uid := public._bulk_seed_auth_user(em, fn, 'athlete');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(department, ''), 'Mock League')
    WHERE p.id = uid;

    INSERT INTO public.athletes (
      profile_id, student_id, sport, position, jersey_number,
      verification_status, medical_cleared, season_status
    )
    SELECT uid, sid, sport_slug,
           pos_vb[1 + ((j - 1) % array_upper(pos_vb, 1))],
           jersey_n,
           'approved'::public.verification_status, true, 'active'::public.season_player_status
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.profile_id = uid);

    team_ix := ((j - 1) / 12) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug AND t.name = vb_teams[team_ix]
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

  -- ─── Table tennis tryout pairs ─────────────────────────────────────────────
  sport_slug := 'table-tennis';
  ev_id := ev_tt;
  FOR j IN 1..20 LOOP
    idx_f := 1 + ((j * 6569) % array_upper(fn_first, 1));
    idx_l := 1 + ((j * 4813) % array_upper(fn_last, 1));
    fn := fn_first[idx_f] || ' ' || fn_last[idx_l];
    em := format('mock-tt-try-%s@%s', lpad(j::text, 3, '0'), dom);
    sid := format('MOCK-TT-T-%s', lpad(j::text, 3, '0'));
    uid := public._bulk_seed_auth_user(em, fn, 'student');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(department, ''), 'Mock League')
    WHERE p.id = uid;

    IF NOT EXISTS (
      SELECT 1 FROM public.tryout_registrations tr
      WHERE tr.profile_id = uid AND tr.season_id = season_id_var AND tr.sport = sport_slug AND tr.status = 'registered'
    ) THEN
      INSERT INTO public.tryout_registrations (event_id, profile_id, season_id, sport, status)
      VALUES (ev_id, uid, season_id_var, sport_slug, 'registered'::public.tryout_registration_status);
    END IF;

    team_ix := ((j - 1) / 2) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug AND t.name = tt_try_teams[team_ix]
    LIMIT 1;

    INSERT INTO public.team_members (team_id, student_profile_id)
    SELECT tid, uid
    WHERE tid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = tid AND tm.student_profile_id = uid
      );
  END LOOP;

  -- ─── Table tennis official doubles (10 × 2) ──────────────────────────────
  FOR j IN 1..20 LOOP
    idx_f := 1 + ((j * 5849) % array_upper(fn_first, 1));
    idx_l := 1 + ((j * 6271) % array_upper(fn_last, 1));
    fn := fn_first[idx_f] || ' ' || fn_last[idx_l];
    em := format('mock-tt-off-%s@%s', lpad(j::text, 3, '0'), dom);
    sid := format('MOCK-TT-O-%s', lpad(j::text, 3, '0'));
    jersey_n := (10 + ((j * 23) % 90))::text;
    uid := public._bulk_seed_auth_user(em, fn, 'athlete');

    UPDATE public.profiles p
    SET full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        student_id = sid,
        year_level = COALESCE(NULLIF(year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(department, ''), 'Mock League')
    WHERE p.id = uid;

    INSERT INTO public.athletes (
      profile_id, student_id, sport, position, jersey_number,
      verification_status, medical_cleared, season_status
    )
    SELECT uid, sid, sport_slug, 'Doubles'::text, jersey_n,
           'approved'::public.verification_status, true, 'active'::public.season_player_status
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.profile_id = uid);

    team_ix := ((j - 1) / 2) + 1;
    SELECT t.id INTO tid FROM public.teams t
    WHERE t.season_id = season_id_var AND t.sport = sport_slug AND t.name = tt_teams[team_ix]
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

  -- ─── Official events: ensure active + participants + starting lineups ───────
  UPDATE public.events e
  SET status = 'in_progress'::public.event_status
  WHERE e.season_id = season_id_var
    AND e.name IN (
      '[MOCK] Official — Basketball Championship',
      '[MOCK] Official — Volleyball Championship',
      '[MOCK] Official — Table Tennis Doubles Open'
    );

  SELECT e.id INTO ev_off_bb FROM public.events e
  WHERE e.season_id = season_id_var AND e.name = '[MOCK] Official — Basketball Championship' LIMIT 1;
  SELECT e.id INTO ev_off_vb FROM public.events e
  WHERE e.season_id = season_id_var AND e.name = '[MOCK] Official — Volleyball Championship' LIMIT 1;
  SELECT e.id INTO ev_off_tt FROM public.events e
  WHERE e.season_id = season_id_var AND e.name = '[MOCK] Official — Table Tennis Doubles Open' LIMIT 1;

  IF ev_off_bb IS NOT NULL THEN
    FOR team_ix IN 1..array_upper(bb_teams, 1) LOOP
      INSERT INTO public.event_participants (event_id, participant_id, participant_type, seed)
      SELECT ev_off_bb, t.id, 'team'::public.participant_type, team_ix
      FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = bb_teams[team_ix]
        AND NOT EXISTS (
          SELECT 1 FROM public.event_participants ep
          WHERE ep.event_id = ev_off_bb AND ep.participant_id = t.id
        );
    END LOOP;
  END IF;

  IF ev_off_vb IS NOT NULL THEN
    FOR team_ix IN 1..array_upper(vb_teams, 1) LOOP
      INSERT INTO public.event_participants (event_id, participant_id, participant_type, seed)
      SELECT ev_off_vb, t.id, 'team'::public.participant_type, team_ix
      FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = vb_teams[team_ix]
        AND NOT EXISTS (
          SELECT 1 FROM public.event_participants ep
          WHERE ep.event_id = ev_off_vb AND ep.participant_id = t.id
        );
    END LOOP;
  END IF;

  IF ev_off_tt IS NOT NULL THEN
    FOR team_ix IN 1..array_upper(tt_teams, 1) LOOP
      INSERT INTO public.event_participants (event_id, participant_id, participant_type, seed)
      SELECT ev_off_tt, t.id, 'team'::public.participant_type, team_ix
      FROM public.teams t
      WHERE t.season_id = season_id_var AND t.name = tt_teams[team_ix]
        AND NOT EXISTS (
          SELECT 1 FROM public.event_participants ep
          WHERE ep.event_id = ev_off_tt AND ep.participant_id = t.id
        );
    END LOOP;
  END IF;

  UPDATE public.team_members tm
  SET lineup_slot = NULL
  FROM public.teams t
  WHERE tm.team_id = t.id
    AND t.season_id = season_id_var
    AND t.name LIKE '[MOCK]%';

  WITH ranked AS (
    SELECT
      tm.id AS tm_id,
      ROW_NUMBER() OVER (
        PARTITION BY tm.team_id
        ORDER BY tm.joined_at NULLS LAST, tm.id
      ) AS rn,
      tt.sport AS tm_sport
    FROM public.team_members tm
    INNER JOIN public.teams tt ON tt.id = tm.team_id
    WHERE tt.season_id = season_id_var
      AND tt.name LIKE '[MOCK]%'
  )
  UPDATE public.team_members tm
  SET lineup_slot = ranked.rn
  FROM ranked
  WHERE tm.id = ranked.tm_id
    AND (
      (ranked.tm_sport = 'basketball' AND ranked.rn <= 5)
      OR (ranked.tm_sport = 'volleyball' AND ranked.rn <= 6)
      OR (ranked.tm_sport = 'table-tennis' AND ranked.rn <= 2)
    );

  EXECUTE 'DROP FUNCTION IF EXISTS public._bulk_seed_auth_user(text, text, text)';
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$mock$;
