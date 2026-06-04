// api/whatsapp.js
// myvendor WhatsApp Bot Assistant
// Handles Meta WhatsApp Cloud API webhooks
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (preferred) or SUPABASE_ANON_KEY
//   WA_APP_SECRET              — Meta App Secret, used to verify webhook signatures
//   WA_VERIFY_TOKEN            — any secret string you choose, entered in Meta webhook config
//   WA_ACCESS_TOKEN            — Meta permanent access token
//   WA_PHONE_NUMBER_ID         — from Meta Developer Console → WhatsApp → API Setup
//   ANTHROPIC_API_KEY          — optional; enables natural-language AI replies

import crypto from 'crypto';

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const WA_VERIFY_TOKEN    = process.env.WA_VERIFY_TOKEN   || 'myvendor-verify';
const WA_ACCESS_TOKEN    = process.env.WA_ACCESS_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const WA_APP_SECRET      = process.env.WA_APP_SECRET;

// ── Persistent dedup via Supabase (survives serverless cold-starts) ───────────
// Falls back to a capped in-memory Set when the DB insert fails.
const _memDedup = new Set();

// ── Fix #1: Verify Meta's X-Hub-Signature-256 ────────────────────────────────
function verifySignature(req, rawBody) {
    if (!WA_APP_SECRET) return true; // skip when not configured (dev)
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return false;
    const expected =
        'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET).update(rawBody).digest('hex');
    // constant-time compare to prevent timing attacks
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

// ── Fix #7: Normalise phone to E.164 digits, handle local 080-format ─────────
function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    // Nigerian local format: starts with 0, 11 digits → prefix with 234
    if (digits.startsWith('0') && digits.length === 11) {
        return '234' + digits.slice(1);
    }
    return digits;
}

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function db(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            apikey:        SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    if (r.status === 204) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
}

// ── Fix #2: Nigeria-aware day/month boundaries (WAT = UTC+1) ─────────────────
function getNigeriaBounds() {
    const lagosDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Lagos',
        year:     'numeric',
        month:    '2-digit',
        day:      '2-digit',
    }).format(new Date()); // → "2024-01-15"

    const [year, month] = lagosDate.split('-').map(Number);
    const todayStart = new Date(`${lagosDate}T00:00:00+01:00`);
    const monthStart = new Date(
        `${year}-${String(month).padStart(2, '0')}-01T00:00:00+01:00`
    );
    return {
        todayStr: todayStart.toISOString(),
        monthStr: monthStart.toISOString(),
    };
}

// ── Fix #4: Date-filtered DB queries — no full table scans ───────────────────
async function getStats(vendorId) {
    const { todayStr, monthStr } = getNigeriaBounds();

    const [allOrders, monthOrders, todayOrders, products] = await Promise.all([
        db(`orders?vendor_id=eq.${vendorId}&select=id,customer_name,status,total_amount,created_at&order=created_at.desc`),
        db(`orders?vendor_id=eq.${vendorId}&created_at=gte.${encodeURIComponent(monthStr)}&select=id,status,total_amount`),
        db(`orders?vendor_id=eq.${vendorId}&created_at=gte.${encodeURIComponent(todayStr)}&select=id,status,total_amount`),
        db(`products?vendor_id=eq.${vendorId}&select=id,in_stock,status`),
    ]);

    const pending      = allOrders.filter(o => ['new', 'processing', 'shipped'].includes(o.status));
    const monthRevenue = monthOrders
        .filter(o => o.status === 'delivered')
        .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const todayRevenue = todayOrders
        .filter(o => o.status === 'delivered')
        .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const outOfStock   = products.filter(p => p.in_stock === false || p.status === 'out_of_stock');

    return {
        totalOrders:     allOrders.length,
        todayOrders:     todayOrders.length,
        todayRevenue,
        pendingCount:    pending.length,
        monthRevenue,
        monthOrders:     monthOrders.length,
        totalProducts:   products.length,
        outOfStockCount: outOfStock.length,
        recentPending:   pending.slice(0, 5)
            .map(o => `  • ${o.customer_name} — ₦${parseFloat(o.total_amount).toLocaleString()} [${o.status}]`)
            .join('\n') || '  None right now 🎉',
    };
}

// ── Send WhatsApp text ────────────────────────────────────────────────────────
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

// ── Vendor lookup with Fix #7 dual-format fallback ───────────────────────────
async function getVendorByPhone(waNumber) {
    const norm = normalizePhone(waNumber);
    let rows = await db(`vendor_profiles?whatsapp_number=eq.${encodeURIComponent(norm)}&select=*`);
    if (rows.length === 0 && norm.startsWith('234')) {
        // Fallback: vendor may have saved their number in local 080... format
        const local = '0' + norm.slice(3);
        rows = await db(`vendor_profiles?whatsapp_number=eq.${encodeURIComponent(local)}&select=*`);
    }
    return rows[0] || null;
}

