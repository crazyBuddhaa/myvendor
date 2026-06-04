-- ─────────────────────────────────────────────────────────────────────────────
-- Persistent WhatsApp message deduplication table.
--
-- Replaces the in-memory Set in api/whatsapp.js which is wiped on every
-- serverless cold-start, allowing Meta to reprocess already-handled messages.
--
-- Rows older than 24 hours can be pruned; a pg_cron job or a DELETE in the
-- handler keeps the table lean.  The index on created_at supports efficient
-- cleanup queries.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id  TEXT        PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS processed_messages_created_at_idx
    ON processed_messages (created_at);
