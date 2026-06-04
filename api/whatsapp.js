// api/whatsapp.js
// myvendor WhatsApp Bot Assistant
// Handles Meta WhatsApp Cloud API webhooks
//
// Required Vercel env vars:
//   SUPABASE_URL            — already set
//   SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY — already set
//   WA_VERIFY_TOKEN         — any secret string you choose
//   WA_ACCESS_TOKEN         — Meta permanent access token
//   WA_PHONE_NUMBER_ID      — from Meta Developer Console
//   ANTHROPIC_API_KEY       — optional, enables natural-language AI replies

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const WA_VERIFY_TOKEN    = process.env.WA_VERIFY_TOKEN   || 'myvendor-verify';
const WA_ACCESS_TOKEN    = process.env.WA_ACCESS_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;

// ── Supabase helper ───────────────────────────────────────────────────────────
async function db(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            apikey:        SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    if (r.status === 204) return [];
    return r.json();
}

// ── Send a WhatsApp text message ──────────────────────────────────────────────
async function waReply(to, text) {
    if (!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
        console.error('[whatsapp bot] WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID not configured');
        return;
    }
    await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`, {
        method:  'POST',
        headers: {
            Authorization:  `Bearer ${WA_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: text },
        }),
    });
}

// ── Look up vendor by their WhatsApp number ───────────────────────────────────
async function getVendorByPhone(waNumber) {
    const norm = waNumber.replace(/\D/g, '');
    const rows = await db(`vendor_profiles?whatsapp_number=eq.${encodeURIComponent(norm)}&select=*`);
    return Array.isArray(rows) ? rows[0] || null : null;
}

// ── Fetch store stats for a vendor ───────────────────────────────────────────
async function getStats(vendorId) {
    const [orders, products] = await Promise.all([
        db(`orders?vendor_id=eq.${vendorId}&select=id,customer_name,status,total_amount,created_at&order=created_at.desc`),
        db(`products?vendor_id=eq.${vendorId}&select=id,in_stock,status`),
    ]);

    const now      = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const ordArr   = Array.isArray(orders)   ? orders   : [];
    const prodArr  = Array.isArray(products) ? products : [];

    const pending      = ordArr.filter(o => ['new', 'processing', 'shipped'].includes(o.status));
    const monthOrders  = ordArr.filter(o => o.created_at >= monthStr);
    const monthRevenue = monthOrders
        .filter(o => o.status === 'delivered')
        .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const outOfStock   = prodArr.filter(p => p.in_stock === false || p.status === 'out_of_stock');

    return {
        totalOrders:   ordArr.length,
        todayOrders:   ordArr.filter(o => o.created_at >= todayStr).length,
        pendingCount:  pending.length,
        monthRevenue,
        monthOrders:   monthOrders.length,
        totalProducts: prodArr.length,
        outOfStock:    outOfStock.length,
        recentPending: pending.slice(0, 5)
            .map(o => `  • ${o.customer_name} — ₦${parseFloat(o.total_amount).toLocaleString()} [${o.status}]`)
            .join('\n') || '  None right now 🎉',
    };
}

