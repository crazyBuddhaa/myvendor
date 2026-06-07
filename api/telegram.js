// api/telegram.js
// myvendor Telegram Bot — mirrors WhatsApp bot functionality
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (preferred) or SUPABASE_ANON_KEY
//   TELEGRAM_BOT_TOKEN         — from @BotFather
//   TELEGRAM_BOT_USERNAME      — e.g. "myvendorbot" (no @)
//   ANTHROPIC_API_KEY          — optional; enables natural-language AI replies

import { cacheGet, cacheSet } from './_cache.js';

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const BOT_TOKEN         = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Rate limiting (same logic as WhatsApp bot) ────────────────────────────────
const RL_MAX = 10;
const RL_WIN = 60 * 1000;

function isRateLimited(chatId) {
    const windowKey = Math.floor(Date.now() / RL_WIN);
    const key       = `rl:tg:${chatId}:${windowKey}`;
    const count     = cacheGet(key) || 0;
    if (count >= RL_MAX) return true;
    cacheSet(key, count + 1, RL_WIN + 5000);
    return false;
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────
async function dbGet(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (r.status === 204) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
}

async function dbPatch(table, match, payload) {
    const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
        method:  'PATCH',
        headers: {
            apikey:          SUPABASE_KEY,
            Authorization:   `Bearer ${SUPABASE_KEY}`,
            'Content-Type':  'application/json',
            Prefer:          'return=minimal',
        },
        body: JSON.stringify(payload),
    });
}

// ── Telegram Bot API helper ───────────────────────────────────────────────────
async function tgSend(chatId, text) {
    if (!BOT_TOKEN) { console.error('[telegram bot] TELEGRAM_BOT_TOKEN not set'); return; }
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id:    chatId,
            text,
            parse_mode: 'Markdown',
        }),
    });
}

