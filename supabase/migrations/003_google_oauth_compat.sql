-- ─────────────────────────────────────────────────────────────────────────────
-- Google OAuth compatibility patch
--
-- Problem: when a Google user signs in for the first time, Supabase creates
-- an auth.users row with email_confirmed_at already set but NO slug /
-- business_name / wa_number in raw_user_meta_data. If handle_new_user tries
-- to INSERT those into vendor_profiles with NOT NULL constraints it raises
-- "Database error saving new user" and rolls back the whole user creation.
--
-- Fix: only insert a profile row when the email+password signup metadata
-- (slug) is present. Google OAuth users go through /dashboard/onboarding
-- and create their profile via the google-onboard API endpoint instead.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create a profile for email+password signups that carry a slug.
  -- OAuth users (Google etc.) complete onboarding after their first login.
  IF (NEW.raw_user_meta_data ->> 'slug') IS NOT NULL THEN
    INSERT INTO public.vendor_profiles (
      id,
      slug,
      business_name,
      wa_number
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'slug',
      COALESCE(NEW.raw_user_meta_data ->> 'business_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'whatsapp_number', '')
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
