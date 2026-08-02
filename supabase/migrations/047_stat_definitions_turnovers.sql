-- =============================================================================
-- 047 — Bring sports_config.stat_definitions in line with what is recorded
--
-- The panel flagged that turnovers were not tracked. They were absent from the
-- whole codebase — no button, no action mapping, and no stat definition.
--
-- The seeded definitions also advertised FG%/3PT%/FT%/Kill% while the scoring
-- path never produced the makes/attempts they need, so those percentages could
-- never be computed. Live scoring now records attempts and turnovers; this
-- aligns the catalogue with it.
--
-- Idempotent: safe to re-run, and creates the rows if seed.sql was never applied.
-- =============================================================================

INSERT INTO public.sports_config (slug, display_name, icon, is_active, positions, sort_order)
VALUES
  ('basketball',   'Basketball',   '🏀', TRUE, '["PG","SG","SF","PF","C"]'::jsonb,        1),
  ('volleyball',   'Volleyball',   '🏐', TRUE, '["S","L","OH","OPP","MB","DS"]'::jsonb,   2),
  ('table-tennis', 'Table Tennis', '🏓', TRUE, '[]'::jsonb,                               3)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.sports_config
SET stat_definitions = '{
  "gp":                {"label": "GP",   "type": "integer",    "description": "Games Played"},
  "total_points":      {"label": "PTS",  "type": "integer"},
  "total_rebounds":    {"label": "REB",  "type": "integer"},
  "off_rebounds":      {"label": "OREB", "type": "integer"},
  "def_rebounds":      {"label": "DREB", "type": "integer"},
  "total_assists":     {"label": "AST",  "type": "integer"},
  "total_steals":      {"label": "STL",  "type": "integer"},
  "total_blocks":      {"label": "BLK",  "type": "integer"},
  "turnovers":         {"label": "TO",   "type": "integer",    "description": "Turnovers"},
  "fouls":             {"label": "PF",   "type": "integer"},
  "fg_made":           {"label": "FGM",  "type": "integer"},
  "fg_attempted":      {"label": "FGA",  "type": "integer"},
  "three_made":        {"label": "3PM",  "type": "integer"},
  "three_attempted":   {"label": "3PA",  "type": "integer"},
  "ft_made":           {"label": "FTM",  "type": "integer"},
  "ft_attempted":      {"label": "FTA",  "type": "integer"},
  "ppg":               {"label": "PPG",  "type": "decimal",    "derived": true, "description": "Points Per Game"},
  "rpg":               {"label": "RPG",  "type": "decimal",    "derived": true, "description": "Rebounds Per Game"},
  "apg":               {"label": "APG",  "type": "decimal",    "derived": true, "description": "Assists Per Game"},
  "spg":               {"label": "SPG",  "type": "decimal",    "derived": true, "description": "Steals Per Game"},
  "bpg":               {"label": "BPG",  "type": "decimal",    "derived": true, "description": "Blocks Per Game"},
  "topg":              {"label": "TOPG", "type": "decimal",    "derived": true, "description": "Turnovers Per Game"},
  "fg_pct":            {"label": "FG%",  "type": "percentage", "derived": true, "numerator": "fg_made",     "denominator": "fg_attempted"},
  "three_pct":         {"label": "3PT%", "type": "percentage", "derived": true, "numerator": "three_made",  "denominator": "three_attempted"},
  "ft_pct":            {"label": "FT%",  "type": "percentage", "derived": true, "numerator": "ft_made",     "denominator": "ft_attempted"},
  "ast_to":            {"label": "AST/TO","type": "decimal",   "derived": true, "numerator": "total_assists","denominator": "turnovers"}
}'::jsonb
WHERE slug = 'basketball';

UPDATE public.sports_config
SET stat_definitions = '{
  "gp":                {"label": "GP",       "type": "integer", "description": "Games Played"},
  "pts_scored":        {"label": "PTS",      "type": "integer"},
  "kills":             {"label": "Kills",    "type": "integer"},
  "attacks":           {"label": "Attacks",  "type": "integer"},
  "aces":              {"label": "Aces",     "type": "integer"},
  "digs":              {"label": "Digs",     "type": "integer"},
  "blocks":            {"label": "Blocks",   "type": "integer"},
  "assists":           {"label": "Sets",     "type": "integer"},
  "errors":            {"label": "Errors",   "type": "integer"},
  "serve_errors":      {"label": "Srv Err",  "type": "integer"},
  "reception_errors":  {"label": "Rcv Err",  "type": "integer"},
  "kill_pct":          {"label": "Kill%",    "type": "percentage", "derived": true, "numerator": "kills", "denominator": "attacks"}
}'::jsonb
WHERE slug = 'volleyball';

UPDATE public.sports_config
SET stat_definitions = '{
  "gp":            {"label": "GP",      "type": "integer", "description": "Games Played"},
  "pts_scored":    {"label": "PTS",     "type": "integer"},
  "winners":       {"label": "Winners", "type": "integer"},
  "aces":          {"label": "Aces",    "type": "integer"},
  "errors":        {"label": "Errors",  "type": "integer"},
  "win_error_ratio": {"label": "W/E",   "type": "decimal", "derived": true, "numerator": "winners", "denominator": "errors"}
}'::jsonb
WHERE slug = 'table-tennis';

NOTIFY pgrst, 'reload schema';
