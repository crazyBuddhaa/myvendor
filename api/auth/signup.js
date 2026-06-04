import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, name, business, wa, slug, referrerId } = req.body;

  if (!email || !password || !name || !business || !wa || !slug) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  // Slug must contain only lowercase letters, numbers, and hyphens (no spaces
  // or special characters), and must be between 3 and 40 characters long.
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'store_name_taken' });

  // Create user (unconfirmed — Supabase will NOT send its own email)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: name,
      slug,
      business_name: business,
      whatsapp_number: wa,
      referrer_id: referrerId || null,
    },
  });

  if (authError) {
    const msg = authError.message || '';
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return res.status(409).json({ error: 'email_taken' });
    }
    return res.status(500).json({ error: msg });
  }

  // Generate a secure random token and store it
  const token = crypto.randomBytes(32).toString('hex');
  const { error: dbError } = await supabase
    .from('pending_verifications')
    .insert({ token, user_id: authData.user.id, email });

  if (dbError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: 'token_store_failed' });
  }

  // Send email via Resend — link goes only to our domain, no Supabase URL exposed
  const resend = new Resend(process.env.RESEND_API_KEY);
  const verifyUrl = `https://myvendor.qzz.io/verify?token=${token}`;
  const firstName = name.split(' ')[0];

  const { error: emailError } = await resend.emails.send({
    from: 'myvendor <hello@myvendor.qzz.io>',
    to: email,
    subject: 'Verify your email — myvendor',
    html: buildEmailHtml(firstName, verifyUrl),
  });

  if (emailError) {
    console.error('signup email send failed:', emailError.message);
    return res.status(500).json({ error: 'email_send_failed' });
  }

  return res.status(200).json({ success: true });
}

function buildEmailHtml(firstName, verifyUrl) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your email</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0f7ec; margin: 0; padding: 0; }
      .wrapper { padding: 40px 20px; }
      .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px 30px; text-align: center; border: 1px solid #e9eee5; }
      .logo { font-size: 26px; font-weight: 800; color: #0a4a2a; text-decoration: none; display: inline-block; margin-bottom: 24px; letter-spacing: -0.5px; }
      .logo span { color: #22c55e; }
      h1 { color: #1a2e1f; font-size: 22px; margin: 0 0 12px; font-weight: 700; }
      p { color: #4a6741; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
      .btn { display: inline-block; background: #0f6e3f; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px; }
      .note { font-size: 13px; color: #88a382; margin-top: 20px; }
      .footer { margin-top: 32px; font-size: 12px; color: #88a382; text-align: center; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <a href="https://myvendor.qzz.io" class="logo">my<span>vendor</span></a>
        <h1>Welcome, ${firstName}!</h1>
        <p>Your store is one step away from going live. Click the button below to verify your email address and activate your dashboard.</p>
        <a href="${verifyUrl}" class="btn">Verify Email Address</a>
        <p class="note">This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>
      </div>
      <div class="footer">
        &copy; 2026 theosnnetwork. All rights reserved.
      </div>
    </div>
  </body>
</html>`;
}
