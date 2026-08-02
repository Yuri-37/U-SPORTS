-- Run this in Supabase SQL editor to repair accounts created directly via the Auth dashboard.
-- It upserts a profiles row for every auth.users row that is missing one or has the wrong role,
-- marking them as role='student' + enrollment_status='unverified' so they appear under
-- Organizer → Student intake → Pending review.
--
-- You can also target a single user by uncommenting the WHERE at the bottom.

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  enrollment_status
)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'student'::public.user_role,
  'unverified'::public.enrollment_status
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
-- Uncomment to fix SPECIFIC users instead of all orphaned ones:
-- AND u.email IN ('10@students.nu-dasma.edu.ph', 'dacubayc@students.nu-dasma.edu.ph')
ON CONFLICT (id) DO NOTHING;

-- Repair existing profiles that ended up as 'athlete' instead of 'student'
-- because they were created via Auth UI without metadata.
-- Only update if enrollment_status is NULL (i.e. the trigger ran without student branch).
UPDATE public.profiles
SET
  role = 'student',
  enrollment_status = 'unverified'
WHERE
  role = 'athlete'
  AND enrollment_status IS NULL
-- Uncomment to target specific emails only:
-- AND email IN ('10@students.nu-dasma.edu.ph', 'dacubayc@students.nu-dasma.edu.ph')
;

-- Verify the result:
SELECT id, email, full_name, role, enrollment_status
FROM public.profiles
WHERE email IN ('10@students.nu-dasma.edu.ph', 'dacubayc@students.nu-dasma.edu.ph');
