-- Double elimination needs a second forward pointer: when a winners-bracket
-- match concludes, the winner already has somewhere to go (next_bracket_id).
-- The loser needs somewhere to go too -- into a specific slot of a specific
-- losers-bracket match, determined at bracket-generation time. Single
-- elimination and round robin never set these; only winners-bracket matches
-- in a double-elim event do.
ALTER TABLE public.brackets
  ADD COLUMN IF NOT EXISTS loser_next_bracket_id UUID REFERENCES public.brackets(id),
  ADD COLUMN IF NOT EXISTS loser_slot TEXT CHECK (loser_slot IN ('a', 'b'));

COMMENT ON COLUMN public.brackets.loser_next_bracket_id IS
  'Double elimination only: the losers-bracket match this match''s loser drops into. Written by bracketGenerator.ts, consumed by advanceWinner().';
COMMENT ON COLUMN public.brackets.loser_slot IS
  'Which participant slot (a/b) of loser_next_bracket_id the loser fills.';

NOTIFY pgrst, 'reload schema';
