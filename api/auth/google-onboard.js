import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Verify the JWT and get the user
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { slug, business, wa } = req.body;

  if (!slug || !business || !wa) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug' });
  }

  if (!/^\d{10,15}$/.test(wa)) {
    return res.status(400).json({ error: 'invalid_wa' });
  }

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'store_name_taken' });

  // Check if vendor_profiles row already exists (idempotency guard)
  const { data: existingProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfile) return res.status(409).json({ error: 'profile_exists' });

  const fullName = user.user_metadata?.full_name || user.email.split('@')[0];

  // Step 1: ensure profiles row exists (vendor_profiles FK chain: auth.users → profiles → vendor_profiles)
  // The trigger should have created this on sign-in, but upsert is safe either way.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName }, { onConflict: 'id' });

  if (profileError) {
    console.error('google-onboard profiles upsert error:', profileError.message);
    return res.status(500).json({ error: profileError.message });
  }

  // Step 2: insert the vendor_profiles row
  const { error: insertError } = await supabase
    .from('vendor_profiles')
    .insert({
      id: user.id,
      slug,
      business_name: business,
      whatsapp_number: wa,   // NOT NULL column
      wa_number: wa,          // nullable duplicate — keep in sync
      full_name: fullName,
    });

  if (insertError) {
    console.error('google-onboard vendor_profiles insert error:', insertError.message);
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({ success: true });
}
