-- =============================================================================
-- 075 — Volleyball stats: excellent sets/digs, one "attack" stat, receives
--
-- Brings the platform in line with the box score volleyball officials keep:
--   * `assists`  is labelled "Excellent Sets" (was "Sets")
--   * `digs`     is labelled "Excellent Digs" (was "Digs")
--   * kills and attack attempts become ONE stat, `attacks`, labelled "Attack".
--     Kill% goes with them: merging removes the attempts denominator it needed.
--   * `receives` is new — a clean reception, recorded from live scoring.
--
-- Historical carry-over: an athlete's new `attacks` is their old `kills`
-- (attack points), NOT their old `attacks`, which counted attempts
-- (old attacks = kills + attack errors) and would overstate every hitter.
-- =============================================================================

-- 1. Stat catalogue -----------------------------------------------------------
UPDATE public.sports_config
SET stat_definitions = '{
  "gp":                {"label": "GP",      "type": "integer", "description": "Games Played"},
  "pts_scored":        {"label": "PTS",     "type": "integer"},
  "attacks":           {"label": "Att",     "type": "integer", "description": "Attack points"},
  "aces":              {"label": "Aces",    "type": "integer"},
  "blocks":            {"label": "Blocks",  "type": "integer"},
  "digs":              {"label": "Exc Dig", "type": "integer", "description": "Excellent digs"},
  "assists":           {"label": "Exc Set", "type": "integer", "description": "Excellent sets"},
  "receives":          {"label": "Rcv",     "type": "integer", "description": "Receives"},
  "errors":            {"label": "Err",     "type": "integer"},
  "serve_errors":      {"label": "Srv Err", "type": "integer"},
  "reception_errors":  {"label": "Rcv Err", "type": "integer"}
}'::jsonb
WHERE slug = 'volleyball';

-- 2. Live action log ----------------------------------------------------------
-- 'kill' is now 'attack'. Only volleyball ever logged it, so no sport filter is
-- needed. The server still accepts 'kill' from a scoring tab loaded before this
-- change and maps it to the same stat, so a match in progress is unaffected.
UPDATE public.scoring_actions
SET action_type = 'attack'
WHERE action_type = 'kill';

-- 3. Recorded stat blobs ------------------------------------------------------
-- A blob that carries `kills`: attacks := kills, then drop kills. Dropping the
-- key is what makes this idempotent — once applied, the WHERE matches no rows,
-- so a replay cannot re-zero a value it already carried over. jsonb_typeof
-- guards a non-numeric value from cast-erroring the whole migration.
--
-- Only blobs holding `kills` are touched. A blob with `attacks` but no `kills`
-- would be an athlete charged attack errors without ever landing a kill, whose
-- old `attacks` counted attempts; every such row was checked for and none
-- exists (217 game rows and 37 season rows, all carrying `kills`), so no second
-- rule is needed — and leaving it out keeps a replay from ever zeroing real
-- attack points.
UPDATE public.player_game_stats
SET stats = (stats - 'kills') || jsonb_build_object(
      'attacks',
      CASE WHEN jsonb_typeof(stats -> 'kills') = 'number'
           THEN (stats ->> 'kills')::numeric
           ELSE 0 END
    )
WHERE sport = 'volleyball'
  AND stats ? 'kills';

UPDATE public.player_season_stats
SET stats = (stats - 'kills') || jsonb_build_object(
      'attacks',
      CASE WHEN jsonb_typeof(stats -> 'kills') = 'number'
           THEN (stats ->> 'kills')::numeric
           ELSE 0 END
    )
WHERE sport = 'volleyball'
  AND stats ? 'kills';

NOTIFY pgrst, 'reload schema';
