-- ─────────────────────────────────────────────────────────────────────────────
-- Create the reward_referral function that is called by the
-- handle_referral_on_confirm trigger (001_referral_trigger.sql).
--
-- Safe to re-run: CREATE OR REPLACE replaces any prior version.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reward_referral(referrer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vendor_profiles
     SET bonus_slots = COALESCE(bonus_slots, 0) + 3
   WHERE id = referrer_id;
END;
$$;
