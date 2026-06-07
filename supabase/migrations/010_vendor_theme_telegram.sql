-- 010_vendor_theme_telegram.sql
-- Adds storefront appearance + Telegram notification columns to vendor_profiles.
-- Safe to run multiple times (IF NOT EXISTS / DO block).

ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS theme_color          text    DEFAULT '#1f6e43',
  ADD COLUMN IF NOT EXISTS banner_url           text,
  ADD COLUMN IF NOT EXISTS layout               text    NOT NULL DEFAULT 'grid',
  ADD COLUMN IF NOT EXISTS notification_channel text    NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS telegram_chat_id     text;

-- Index for the Telegram bot's chat-ID lookup (called on every bot message)
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_telegram_chat_id
  ON public.vendor_profiles (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- Add a CHECK so only valid layouts can be stored
DO $$ BEGIN
  ALTER TABLE public.vendor_profiles
    ADD CONSTRAINT chk_layout CHECK (layout IN ('grid', 'list'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add a CHECK so only valid channels can be stored
DO $$ BEGIN
  ALTER TABLE public.vendor_profiles
    ADD CONSTRAINT chk_notification_channel CHECK (notification_channel IN ('whatsapp', 'telegram'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
