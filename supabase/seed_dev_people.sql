-- =============================================================================
-- Dev seed: auth users on the school student domain — 10 students + 17 / 17 / 16
-- approved athletes (basketball / volleyball / table-tennis). +20 athletes vs the old 10 each.
--
-- Login: any account → password  DevSeed123!
--
-- Emails:
--   dev-seed-{bb|vb|tt}-student-{01..10}@students.nu-dasma.edu.ph
--   dev-seed-bb-athlete-{01..17}|vb-athlete-{01..17}|tt-athlete-{01..16}@students.nu-dasma.edu.ph
--
-- Also creates: 1 season, 3 tryout events, tryout_registrations for each
-- student (so roster / Hub filters work).
--
-- Idempotent: safe to re-run; skips existing auth users / athletes / tryouts.
--
-- Apply locally:
--   pnpm db:seed:dev
--   # or: npx supabase db query --local -f supabase/seed_dev_people.sql
-- =============================================================================

DO $$
DECLARE
  season_id_var   uuid;
  ev_bb           uuid;
  ev_vb           uuid;
  ev_tt           uuid;
  enc_pwd         text := extensions.crypt('DevSeed123!', extensions.gen_salt('bf'));
  instance        uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  uid             uuid;
  em              text;
  fn              text;
  sid             text;
  sp              text;
  ev_id           uuid;
  ab              text;
  j               int;
  sport_ix        int;
  ath_max         int;
  sports          text[]  := ARRAY['basketball', 'volleyball', 'table-tennis'];
  abbrs           text[]  := ARRAY['bb', 'vb', 'tt'];
  ev_names        text[]  := ARRAY[
    '[DEV SEED] Tryout — Basketball',
    '[DEV SEED] Tryout — Volleyball',
    '[DEV SEED] Tryout — Table Tennis'
  ];
