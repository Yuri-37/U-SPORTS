-- Fix auth signup trigger: search_path + qualified table + safe role resolution.
-- Without SET search_path, INSERT target can fail; invalid ::user_role casts also bubble as "Database error creating new user".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role public.user_role := 'athlete'::public.user_role;
  role_raw text;
BEGIN
  role_raw := COALESCE(
    NEW.raw_app_meta_data->>'role',
    NEW.raw_user_meta_data->>'role'
  );
  IF role_raw IS NOT NULL AND role_raw IN ('super_admin', 'organizer', 'athlete') THEN
    resolved_role := role_raw::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    resolved_role
  );
  RETURN NEW;
END;
$$;