// ── Keyword command matching ───────────────────────────────────────────────────
function keywordReply(stats, msg) {
    const m = msg.toLowerCase().trim();

    if (/^(hi|hello|hey|start|menu)$/.test(m) || m.includes('what can')) {
        return `👋 Hi! I'm your *myvendor* assistant.\n\nHere's what I can do:\n\n📦 *orders* — today's & pending orders\n💰 *revenue* — this month's earnings\n🛍️ *products* — inventory summary\n📊 *stats* — full store overview\n\nOr just ask me anything in plain English 🤖`;
    }
    if (/\b(order|orders|today|pending|sale|sales)\b/.test(m)) {
        return `📦 *Orders*\n\nToday: *${stats.todayOrders}*\nPending: *${stats.pendingCount}*\n\n*Recent pending:*\n${stats.recentPending}`;
    }
    if (/\b(revenue|money|earn|income|profit|naira|cash)\b/.test(m)) {
        return `💰 *Revenue this month*\n\n*₦${stats.monthRevenue.toLocaleString()}*\nfrom ${stats.monthOrders} orders\n\nAll-time orders: ${stats.totalOrders}`;
    }
    if (/\b(product|products|stock|inventory|item|items)\b/.test(m)) {
        const warn = stats.outOfStock > 0
            ? `\n\n⚠️ ${stats.outOfStock} out of stock. Update at:\nhttps://myvendor.qzz.io/dashboard/products.html`
            : '\n\n✅ All products in stock!';
        return `🛍️ *Inventory*\n\nTotal products: *${stats.totalProducts}*\nOut of stock: *${stats.outOfStock}*${warn}`;
    }
    if (/\b(stats|summary|dashboard|report|overview|all)\b/.test(m)) {
        return `📊 *Store Overview*\n\n💰 Month revenue: *₦${stats.monthRevenue.toLocaleString()}*\n📦 Today's orders: *${stats.todayOrders}*\n⏳ Pending: *${stats.pendingCount}*\n🛍️ Products: *${stats.totalProducts}*\n❌ Out of stock: *${stats.outOfStock}*`;
    }
    if (/\b(help|command|support)\b/.test(m)) {
        return `📖 *Commands*\n\n*orders* — today's & pending orders\n*revenue* — earnings this month\n*products* — inventory summary\n*stats* — full overview\n\nDashboard: https://myvendor.qzz.io/dashboard`;
    }
    return null;
}

// ── Anthropic AI fallback (natural language) ──────────────────────────────────
async function aiReply(vendor, message, stats) {
    if (!ANTHROPIC_API_KEY) return null;
    try {
        const system = `You are a helpful WhatsApp assistant for "${vendor.business_name}" on myvendor.\nStore data: orders_today=${stats.todayOrders}, pending=${stats.pendingCount}, month_revenue=₦${stats.monthRevenue.toLocaleString()}, month_orders=${stats.monthOrders}, products=${stats.totalProducts}, out_of_stock=${stats.outOfStock}.\nReply in max 2 sentences, WhatsApp style. Use ₦ for money. Only use the data above — never invent numbers.`;

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method:  'POST',
            headers: {
                'x-api-key':        ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type':     'application/json',
            },
            body: JSON.stringify({
                model:      'claude-haiku-4-5',
                max_tokens: 300,
                system,
                messages:   [{ role: 'user', content: message }],
            }),
        });
        const j = await resp.json();
        return j?.content?.[0]?.text || null;
    } catch (err) {
        console.error('[whatsapp bot] Anthropic error:', err);
        return null;
    }
}

// ── Main Vercel handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
    // GET — Meta webhook verification challenge
    if (req.method === 'GET') {
        const mode      = req.query['hub.mode'];
        const token     = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        return res.status(403).json({ error: 'Invalid verify token' });
    }

    // POST — incoming message from Meta
    if (req.method === 'POST') {
        // Respond 200 immediately — Meta retries if it doesn't get one quickly
        res.status(200).json({ status: 'ok' });

        try {
            const body = req.body;
            const msg  = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
            if (!msg || msg.type !== 'text') return;

            const from = msg.from;               // E.164 number without +
            const text = msg.text?.body?.trim();
            if (!text) return;

            const vendor = await getVendorByPhone(from);

            if (!vendor) {
                await waReply(from,
                    `👋 Hello! This is the *myvendor* assistant.\n\nNo store is linked to this number (${from}).\n\n` +
                    `If you're a vendor, go to Settings and confirm your WhatsApp number.\n\n` +
                    `Not a vendor yet? Sign up free:\nhttps://myvendor.qzz.io`
                );
                return;
            }

            const stats   = await getStats(vendor.id);
            const kwReply = keywordReply(stats, text);

            if (kwReply) {
                await waReply(from, kwReply);
                return;
            }

            const reply = await aiReply(vendor, text, stats);
            await waReply(from, reply || `Not sure about that 🤔 Type *help* to see what I can do.`);

        } catch (err) {
            console.error('[whatsapp bot] handler error:', err);
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
}
