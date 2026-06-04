// POST /api/webhooks/paystack
// Receives and processes Paystack webhook events.
// bodyParser is disabled so we can verify the raw HMAC-SHA512 signature.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── 1. Verify HMAC-SHA512 signature ───────────────────────────────────────
  const rawBody  = await readRawBody(req);
  const signature = req.headers['x-paystack-signature'];
  const expected  = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  if (!signature || signature !== expected) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── 2. Resolve vendor ID ───────────────────────────────────────────────────
  // Primary:  metadata.vendor_id  (set at transaction init time)
  // Fallback: look up by paystack_customer_code stored in vendor_profiles
  async function resolveVendorId(data) {
    const vendorId    = data.metadata?.vendor_id;
    const customerCode = data.customer?.customer_code;

    if (vendorId) return vendorId;

    if (customerCode) {
      const { data: row } = await supabase
        .from('vendor_profiles')
        .select('id')
        .eq('paystack_customer_code', customerCode)
        .maybeSingle();
      return row?.id ?? null;
    }
    return null;
  }

  // ── 3. Handle events ───────────────────────────────────────────────────────
  if (event.event === 'charge.success') {
    const d = event.data;
    const vendorId = await resolveVendorId(d);

    if (vendorId) {
      // Upgrade tier and store customer code for future lookups
      await supabase.from('vendor_profiles').update({
        tier:                    'premium',
        premium_since:           new Date().toISOString(),
        paystack_customer_code:  d.customer?.customer_code ?? null,
      }).eq('id', vendorId);

      // Log payment (ignore errors — table may not exist in all envs yet)
      await supabase.from('payments').insert({
        vendor_id:      vendorId,
        reference:      d.reference,
        amount:         d.amount,
        status:         'success',
        paystack_event: event.event,
      });
    }
  }

  if (event.event === 'subscription.disable') {
    const d = event.data;
    const vendorId = await resolveVendorId(d);

    if (vendorId) {
      await supabase.from('vendor_profiles').update({
        tier: 'free',
      }).eq('id', vendorId);
    }
  }

  // Always respond 200 so Paystack stops retrying
  return res.status(200).json({ received: true });
}