// ── Fix #6: Keyword matching — specific patterns checked before broad ones ────
function keywordReply(stats, msg) {
    const m = msg.toLowerCase().trim();

    if (/^(hi|hello|hey|start|menu)$/.test(m) || m.includes('what can')) {
        return (
            `👋 Hi! I'm your *myvendor* assistant.\n\n` +
            `Here's what I can do:\n\n` +
            `📦 *orders* — today's & pending orders\n` +
            `💰 *revenue* — this month's earnings\n` +
            `🛍️ *products* — inventory summary\n` +
            `📊 *stats* — full store overview\n\n` +
            `Or just ask me anything in plain English 🤖`
        );
    }

    // Fix #6: "revenue today" / "today revenue" — must be caught BEFORE
    // the generic "today" branch that would otherwise route to orders
    if (/\b(revenue|money|earn|income|profit|naira|cash)\b/.test(m) && /\btoday\b/.test(m)) {
        return (
            `💰 *Today's Revenue*\n\n` +
            `*₦${stats.todayRevenue.toLocaleString()}*` +
            ` from *${stats.todayOrders}* orders\n\n` +
            `This month: *₦${stats.monthRevenue.toLocaleString()}*`
        );
    }

    if (/\b(revenue|money|earn|income|profit|naira|cash)\b/.test(m)) {
        return (
            `💰 *Revenue this month*\n\n` +
            `*₦${stats.monthRevenue.toLocaleString()}*\n` +
            `from ${stats.monthOrders} orders\n\n` +
            `All-time orders: ${stats.totalOrders}`
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
            ? `\n\n⚠️ ${stats.outOfStockCount} out of stock. Update at:\nhttps://myvendor.ng/dashboard/products.html`
            : '\n\n✅ All products in stock!';
        return (
            `🛍️ *Inventory*\n\n` +
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
            `🛍️ Products: *${stats.totalProducts}*\n` +
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
            `Dashboard: https://myvendor.ng/dashboard`
        );
    }

    return null;
}

// ── Fix #3: Correct Claude model name ────────────────────────────────────────
async function aiReply(vendor, message, stats) {
    if (!ANTHROPIC_API_KEY) return null;
    try {
        const system =
            `You are a helpful WhatsApp assistant for "${vendor.business_name}" on myvendor.\n` +
            `Store data: orders_today=${stats.todayOrders}, pending=${stats.pendingCount}, ` +
            `month_revenue=₦${stats.monthRevenue.toLocaleString()}, month_orders=${stats.monthOrders}, ` +
            `products=${stats.totalProducts}, out_of_stock=${stats.outOfStockCount}.\n` +
            `Reply in max 2 sentences, WhatsApp style. Use ₦ for money. Only use the data above — never invent numbers.`;

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method:  'POST',
            headers: {
                'x-api-key':         ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type':      'application/json',
            },
            body: JSON.stringify({
                model:      'claude-3-5-haiku-20241022', // Fix #3: was 'claude-haiku-4-5' (non-existent)
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
        // Fix #1: verify Meta's X-Hub-Signature-256 before doing anything else.
        // Read the raw body before any JSON parsing so the HMAC is computed correctly.
        let rawBody;
        try {
            rawBody = await new Promise((resolve, reject) => {
                const chunks = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end',  () => resolve(Buffer.concat(chunks)));
                req.on('error', reject);
            });
        } catch {
            return res.status(400).json({ error: 'Could not read body' });
        }

        if (!verifySignature(req, rawBody)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Parse JSON manually after signature check
        let body;
        try {
            body = JSON.parse(rawBody.toString('utf8'));
        } catch {
            return res.status(400).json({ error: 'Invalid JSON' });
        }

        // Respond 200 immediately — Meta retries if it doesn't get one quickly
        res.status(200).json({ status: 'ok' });

        try {
            const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
            if (!msg || msg.type !== 'text') return;

            const msgId = String(msg.id);
            const from  = String(msg.from);
            const text  = String(msg.text?.body || '').trim();
            if (!text) return;

            // Deduplicate — Meta sometimes delivers the same message twice.
            // Primary: DB insert (unique PK prevents duplicates across cold starts).
            // Fallback: in-memory Set when the DB is unreachable.
            if (_memDedup.has(msgId)) return;
            try {
                const dedup = await fetch(
                    `${SUPABASE_URL}/rest/v1/processed_messages`,
                    {
                        method:  'POST',
                        headers: {
                            apikey:          SUPABASE_KEY,
                            Authorization:   `Bearer ${SUPABASE_KEY}`,
                            'Content-Type':  'application/json',
                            Prefer:          'return=minimal',
                        },
                        body: JSON.stringify({ message_id: msgId }),
                    }
                );
                // 409 Conflict = duplicate PK = message already processed
                if (dedup.status === 409) return;
                if (!dedup.ok && dedup.status !== 201) {
                    // DB unavailable — fall back to in-memory
                    _memDedup.add(msgId);
                    if (_memDedup.size > 1000) {
                        _memDedup.delete(_memDedup.values().next().value);
                    }
                }
            } catch {
                _memDedup.add(msgId);
                if (_memDedup.size > 1000) {
                    _memDedup.delete(_memDedup.values().next().value);
                }
            }

            const vendor = await getVendorByPhone(from);
            if (!vendor) {
                await waReply(
                    from,
                    `👋 Hello! This is the *myvendor* assistant.\n\n` +
                    `No store is linked to this number (${from}).\n\n` +
                    `If you're a vendor, go to Settings and confirm your WhatsApp number.\n\n` +
                    `Not a vendor yet? Sign up free:\nhttps://myvendor.ng`
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
            await waReply(from, reply || 'Not sure about that 🤔 Type *help* to see what I can do.');
        } catch (err) {
            console.error('[whatsapp bot] handler error:', err);
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
}
