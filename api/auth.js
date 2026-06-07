// ─── UNIFIED AUTH HANDLER ─────────────────────────────────────────────────────
// Routes by ?action= (POST) or presence of ?token (GET verify)
//
//  GET  /api/auth?action=verify&token=<tok>  → email verification redirect
//  POST /api/auth?action=google-onboard      → create vendor profile after Google OAuth
//  POST /api/auth?action=signup              → email/password sign-up + send verify email
//  POST /api/auth?action=resend              → resend verification email
//  POST /api/auth?action=cache-bust          → bust store/product cache entries

import { createClient } from '@supabase/supabase-js';
import { Resend }       from 'resend';
import crypto           from 'crypto';
import { cacheDel }     from './_cache.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const action = req.query.action;

    // ── GET: verify email token ────────────────────────────────────────────────
    if (req.method === 'GET' && (action === 'verify' || req.query.token)) {
        const { token } = req.query;
        if (!token) return res.redirect(302, '/dashboard/index.html?verified=invalid');

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: record, error: lookupError } = await supabase
            .from('pending_verifications')
            .select('user_id, email, expires_at')
            .eq('token', token)
            .maybeSingle();

        if (lookupError || !record) return res.redirect(302, '/dashboard/index.html?verified=invalid');

        if (new Date(record.expires_at) < new Date()) {
            await supabase.from('pending_verifications').delete().eq('token', token);
            return res.redirect(302, '/dashboard/index.html?expired=1');
        }

        const { error: confirmError } = await supabase.auth.admin.updateUserById(
            record.user_id,
            { email_confirm: true }
        );

        if (confirmError) {
            console.error('confirm error:', confirmError.message);
            return res.redirect(302, '/dashboard/index.html?verified=error');
        }

        await supabase.from('pending_verifications').delete().eq('token', token);
        return res.redirect(302, '/dashboard/index.html?verified=1');
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── POST: google-onboard ───────────────────────────────────────────────────
    if (action === 'google-onboard') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '').trim();
        if (!token) return res.status(401).json({ error: 'Missing token' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

        const { slug, business, wa } = req.body;
        if (!slug || !business || !wa) return res.status(400).json({ error: 'missing_fields' });
        if (!/^[a-z0-9-]{2,30}$/.test(slug))   return res.status(400).json({ error: 'invalid_slug' });
        if (!/^\d{10,15}$/.test(wa))            return res.status(400).json({ error: 'invalid_wa' });

        const { data: existing } = await supabase.from('vendor_profiles').select('slug').eq('slug', slug).maybeSingle();
        if (existing) return res.status(409).json({ error: 'store_name_taken' });

        const { data: existingProfile } = await supabase.from('vendor_profiles').select('id').eq('id', user.id).maybeSingle();
        if (existingProfile) return res.status(409).json({ error: 'profile_exists' });

        const fullName = user.user_metadata?.full_name || user.email.split('@')[0];

        const { error: profileError } = await supabase.from('profiles').upsert({ id: user.id, full_name: fullName }, { onConflict: 'id' });
        if (profileError) return res.status(500).json({ error: profileError.message });

        const { error: insertError } = await supabase.from('vendor_profiles').insert({
            id: user.id,
            slug,
            business_name:   business,
            whatsapp_number: wa,
            wa_number:       wa,
            full_name:       fullName,
        });

        if (insertError) return res.status(500).json({ error: insertError.message });
        return res.status(200).json({ success: true });
    }

    // ── POST: signup ───────────────────────────────────────────────────────────
    if (action === 'signup') {
        const { email, password, name, business, wa, slug, referrerId } = req.body;
        if (!email || !password || !name || !business || !wa || !slug) return res.status(400).json({ error: 'missing_fields' });
        if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return res.status(400).json({ error: 'invalid_slug' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: existing } = await supabase.from('vendor_profiles').select('slug').eq('slug', slug).maybeSingle();
        if (existing) return res.status(409).json({ error: 'store_name_taken' });

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email, password, email_confirm: false,
            user_metadata: { full_name: name, slug, business_name: business, whatsapp_number: wa, referrer_id: referrerId || null },
        });

        if (authError) {
            const msg = authError.message || '';
            if (msg.includes('already been registered') || msg.includes('already exists')) return res.status(409).json({ error: 'email_taken' });
            return res.status(500).json({ error: msg });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const { error: dbError } = await supabase.from('pending_verifications').insert({ token, user_id: authData.user.id, email });
        if (dbError) { await supabase.auth.admin.deleteUser(authData.user.id); return res.status(500).json({ error: 'token_store_failed' }); }

        const resend     = new Resend(process.env.RESEND_API_KEY);
        const verifyUrl  = `https://myvendor.qzz.io/verify?token=${token}`;
        const firstName  = name.split(' ')[0];

        const { error: emailError } = await resend.emails.send({
            from: 'myvendor <hello@myvendor.qzz.io>',
            to: email,
            subject: 'Verify your email — myvendor',
            html: buildSignupEmail(firstName, verifyUrl),
        });

        if (emailError) return res.status(500).json({ error: 'email_send_failed' });
        return res.status(200).json({ success: true });
    }

    // ── POST: resend verification email ────────────────────────────────────────
    if (action === 'resend') {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: existing } = await supabase.from('pending_verifications').select('user_id').eq('email', email).maybeSingle();
        if (!existing) return res.status(200).json({ success: true }); // prevent email enumeration

        const token = crypto.randomBytes(32).toString('hex');
        await supabase.from('pending_verifications').delete().eq('email', email);
        const { error: insertError } = await supabase.from('pending_verifications').insert({ token, user_id: existing.user_id, email });
        if (insertError) return res.status(500).json({ error: 'token_store_failed' });

        const resend    = new Resend(process.env.RESEND_API_KEY);
        const verifyUrl = `https://myvendor.qzz.io/verify?token=${token}`;

        const { error: emailError } = await resend.emails.send({
            from: 'myvendor <hello@myvendor.qzz.io>',
            to: email,
            subject: 'Your new verification link — myvendor',
            html: buildResendEmail(verifyUrl),
        });

        if (emailError) return res.status(500).json({ error: 'email_send_failed' });
        return res.status(200).json({ success: true });
    }

    // ── POST: cache-bust ───────────────────────────────────────────────────────
    if (action === 'cache-bust') {
        const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { slug, oldSlug, productIds } = req.body || {};
        if (slug)                        cacheDel(`store:${slug}`);
        if (oldSlug && oldSlug !== slug) cacheDel(`store:${oldSlug}`);
        if (Array.isArray(productIds)) for (const id of productIds) if (id) cacheDel(`product:${id}`);

        return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
}

