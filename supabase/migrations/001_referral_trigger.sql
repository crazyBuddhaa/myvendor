-- ─────────────────────────────────────────────────────────────────────────────
-- Referral reward trigger
--
-- Problem solved: the old client-side approach called reward_referral() right
-- after supabase.auth.signUp() returned — before the new user confirmed their
-- email. Anyone could open a throwaway email address, hit "Sign Up", and the
-- referrer would be credited immediately without a real verified account.
--
-- Fix: referrer_id is now stored in raw_user_meta_data at signup time (via
-- options.data.referrer_id in dashboard/index.html). This trigger fires on
-- auth.users AFTER UPDATE, but only when email_confirmed_at transitions from
-- NULL → NOT NULL (i.e. the user just clicked their verification link).
-- It then calls reward_referral() for the referrer — guaranteeing the credit
-- only lands once a real confirmed account exists.
--
-- Guards built in:
--   • self-referral blocked  (referrer_id != NEW.id)
--   • fires only on the NULL→NOT NULL transition (idempotent on re-confirms)
--   • SECURITY DEFINER so the function can write to vendor_profiles regardless
--     of the calling user's RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_referral_on_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Only act on the exact moment email_confirmed_at goes from NULL to a value.
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    v_referrer_id := (NEW.raw_user_meta_data ->> 'referrer_id')::UUID;

    -- Null check + self-referral guard.
    IF v_referrer_id IS NOT NULL AND v_referrer_id != NEW.id THEN
      PERFORM reward_referral(v_referrer_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop first so re-running this migration is safe.
DROP TRIGGER IF EXISTS on_email_confirmed_reward_referral ON auth.users;

CREATE TRIGGER on_email_confirmed_reward_referral
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_referral_on_confirm();


-- ─────────────────────────────────────────────────────────────────────────────
-- reward_referral function (schema reference — already exists in Supabase)
--
-- If you ever need to recreate this from scratch, the function should:
--   1. Add 3 to vendor_profiles.bonus_slots WHERE id = referrer_id
--   2. Insert or upsert — never error if the referrer has no profile yet
--
-- Example implementation:
--
-- CREATE OR REPLACE FUNCTION reward_referral(referrer_id UUID)
-- RETURNS VOID
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   UPDATE vendor_profiles
--      SET bonus_slots = COALESCE(bonus_slots, 0) + 3
--    WHERE id = referrer_id;
-- END;
-- $$;
-- ─────────────────────────────────────────────────────────────────────────────
