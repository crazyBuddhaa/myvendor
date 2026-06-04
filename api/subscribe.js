// POST /api/subscribe
// Creates a Paystack transaction for the vendor's premium subscription.
// Returns { access_code, reference, public_key } for the frontend to open
// the Paystack inline popup.

import { createClient } from '@supabase/supabase-js';

const PLAN_AMOUNT_KOBO = 90000; // ₦900 × 100

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // ── 1. Authenticate vendor ────────────────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });

  const token = auth.slice(7);
  const supabaseAnon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'unauthorized' });

  // ── 2. Check current tier ─────────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('tier, business_name')
    .eq('id', user.id)
    .single();

  if (profile?.tier === 'premium') {
    return res.status(400).json({ error: 'already_premium' });
  }

  // ── 3. Initialize Paystack transaction ────────────────────────────────────
  const payload = {
    email: user.email,
    amount: PLAN_AMOUNT_KOBO,
    metadata: {
      vendor_id: user.id,
      business_name: profile?.business_name ?? '',
      cancel_action: req.headers.origin
        ? `${req.headers.origin}/dashboard/subscription.html`
        : undefined,
    },
    channels: ['card', 'bank', 'ussd', 'mobile_money', 'bank_transfer'],
  };

  // Attach recurring plan if configured
  if (process.env.PAYSTACK_PLAN_CODE) {
    payload.plan = process.env.PAYSTACK_PLAN_CODE;
  }

  let paystackData;
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    paystackData = await response.json();
  } catch {
    return res.status(502).json({ error: 'paystack_unreachable' });
  }

  if (!paystackData.status) {
    return res.status(502).json({ error: 'payment_init_failed', detail: paystackData.message });
  }

  return res.status(200).json({
    access_code:       paystackData.data.access_code,
    authorization_url: paystackData.data.authorization_url,
    reference:         paystackData.data.reference,
    public_key:        process.env.PAYSTACK_PUBLIC_KEY,
  });
}
