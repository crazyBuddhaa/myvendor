-- ─────────────────────────────────────────────────────────────────────────────
-- Add product attribute columns
--
-- The add/edit product forms have inputs for tags, colors, sizes, material,
-- weight, and dimensions but products.js never saved them — they were silently
-- dropped. This migration adds the missing columns so the data can be stored.
--
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tags       TEXT,
  ADD COLUMN IF NOT EXISTS colors     TEXT,
  ADD COLUMN IF NOT EXISTS sizes      TEXT,
  ADD COLUMN IF NOT EXISTS material   TEXT,
  ADD COLUMN IF NOT EXISTS weight     TEXT,
  ADD COLUMN IF NOT EXISTS dimensions TEXT;
