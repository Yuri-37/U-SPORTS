-- Track when a user last changed their own password so the API can enforce a
-- 7-day cooldown between self-service password changes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.password_changed_at IS
  'Set by POST /api/auth/change-password. Null means the user has never used self-service password change.';