BEGIN
  -- Season (one row for all dev tryouts)
  INSERT INTO public.seasons (name, status)
  SELECT 'Dev seed season', 'active'::public.season_lifecycle
  WHERE NOT EXISTS (
    SELECT 1 FROM public.seasons s WHERE s.name = 'Dev seed season'
  );

  SELECT s.id INTO season_id_var
  FROM public.seasons s
  WHERE s.name = 'Dev seed season'
  LIMIT 1;

  -- Tryout events (one per sport)
  INSERT INTO public.events (
    name, sport, season_id, format, status, is_tryout, table_tennis_format, description
  )
  SELECT
    v.ename,
    v.spt,
    season_id_var,
    'single_elim'::public.event_format,
    'registration'::public.event_status,
    true,
    CASE WHEN v.spt = 'table-tennis' THEN 'singles' ELSE NULL END,
    'Auto-created by supabase/seed_dev_people.sql for local QA.'
  FROM (
    VALUES
      ('[DEV SEED] Tryout — Basketball', 'basketball'::text),
      ('[DEV SEED] Tryout — Volleyball', 'volleyball'::text),
      ('[DEV SEED] Tryout — Table Tennis', 'table-tennis'::text)
  ) AS v(ename, spt)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.events e WHERE e.name = v.ename
  );

  SELECT e.id INTO ev_bb FROM public.events e WHERE e.name = ev_names[1] LIMIT 1;
  SELECT e.id INTO ev_vb FROM public.events e WHERE e.name = ev_names[2] LIMIT 1;
  SELECT e.id INTO ev_tt FROM public.events e WHERE e.name = ev_names[3] LIMIT 1;

  FOR sport_ix IN 1..3 LOOP
    sp := sports[sport_ix];
    ab := abbrs[sport_ix];
    ev_id := CASE sport_ix
      WHEN 1 THEN ev_bb
      WHEN 2 THEN ev_vb
      ELSE ev_tt
    END;

    -- ----- Students -----
    FOR j IN 1..10 LOOP
      em := format('dev-seed-%s-student-%s@students.nu-dasma.edu.ph', ab, lpad(j::text, 2, '0'));
      fn := format('Dev Seed %s Student %s', upper(ab), j);
      sid := format('DEV-%s-S%s', upper(ab), lpad(j::text, 2, '0'));

      IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = em) THEN
        uid := gen_random_uuid();
        INSERT INTO auth.users (
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
          recovery_token,
          email_change_token_new,
          email_change,
          email_change_token_current,
          reauthentication_token
        ) VALUES (
          instance,
          uid,
          'authenticated',
          'authenticated',
          em,
          enc_pwd,
          now(),
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
          jsonb_build_object('full_name', fn, 'role', 'student'),
          now(),
          now(),
          '',
          '',
          '',
          '',
          '',
          ''
        );

        INSERT INTO auth.identities (
          provider_id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        ) VALUES (
          uid::text,
          uid,
          jsonb_build_object(
            'sub', uid::text,
            'email', em,
            'email_verified', true,
            'phone_verified', false
          ),
          'email',
          now(),
          now(),
          now()
        );
      END IF;

      UPDATE public.profiles p
      SET
        full_name = fn,
        role = 'student'::public.user_role,
        enrollment_status = 'verified'::public.enrollment_status,
        student_id = sid,
        year_level = COALESCE(NULLIF(p.year_level, ''), '1st Year'),
        department = COALESCE(NULLIF(p.department, ''), 'Development')
      WHERE p.email = em;

      IF NOT EXISTS (
        SELECT 1 FROM public.tryout_registrations tr
        WHERE tr.profile_id = (SELECT pr.id FROM public.profiles pr WHERE pr.email = em LIMIT 1)
          AND tr.season_id = season_id_var
          AND tr.sport = sp
          AND tr.status = 'registered'::public.tryout_registration_status
      ) THEN
        INSERT INTO public.tryout_registrations (
          event_id, profile_id, season_id, sport, status
        )
        SELECT ev_id, pr.id, season_id_var, sp, 'registered'::public.tryout_registration_status
        FROM public.profiles pr
        WHERE pr.email = em
        LIMIT 1;
      END IF;
    END LOOP;

    -- ----- Athletes (+20 vs legacy 10 each: 17 bb, 17 vb, 16 tt) -----
    ath_max := CASE sport_ix WHEN 1 THEN 17 WHEN 2 THEN 17 ELSE 16 END;
    FOR j IN 1..ath_max LOOP
      em := format('dev-seed-%s-athlete-%s@students.nu-dasma.edu.ph', ab, lpad(j::text, 2, '0'));
      fn := format('Dev Seed %s Athlete %s', upper(ab), j);
      sid := format('DEV-%s-A%s', upper(ab), lpad(j::text, 2, '0'));

      IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = em) THEN
        uid := gen_random_uuid();
        INSERT INTO auth.users (
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
          recovery_token,
          email_change_token_new,
          email_change,
          email_change_token_current,
          reauthentication_token
        ) VALUES (
          instance,
          uid,
          'authenticated',
          'authenticated',
          em,
          enc_pwd,
          now(),
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
          jsonb_build_object('full_name', fn, 'role', 'athlete'),
          now(),
          now(),
          '',
          '',
          '',
          '',
          '',
          ''
        );

        INSERT INTO auth.identities (
          provider_id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        ) VALUES (
          uid::text,
          uid,
          jsonb_build_object(
            'sub', uid::text,
            'email', em,
            'email_verified', true,
            'phone_verified', false
          ),
          'email',
          now(),
          now(),
          now()
        );
      END IF;

      UPDATE public.profiles p
      SET
        full_name = fn,
        role = 'athlete'::public.user_role,
        enrollment_status = NULL,
        year_level = COALESCE(NULLIF(p.year_level, ''), '2nd Year'),
        department = COALESCE(NULLIF(p.department, ''), 'Development')
      WHERE p.email = em;

      INSERT INTO public.athletes (
        profile_id, student_id, sport, verification_status, medical_cleared
      )
      SELECT pr.id, sid, sp, 'approved'::public.verification_status, true
      FROM public.profiles pr
      WHERE pr.email = em
        AND NOT EXISTS (
          SELECT 1 FROM public.athletes a2 WHERE a2.profile_id = pr.id
        );
    END LOOP;
  END LOOP;
END $$;
