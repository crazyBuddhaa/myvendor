-- ─────────────────────────────────────────────────────────────────────────────
-- Google OAuth compatibility patch
--
-- Problem 1: handle_new_user was not inserting into public.profiles, which is
-- required before vendor_profiles can be inserted (FK chain:
-- auth.users → public.profiles → public.vendor_profiles).
-- Google OAuth users ended up with no profiles row, causing a crash on login.
--
-- Problem 2: vendor_profiles.whatsapp_number is NOT NULL. The previous version
-- of this trigger was writing to wa_number (nullable) and skipping
-- whatsapp_number, so the insert failed with a NOT NULL constraint violation.
--
-- Fix:
--   1. Always insert a public.profiles row for every new user (OAuth + email).
--   2. Only insert vendor_profiles when slug metadata is present
--      (email+password signups). Google OAuth users complete onboarding via
--      /dashboard/onboarding → POST /api/auth/google-onboard instead.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always create a profiles row — required by the vendor_profiles FK.
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- Only create vendor_profiles for email+password signups (slug present).
  -- Google OAuth users will complete onboarding after their first login.
  IF (NEW.raw_user_meta_data ->> 'slug') IS NOT NULL THEN
    INSERT INTO public.vendor_profiles (
      id,
      slug,
      business_name,
      whatsapp_number,
      wa_number,
      full_name
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'slug',
      COALESCE(NEW.raw_user_meta_data ->> 'business_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'whatsapp_number', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'whatsapp_number', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
