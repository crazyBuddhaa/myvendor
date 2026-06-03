-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor settings: vacation mode + custom order message template
--
-- vacation_mode  — when TRUE the storefront shows a "we're on a break" page
--                  instead of the product grid.
-- order_template — premium vendors can customise the WhatsApp order message.
--                  Supports {vendor}, {items}, {total}, {name}, {phone},
--                  {address}, {notes} placeholders.
--
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS vacation_mode    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS order_template   TEXT;
