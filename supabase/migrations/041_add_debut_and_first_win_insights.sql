-- Migration 041: Add debut_standout and first_win insight types

ALTER TYPE insight_type ADD VALUE 'debut_standout' AFTER 'trending_down';
ALTER TYPE insight_type ADD VALUE 'first_win' AFTER 'streak';

NOTIFY pgrst, 'reload schema';
