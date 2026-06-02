import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Look up an existing pending verification for this email
  const { data: existing } = await supabase
    .from('pending_verifications')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();

  // Always return success to prevent email enumeration — don't reveal
  // whether an account exists if the lookup finds nothing
  if (!existing) {
    return res.status(200).json({ success: true });
  }

  // Replace old token with a fresh one (reset the 24h expiry)
  const token = crypto.randomBytes(32).toString('hex');

  await supabase.from('pending_verifications').delete().eq('email', email);

  const { error: insertError } = await supabase
    .from('pending_verifications')
    .insert({ token, user_id: existing.user_id, email });

  if (insertError) {
    return res.status(500).json({ error: 'token_store_failed' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const verifyUrl = `https://myvendor.qzz.io/verify?token=${token}`;

  const { error: emailError } = await resend.emails.send({
    from: 'myvendor <hello@myvendor.qzz.io>',
    to: email,
    subject: 'Your new verification link — myvendor',
    html: buildResendHtml(verifyUrl),
  });

  if (emailError) {
    console.error('resend email send failed:', emailError.message);
    return res.status(500).json({ error: 'email_send_failed' });
  }

  return res.status(200).json({ success: true });
}

function buildResendHtml(verifyUrl) {
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
      .logo { font-size: 26px; font-weight: 800; color: #0a4a2a; text-decoration: none; display: inline-block; margin-bottom: 24px; }
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
        <h1>Here's your new link</h1>
        <p>You requested a fresh verification link. Click the button below to activate your myvendor account.</p>
        <a href="${verifyUrl}" class="btn">Verify Email Address</a>
        <p class="note">This link expires in 24 hours. If you didn't request this, you can safely ignore it.</p>
      </div>
      <div class="footer">
        &copy; 2026 theosnnetwork. All rights reserved.
      </div>
    </div>
  </body>
</html>`;
}
