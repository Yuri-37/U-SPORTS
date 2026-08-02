-- NU Dasmarinas seed data (for development)
-- Run after migrations. Creates institution config and sport definitions.

-- Institution (one row). Migration 054 already seeds this on every environment;
-- kept here as a no-op safety net for local resets.
INSERT INTO institution (
  name, abbreviation, tagline, primary_color, secondary_color,
  address, region
)
SELECT
  'National University Dasmariñas',
  'NU Dasmariñas',
  'Animo NU!',
  '#002D62',
  '#FFD700',
  'Governor''s Drive, Dasmariñas, Cavite',
  'CALABARZON'
WHERE NOT EXISTS (SELECT 1 FROM institution LIMIT 1);

-- Sports configuration
INSERT INTO sports_config (slug, display_name, icon, is_active, stat_definitions, positions, sort_order)
VALUES
(
  'basketball',
  'Basketball',
  '🏀',
  TRUE,
  '{
    "gp": {"label": "GP", "type": "integer", "description": "Games Played"},
    "ppg": {"label": "PPG", "type": "decimal", "description": "Points Per Game", "derived": true},
    "rpg": {"label": "RPG", "type": "decimal", "description": "Rebounds Per Game", "derived": true},
    "apg": {"label": "APG", "type": "decimal", "description": "Assists Per Game", "derived": true},
    "spg": {"label": "SPG", "type": "decimal", "description": "Steals Per Game", "derived": true},
    "bpg": {"label": "BPG", "type": "decimal", "description": "Blocks Per Game", "derived": true},
    "fg_pct": {"label": "FG%", "type": "percentage", "description": "Field Goal Percentage"},
    "three_pct": {"label": "3PT%", "type": "percentage", "description": "3-Point Percentage"},
    "ft_pct": {"label": "FT%", "type": "percentage", "description": "Free Throw Percentage"},
    "plus_minus": {"label": "+/-", "type": "decimal", "description": "Plus/Minus"},
    "total_points": {"label": "PTS", "type": "integer"},
    "total_rebounds": {"label": "REB", "type": "integer"},
    "total_assists": {"label": "AST", "type": "integer"},
    "total_steals": {"label": "STL", "type": "integer"},
    "total_blocks": {"label": "BLK", "type": "integer"},
    "fg_made": {"label": "FGM", "type": "integer"},
    "fg_attempted": {"label": "FGA", "type": "integer"},
    "three_made": {"label": "3PM", "type": "integer"},
    "three_attempted": {"label": "3PA", "type": "integer"},
    "ft_made": {"label": "FTM", "type": "integer"},
    "ft_attempted": {"label": "FTA", "type": "integer"},
    "fouls": {"label": "PF", "type": "integer"}
  }',
  '["PG", "SG", "SF", "PF", "C"]',
  1
),
(
  'volleyball',
  'Volleyball',
  '🏐',
  TRUE,
  '{
    "gp": {"label": "GP", "type": "integer", "description": "Games Played"},
    "kills": {"label": "Kills", "type": "integer"},
    "kill_pct": {"label": "Kill%", "type": "percentage", "derived": true},
    "aces": {"label": "Aces", "type": "integer"},
    "digs": {"label": "Digs", "type": "integer"},
    "blocks": {"label": "Blocks", "type": "integer"},
    "assists": {"label": "Assists", "type": "integer"},
    "errors": {"label": "Errors", "type": "integer"},
    "serve_errors": {"label": "Serve Err", "type": "integer"},
    "reception_pct": {"label": "Reception%", "type": "percentage"},
    "attacks": {"label": "Attacks", "type": "integer"}
  }',
  '["S", "L", "OH", "OPP", "MB", "DS"]',
  2
),
(
  'table-tennis',
  'Table Tennis',
  '🏓',
  TRUE,
  '{
    "mp": {"label": "MP", "type": "integer", "description": "Matches Played"},
    "mw": {"label": "MW", "type": "integer", "description": "Matches Won"},
    "win_pct": {"label": "Win%", "type": "percentage", "derived": true},
    "sets_won": {"label": "Sets Won", "type": "integer"},
    "sets_lost": {"label": "Sets Lost", "type": "integer"},
    "pts_scored": {"label": "Pts Scored", "type": "integer"},
    "pts_conceded": {"label": "Pts Conceded", "type": "integer"},
    "avg_pt_diff": {"label": "Avg Pt Diff", "type": "decimal", "derived": true},
    "aces": {"label": "Aces", "type": "integer"},
    "smash_pct": {"label": "Smash%", "type": "percentage"},
    "seed": {"label": "Seed", "type": "integer"}
  }',
  '[]',
  3
)
ON CONFLICT (slug) DO UPDATE SET
  stat_definitions = EXCLUDED.stat_definitions,
  positions = EXCLUDED.positions,
  is_active = EXCLUDED.is_active;

-- Optional QA accounts (60 users on students.nu-dasma.edu.ph): run `pnpm db:seed:dev`.

