-- ─────────────────────────────────────────────────────────────────────────────
-- Custom email verification table
--
-- Why this exists: Supabase's default confirmation emails route through
-- sotdghhayztnpwnrzjzu.supabase.co, which Gmail blocks as unsolicited.
-- We bypass Supabase's built-in email entirely and send our own via Resend
-- with a link to myvendor.qzz.io/verify?token=<token>.
--
-- Flow:
--   1. POST /api/auth/signup  → creates user (email_confirm: false) + inserts here
--   2. Resend sends email with link pointing to myvendor.qzz.io only
--   3. GET  /api/auth/verify  → validates token, calls admin.updateUserById
--      with { email_confirm: true }, which sets email_confirmed_at and fires
--      the referral reward trigger (handle_referral_on_confirm)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_verifications (
  token      TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL,
  email      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Index for the resend-by-email lookup
CREATE INDEX IF NOT EXISTS idx_pending_verifications_email
  ON pending_verifications (email);

-- No client-side access — service role only via Vercel functions
ALTER TABLE pending_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_access" ON pending_verifications
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
