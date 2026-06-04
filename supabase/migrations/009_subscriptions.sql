-- ─── 009: Subscription tracking ──────────────────────────────────────────────
-- Adds payment-related columns to vendor_profiles and creates a payments log.

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS paystack_customer_code    TEXT,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT,
  ADD COLUMN IF NOT EXISTS premium_since             TIMESTAMPTZ;

-- Payments audit log
CREATE TABLE IF NOT EXISTS payments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID        NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  reference      TEXT        UNIQUE NOT NULL,
  amount         INTEGER     NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',
  paystack_event TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for vendor payment lookups
CREATE INDEX IF NOT EXISTS payments_vendor_id_idx ON payments(vendor_id);