// ── Nigeria-aware time boundaries ─────────────────────────────────────────────
function getNigeriaBounds() {
    const lagosDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const [year, month] = lagosDate.split('-').map(Number);
    const todayStart = new Date(`${lagosDate}T00:00:00+01:00`);
    const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+01:00`);
    return { todayStr: todayStart.toISOString(), monthStr: monthStart.toISOString() };
}

// ── Vendor stats ──────────────────────────────────────────────────────────────
async function getStats(vendorId) {
    const { todayStr, monthStr } = getNigeriaBounds();
    const [allOrders, monthOrders, todayOrders, products] = await Promise.all([
        dbGet(`orders?vendor_id=eq.${vendorId}&select=id,customer_name,status,total_amount,created_at&order=created_at.desc`),
        dbGet(`orders?vendor_id=eq.${vendorId}&created_at=gte.${encodeURIComponent(monthStr)}&select=id,status,total_amount`),
        dbGet(`orders?vendor_id=eq.${vendorId}&created_at=gte.${encodeURIComponent(todayStr)}&select=id,status,total_amount`),
        dbGet(`products?vendor_id=eq.${vendorId}&select=id,in_stock,status`),
    ]);
    const pending      = allOrders.filter(o => ['new', 'processing', 'shipped'].includes(o.status));
    const monthRevenue = monthOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const todayRevenue = todayOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const outOfStock   = products.filter(p => p.in_stock === false || p.status === 'out_of_stock');
    return {
        totalOrders: allOrders.length, todayOrders: todayOrders.length, todayRevenue,
        pendingCount: pending.length, monthRevenue, monthOrders: monthOrders.length,
        totalProducts: products.length, outOfStockCount: outOfStock.length,
        recentPending: pending.slice(0, 5)
            .map(o => `  • ${o.customer_name} — ₦${parseFloat(o.total_amount).toLocaleString()} [${o.status}]`)
            .join('\n') || '  None right now 🎉',
    };
}

// ── Keyword reply (same as WhatsApp bot) ─────────────────────────────────────
function keywordReply(stats, msg) {
    const m = msg.toLowerCase().trim();

    if (/^(hi|hello|hey|start|menu)$/.test(m) || m.includes('what can')) {
        return (
            `👋 Hi\\! I'm your *myvendor* assistant\\.\n\n` +
            `Here's what I can do:\n\n` +
            `📦 *orders* — today's & pending orders\n` +
            `💰 *revenue* — this month's earnings\n` +
            `🛍 *products* — inventory summary\n` +
            `📊 *stats* — full store overview\n\n` +
            `Or just ask me anything in plain English 🤖`
        );
    }

    if (/\b(revenue|money|earn|income|profit|naira|cash)\b/.test(m) && /\btoday\b/.test(m)) {
        return (
            `💰 *Today's Revenue*\n\n` +
            `*₦${stats.todayRevenue.toLocaleString()}* from *${stats.todayOrders}* orders\n\n` +
            `This month: *₦${stats.monthRevenue.toLocaleString()}*`
        );
    }

    if (/\b(revenue|money|earn|income|profit|naira|cash)\b/.test(m)) {
        return (
            `💰 *Revenue this month*\n\n` +
            `*₦${stats.monthRevenue.toLocaleString()}*\n` +
            `from ${stats.monthOrders} orders\n\n` +
            `All\\-time orders: ${stats.totalOrders}`
        );
    }

    if (/\b(order|orders|today|pending|sale|sales)\b/.test(m)) {
        return (
            `📦 *Orders*\n\nToday: *${stats.todayOrders}*\nPending: *${stats.pendingCount}*\n\n` +
            `*Recent pending:*\n${stats.recentPending}`
        );
    }

    if (/\b(product|products|stock|inventory|item|items)\b/.test(m)) {
        const warn = stats.outOfStockCount > 0
            ? `\n\n⚠️ ${stats.outOfStockCount} out of stock\\. Update at:\nhttps://myvendor\\.qzz\\.io/dashboard/products\\.html`
            : '\n\n✅ All products in stock\\!';
        return (
            `🛍 *Inventory*\n\n` +
            `Total products: *${stats.totalProducts}*\n` +
            `Out of stock: *${stats.outOfStockCount}*${warn}`
        );
    }

    if (/\b(stats|summary|dashboard|report|overview|all)\b/.test(m)) {
        return (
            `📊 *Store Overview*\n\n` +
            `💰 Month revenue: *₦${stats.monthRevenue.toLocaleString()}*\n` +
            `📦 Today's orders: *${stats.todayOrders}*\n` +
            `⏳ Pending: *${stats.pendingCount}*\n` +
            `🛍 Products: *${stats.totalProducts}*\n` +
            `❌ Out of stock: *${stats.outOfStockCount}*`
        );
    }

    if (/\b(help|command|support)\b/.test(m)) {
        return (
            `📖 *Commands*\n\n` +
            `*orders* — today's & pending orders\n` +
            `*revenue* — earnings this month\n` +
            `*products* — inventory summary\n` +
            `*stats* — full overview\n\n` +
            `Dashboard: https://myvendor\\.qzz\\.io/dashboard`
        );
    }

    return null;
}

// ── AI fallback ───────────────────────────────────────────────────────────────
async function aiReply(vendor, message, stats) {
    if (!ANTHROPIC_API_KEY) return null;
    try {
        const system =
            `You are a helpful Telegram assistant for "${vendor.business_name}" on myvendor.\n` +
            `Store data: orders_today=${stats.todayOrders}, pending=${stats.pendingCount}, ` +
            `month_revenue=₦${stats.monthRevenue.toLocaleString()}, month_orders=${stats.monthOrders}, ` +
            `products=${stats.totalProducts}, out_of_stock=${stats.outOfStockCount}.\n` +
            `Reply in max 2 sentences, plain text. Use ₦ for money. Only use the data above — never invent numbers.`;

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 300,
                system,
                messages: [{ role: 'user', content: message }],
            }),
        });
        const j = await resp.json();
        return j?.content?.[0]?.text || null;
    } catch (err) {
        console.error('[telegram bot] Anthropic error:', err);
        return null;
    }
}

