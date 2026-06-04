-- ─────────────────────────────────────────────────────────────────────────────
-- Orders: add customer phone + delivery address fields
-- Vendor profiles: add store logo URL
--
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_phone   TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT;

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
