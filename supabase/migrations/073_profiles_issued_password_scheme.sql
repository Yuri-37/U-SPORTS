-- Records which generator set an account's current server-issued password.
-- 'keyed-v1' (see apps/server/src/utils/readablePassword.ts) means the
-- readable, HMAC-keyed scheme that cannot be computed off-server. NULL means
-- the password predates it -- for an athlete who has never changed their
-- password (profiles.password_changed_at IS NULL), that is the old public
-- `UrSports-<student_id>-2026!` formula, guessable by anyone. The reissue
-- script (apps/server/src/scripts/reissueFirstPasswords.ts) uses exactly that
-- pair of conditions to find accounts that need a new first password.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS issued_password_scheme TEXT;

COMMENT ON COLUMN public.profiles.issued_password_scheme IS
  'Generator that set the current server-issued password (e.g. keyed-v1); NULL = pre-scheme/self-chosen. See readablePassword.ts.';

NOTIFY pgrst, 'reload schema';
