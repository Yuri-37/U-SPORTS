-- Track whether a user has accepted U-Sports's privacy notice, so the app
-- can show a one-time blocking screen before they continue. Null means the
-- notice has never been accepted; set once by POST /api/auth/accept-privacy-notice
-- and never cleared afterward.
--
-- No versioning column yet -- there's no prior notice to version against.
-- If the notice content is ever substantively revised, add a
-- privacy_notice_version column then and gate on
-- privacy_accepted_at IS NULL OR privacy_accepted_version < CURRENT_VERSION.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.privacy_accepted_at IS
  'Set by POST /api/auth/accept-privacy-notice. Null means the user has not accepted the privacy notice yet.';

NOTIFY pgrst, 'reload schema';
