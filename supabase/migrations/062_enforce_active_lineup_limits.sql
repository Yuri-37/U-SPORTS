-- ---------------------------------------------------------------------------
-- Fixes the "6/5 active" bug: PATCH /api/teams/:id/lineup only ever validated
-- the max slot NUMBER in a single request, never the RESULTING count of active
-- players, so a team could accumulate more active players than its sport
-- allows (basketball 5, volleyball 6, table tennis 2). The server route is
-- being rewritten alongside this migration to check the resulting count and
-- call set_team_lineup() below atomically; this migration cleans up any teams
-- that already drifted past their cap before that fix shipped.
-- ---------------------------------------------------------------------------
BEGIN;

-- 1. One-time data fix. Sport caps are duplicated here deliberately: a
--    migration is a one-time historical snapshot, not an enforcement path.
--    Enforcement going forward lives in apps/server/src/utils/sportConfig.ts
--    (getMaxActiveSlots) and set_team_lineup() below.
CREATE TEMP TABLE _caps(sport TEXT PRIMARY KEY, max_active INT) ON COMMIT DROP;
INSERT INTO _caps VALUES ('basketball', 5), ('volleyball', 6), ('table-tennis', 2);

-- Who stays active when a team is over cap: lowest lineup_slot first, then
-- earliest joined_at, then id — deterministic and safe to re-run. Kept players
-- are renumbered compactly to 1..n; the rest are benched (lineup_slot = NULL),
-- not removed from the roster.
CREATE TEMP TABLE _fix ON COMMIT DROP AS
WITH ranked AS (
  SELECT tm.id, tm.team_id, tm.lineup_slot,
         COALESCE(c.max_active, 5) AS cap,
         ROW_NUMBER() OVER (
           PARTITION BY tm.team_id
           ORDER BY tm.lineup_slot ASC, tm.joined_at ASC, tm.id ASC
         ) AS rn
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    LEFT JOIN _caps c ON c.sport = t.sport
   WHERE tm.lineup_slot IS NOT NULL
),
bad_teams AS (
  SELECT team_id FROM ranked GROUP BY team_id, cap HAVING count(*) > max(cap)
  UNION
  SELECT team_id FROM ranked WHERE lineup_slot < 1 OR lineup_slot > cap
)
SELECT r.id, r.team_id,
       CASE WHEN r.rn <= r.cap THEN r.rn::smallint ELSE NULL END AS new_slot
  FROM ranked r
 WHERE r.team_id IN (SELECT team_id FROM bad_teams);

-- Two statements, not one: the partial unique index on (team_id, lineup_slot)
-- (021_lineup_and_tt_format.sql) is not deferrable, so a single permuting
-- UPDATE can self-conflict row by row when slots are being renumbered.
UPDATE public.team_members SET lineup_slot = NULL WHERE id IN (SELECT id FROM _fix);
UPDATE public.team_members tm SET lineup_slot = f.new_slot
  FROM _fix f WHERE tm.id = f.id AND f.new_slot IS NOT NULL;

DO $$
DECLARE v_benched INT; v_teams INT;
BEGIN
  SELECT count(*), count(DISTINCT team_id) INTO v_benched, v_teams FROM _fix WHERE new_slot IS NULL;
  IF v_benched > 0 THEN
    RAISE NOTICE 'migration 062: benched % over-cap player(s) across % team(s) — re-pick starters for these teams in Edit Team', v_benched, v_teams;
  END IF;
END $$;

-- 2. Loose, sport-agnostic safety net: no sport in this app ever fields more
--    than 6 active players at once. Combined with the partial unique index,
--    this bounds a team's active count at 6 even if application code
--    regresses. This is NOT the per-sport rule itself (that stays app-enforced
--    in sportConfig.ts) — a 4th hardcoded copy of 5/6/2 here would be exactly
--    the kind of drift this change exists to fix.
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_lineup_slot_range_chk;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_lineup_slot_range_chk
  CHECK (lineup_slot IS NULL OR (lineup_slot BETWEEN 1 AND 6));

-- 3. Atomic lineup writer. The old route applied slot updates as unordered
--    parallel requests, which could self-conflict on a simple two-player swap
--    (A: 1->2, B: 2->1) depending on execution order against the partial
--    unique index. Nulling every touched row first, then re-applying, makes a
--    swap safe; the active-count re-check runs under this same statement's
--    row locks as a last-resort guard behind the application-level check.
CREATE OR REPLACE FUNCTION public.set_team_lineup(
  p_team_id UUID,
  p_slots JSONB,
  p_max_active INT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active INT;
BEGIN
  UPDATE team_members
     SET lineup_slot = NULL
   WHERE team_id = p_team_id
     AND id IN (SELECT (e->>'member_id')::uuid FROM jsonb_array_elements(p_slots) e);

  UPDATE team_members tm
     SET lineup_slot = s.slot
    FROM (
      SELECT (e->>'member_id')::uuid AS mid, (e->>'lineup_slot')::smallint AS slot
        FROM jsonb_array_elements(p_slots) e
       WHERE e->>'lineup_slot' IS NOT NULL
    ) s
   WHERE tm.id = s.mid AND tm.team_id = p_team_id;

  SELECT count(*) INTO v_active
    FROM team_members
   WHERE team_id = p_team_id AND lineup_slot IS NOT NULL;

  IF v_active > p_max_active THEN
    RAISE EXCEPTION 'LINEUP_CAP_EXCEEDED: % active exceeds max %', v_active, p_max_active
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_lineup(UUID, JSONB, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_team_lineup(UUID, JSONB, INT) FROM anon;
REVOKE ALL ON FUNCTION public.set_team_lineup(UUID, JSONB, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_lineup(UUID, JSONB, INT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