// ── Main Vercel handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method === 'GET') {
        // Admin: register webhook with Telegram API
        // GET /api/telegram?action=setup-webhook  (Authorization: Bearer <ADMIN_PASSWORD>)
        if (req.query.action === 'setup-webhook') {
            if (req.headers.authorization !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            if (!BOT_TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set in Vercel env vars' });
            const webhookUrl = 'https://myvendor.qzz.io/telegram';
            const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message'] }),
            });
            const d = await r.json();
            // Also fetch bot info to confirm the token is valid
            const infoR = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
            const info  = await infoR.json();
            return res.status(r.ok ? 200 : 400).json({ webhook: d, bot: info?.result || null });
        }
        // Health check
        return res.status(200).json({ ok: true, bot: 'myvendor Telegram Bot' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Acknowledge Telegram immediately
    res.status(200).json({ ok: true });

    try {
        const body   = req.body;
        const update = body;
        const msg    = update?.message || update?.edited_message;
        if (!msg) return;

        const chatId = String(msg.chat?.id || '');
        const text   = (msg.text || '').trim();
        if (!chatId || !text) return;

        // ── /start command: link Telegram account to vendor ───────────────────
        // Deep link format: /start link_<vendorId>
        const startMatch = text.match(/^\/start(?:\s+link_([a-zA-Z0-9_-]+))?/);
        if (startMatch) {
            const vendorId = startMatch[1];

            if (vendorId) {
                // Link this chat to the vendor
                const rows = await dbGet(`vendor_profiles?id=eq.${encodeURIComponent(vendorId)}&select=id,business_name`);
                const vendor = rows[0];
                if (!vendor) {
                    await tgSend(chatId, '❌ Store not found\\. Please try linking again from your dashboard\\.');
                    return;
                }
                await dbPatch('vendor_profiles', { id: vendorId }, {
                    telegram_chat_id: chatId,
                });
                await tgSend(chatId,
                    `✅ *${vendor.business_name}* is now linked to this Telegram chat\\!\n\n` +
                    `You'll receive order notifications here\\. Type *stats* to check your store anytime\\.`
                );
                return;
            }

            // /start without a link code — try to find vendor by chat_id
            const rows = await dbGet(`vendor_profiles?telegram_chat_id=eq.${encodeURIComponent(chatId)}&select=id,business_name`);
            const vendor = rows[0];
            if (vendor) {
                await tgSend(chatId,
                    `👋 Welcome back, *${vendor.business_name}*\\!\n\n` +
                    `📦 *orders* · 💰 *revenue* · 🛍 *products* · 📊 *stats*\n\nOr ask me anything 🤖`
                );
            } else {
                await tgSend(chatId,
                    `👋 Hi\\! I'm the *myvendor* assistant bot\\.\n\n` +
                    `To link your store, go to your dashboard → Settings → Notification Bot and tap *Link Telegram*\\.`
                );
            }
            return;
        }

        // Rate limit
        if (isRateLimited(chatId)) {
            console.warn(`[telegram bot] rate limited: ${chatId}`);
            return;
        }

        // Look up vendor by their Telegram chat ID
        const rows = await dbGet(`vendor_profiles?telegram_chat_id=eq.${encodeURIComponent(chatId)}&select=*`);
        const vendor = rows[0];

        if (!vendor) {
            await tgSend(chatId,
                `❌ No store linked to this chat\\.\n\n` +
                `Go to your myvendor dashboard → Settings → Notification Bot and tap *Link Telegram*\\.`
            );
            return;
        }

        const stats   = await getStats(vendor.id);
        const kwReply = keywordReply(stats, text);
        if (kwReply) {
            await tgSend(chatId, kwReply);
            return;
        }

        const reply = await aiReply(vendor, text, stats);
        await tgSend(chatId, reply || 'Not sure about that 🤔 Type *help* to see what I can do\\.');

    } catch (err) {
        console.error('[telegram bot] handler error:', err);
    }
}
