-- Tables created by the `postgres` role (i.e. everything in our own migrations)
-- only inherited TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for anon/authenticated/
-- service_role — not SELECT/INSERT/UPDATE/DELETE — unlike Supabase's own
-- supabase_admin-owned tables, which get full access. RLS policies already
-- restrict access per table; these grants just let the privilege check pass
-- so those policies get evaluated at all.

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
