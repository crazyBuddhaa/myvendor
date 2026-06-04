// GET  /api/admin/stats          → global platform stats + enriched vendor list
// PUT  /api/admin/stats?id=<id>  → update a vendor's profile fields
// DELETE /api/admin/stats?id=<id>→ permanently delete a vendor + their auth user
//
// Auth: Authorization: Bearer <ADMIN_PASSWORD>

import { createClient } from '@supabase/supabase-js';

function auth(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── GET: platform-wide stats ───────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const [
        { data: vendors },
        { data: orders },
        { data: products },
        { data: events },
      ] = await Promise.all([
        supabase.from('vendor_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('vendor_id, total_amount, status'),
        supabase.from('products').select('vendor_id'),
        supabase.from('analytics_events').select('vendor_id, event_type'),
      ]);

      let globalRevenue = 0;
      const globalTraffic = events ? events.length : 0;

      const enrichedVendors = (vendors || []).map(vendor => {
        const vOrders   = (orders   || []).filter(o => o.vendor_id === vendor.id);
        const vProducts = (products || []).filter(p => p.vendor_id === vendor.id);
        const vEvents   = (events   || []).filter(e => e.vendor_id === vendor.id);
        const revenue   = vOrders
          .filter(o => o.status === 'delivered')
          .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
        globalRevenue += revenue;
        return {
          ...vendor,
          total_orders:   vOrders.length,
          total_products: vProducts.length,
          total_revenue:  revenue,
          page_views: vEvents.filter(e => e.event_type === 'store_view').length,
          wa_clicks:  vEvents.filter(e => e.event_type === 'whatsapp_click').length,
        };
      });

      return res.status(200).json({
        globalRevenue,
        globalTraffic,
        vendorCount:  (vendors || []).length,
        activeOrders: (orders  || []).filter(
          o => o.status !== 'delivered' && o.status !== 'cancelled'
        ).length,
        vendors: enrichedVendors,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PUT: update a vendor's profile ────────────────────────────────────────
  if (req.method === 'PUT') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing vendor id' });

    const { business_name, slug, whatsapp_number, tier } = req.body || {};
    const patch = {};
    if (business_name   != null) patch.business_name   = business_name;
    if (slug            != null) patch.slug             = slug;
    if (whatsapp_number != null) patch.whatsapp_number  = whatsapp_number;
    if (tier            != null) patch.tier             = tier;

    const { error } = await supabase.from('vendor_profiles').update(patch).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    const { data: rows } = await supabase
      .from('vendor_profiles').select('*').eq('id', id).limit(1);
    const v = rows?.[0];
    if (!v) return res.status(404).json({ error: 'Vendor not found' });

    return res.status(200).json({ success: true, vendor: v });
  }

  // ── DELETE: remove vendor + auth user ─────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing vendor id' });

    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      // Fallback: delete profile row directly if auth delete fails
      const { error } = await supabase.from('vendor_profiles').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ success: true, message: 'Vendor permanently deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
