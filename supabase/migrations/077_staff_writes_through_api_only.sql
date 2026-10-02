-- Team and roster changes now go through the API only.
--
-- Until now any staff account (including every Coach) could INSERT / UPDATE /
-- DELETE rows in team_coaches, team_members, athletes and teams directly with
-- its own sign-in token, using the policies from migration 037. The API
-- enforces the real rules -- an organizer is limited to their sports and a
-- coach to the teams they coach -- but a direct call to the database skipped all
-- of that: a coach could add themselves to any team, or empty another team's
-- roster, with one request.
--
-- No client writes these tables directly (the web app and the mobile app only
-- read them; every change is an API call, which uses the service role and is
-- not subject to row-level security), so dropping the write policies closes the
-- bypass without changing any screen. Reads are untouched: team_coaches,
-- team_members and teams keep their public SELECT policies, and
-- athletes_select_visible still lets staff see every athlete.

DROP POLICY IF EXISTS team_coaches_write_staff ON public.team_coaches;
DROP POLICY IF EXISTS team_members_write_staff ON public.team_members;
DROP POLICY IF EXISTS athletes_write_staff ON public.athletes;
DROP POLICY IF EXISTS teams_write_competition ON public.teams;
