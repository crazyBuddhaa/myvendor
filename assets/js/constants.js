// ─── SHARED APP CONSTANTS ─────────────────────────────────────────────────────
// Single source of truth for limits that appear in multiple modules.
// Changing a value here automatically propagates to every file that imports it.

/** Number of products a free-tier vendor can add before needing to upgrade. */
export const BASE_PRODUCT_LIMIT = 20;

/** Number of receipts a free-tier vendor can generate per calendar month. */
export const FREE_RECEIPT_LIMIT = 10;

/** Telegram bot username (without @). Shared between Settings UI and server-side bot.
 *  Update this whenever the bot is renamed in BotFather. */
export const TELEGRAM_BOT_USERNAME = 'myvendorsbot';
