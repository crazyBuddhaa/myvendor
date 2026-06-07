// api/notify.js
// Lightweight order-notification relay.
// Called fire-and-forget from the storefront checkout and the vendor orders dashboard.
// Sends a Telegram message to the vendor when notification_channel === 'telegram'.
//
// POST /api/notify
// Body: { vendorId, customerName, total, items, customerPhone? }
// No auth — vendorId is public. Rate-limited 30 calls/vendor/min.

import { cacheGet, cacheSet } from './_cache.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;

const RL_MAX = 30;
const RL_WIN = 60 * 1000;

function isRateLimited(vendorId) {
    const key   = `rl:notify:${vendorId}:${Math.floor(Date.now() / RL_WIN)}`;
    const count = cacheGet(key) || 0;
    if (count >= RL_MAX) return true;
    cacheSet(key, count + 1, RL_WIN + 5000);
    return false;
}

async function getVendor(vendorId) {
    const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vendor_profiles?id=eq.${encodeURIComponent(vendorId)}&select=notification_channel,telegram_chat_id,business_name`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : null;
}

async function sendTelegram(chatId, text) {
    if (!BOT_TOKEN) { console.warn('[notify] TELEGRAM_BOT_TOKEN not set'); return; }
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    const { vendorId, customerName, total, items, customerPhone } = req.body || {};
    if (!vendorId) return res.status(400).json({ error: 'vendorId required' });

    // Respond immediately — never make the storefront wait on this
    res.status(202).json({ queued: true });

    if (isRateLimited(vendorId)) return;

    try {
        const vendor = await getVendor(vendorId);
        if (!vendor || vendor.notification_channel !== 'telegram' || !vendor.telegram_chat_id) return;

        const itemsText  = (items || '(see order)').replace(/[_*[]()~`>#+-=|{}.!]/g, '\\$&');
        const nameEsc    = (customerName  || 'Unknown').replace(/[_*[]()~`>#+-=|{}.!]/g, '\\$&');
        const phoneEsc   = (customerPhone || '').replace(/[_*[]()~`>#+-=|{}.!]/g, '\\$&');
        const totalFmt   = Number(total || 0).toLocaleString();

        const msg =
            `🛍 *New Order — ${vendor.business_name}*\n\n` +
            `👤 *Customer:* ${nameEsc}\n` +
            (customerPhone ? `📞 *Phone:* ${phoneEsc}\n` : '') +
            `\n📦 *Items:*\n${itemsText}\n\n` +
            `💰 *Total: ₦${totalFmt}*\n\n` +
            `[Open Orders Dashboard](https://myvendor.qzz.io/dashboard/orders.html)`;

        await sendTelegram(vendor.telegram_chat_id, msg);
    } catch (err) {
        console.error('[notify] error:', err);
    }
}
