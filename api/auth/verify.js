import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.redirect(302, '/dashboard/index.html?verified=invalid');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: record, error: lookupError } = await supabase
    .from('pending_verifications')
    .select('user_id, email, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (lookupError || !record) {
    return res.redirect(302, '/dashboard/index.html?verified=invalid');
  }

  // Expired — redirect to login with banner so they can request a fresh link
  if (new Date(record.expires_at) < new Date()) {
    await supabase.from('pending_verifications').delete().eq('token', token);
    return res.redirect(302, '/dashboard/index.html?expired=1');
  }

  // Confirm the user — this sets email_confirmed_at, which fires the
  // referral reward DB trigger (handle_referral_on_confirm)
  const { error: confirmError } = await supabase.auth.admin.updateUserById(
    record.user_id,
    { email_confirm: true }
  );

  if (confirmError) {
    console.error('confirm error:', confirmError.message);
    return res.redirect(302, '/dashboard/index.html?verified=error');
  }

  // Consume the token
  await supabase.from('pending_verifications').delete().eq('token', token);

  return res.redirect(302, '/dashboard/index.html?verified=1');
}