// ── Email templates ────────────────────────────────────────────────────────────

function emailBase(body) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f0f7ec;margin:0;padding:0}.wrapper{padding:40px 20px}.container{max-width:500px;margin:0 auto;background:#fff;border-radius:16px;padding:40px 30px;text-align:center;border:1px solid #e9eee5}.logo{font-size:26px;font-weight:800;color:#0a4a2a;text-decoration:none;display:inline-block;margin-bottom:24px}.logo span{color:#22c55e}h1{color:#1a2e1f;font-size:22px;margin:0 0 12px;font-weight:700}p{color:#4a6741;font-size:15px;line-height:1.6;margin:0 0 24px}.btn{display:inline-block;background:#0f6e3f;color:#fff!important;padding:14px 32px;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px}.note{font-size:13px;color:#88a382;margin-top:20px}.footer{margin-top:32px;font-size:12px;color:#88a382;text-align:center;line-height:1.5}</style></head>
    <body><div class="wrapper"><div class="container"><a href="https://myvendor.qzz.io" class="logo">my<span>vendor</span></a>${body}</div><div class="footer">&copy; 2026 theosnnetwork. All rights reserved.</div></div></body></html>`;
}

function buildSignupEmail(firstName, verifyUrl) {
    return emailBase(`<h1>Welcome, ${firstName}!</h1><p>Your store is one step away from going live. Click the button below to verify your email address and activate your dashboard.</p><a href="${verifyUrl}" class="btn">Verify Email Address</a><p class="note">This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>`);
}

function buildResendEmail(verifyUrl) {
    return emailBase(`<h1>Here's your new link</h1><p>You requested a fresh verification link. Click the button below to activate your myvendor account.</p><a href="${verifyUrl}" class="btn">Verify Email Address</a><p class="note">This link expires in 24 hours. If you didn't request this, you can safely ignore it.</p>`);
}
