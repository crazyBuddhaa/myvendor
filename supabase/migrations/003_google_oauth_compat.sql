-- ─────────────────────────────────────────────────────────────────────────────
-- Google OAuth compatibility patch
--
-- Problem: when a Google user signs in for the first time, Supabase creates
-- an auth.users row with email_confirmed_at already set but NO slug/
-- business_name/whatsapp_number in raw_user_meta_data. If the
-- handle_new_user trigger tries to INSERT those into vendor_profiles with
-- NOT NULL constraints it raises "Database error saving new user" and the
-- entire user creation is rolled back.
--
-- Fix: replace handle_new_user so it only inserts a profile row when the
-- email+password signup metadata (slug) is present. Google OAuth users
-- reach the /dashboard/onboarding page after login and create their own
-- profile row there via the google-onboard API endpoint.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create a profile for email+password signups that have a slug.
  -- Google (and other OAuth) users will complete onboarding separately.
  IF (NEW.raw_user_meta_data ->> 'slug') IS NOT NULL THEN
    INSERT INTO public.vendor_profiles (
      id,
      slug,
      business_name,
      whatsapp_number,
      full_name
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'slug',
      COALESCE(NEW.raw_user_meta_data ->> 'business_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'whatsapp_number', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger in case it was dropped or never existed
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
