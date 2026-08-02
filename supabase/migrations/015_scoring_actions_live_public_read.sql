-- Allow public read of scoring log rows only while the match is live (for hub phase labels / UI).
CREATE POLICY "scoring_actions_select_live_public" ON scoring_actions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = scoring_actions.match_id
      AND m.status = 'live'
  )
);
