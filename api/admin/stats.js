import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-admin-password');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const provided = req.headers['x-admin-password'];
  if (!provided || provided !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const [{ data: vendors }, { data: orders }, { data: products }, { data: events }] =
      await Promise.all([
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
      const revenue = vOrders.filter(o => o.status === 'delivered')
        .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
      globalRevenue += revenue;
      return {
        id: vendor.id, business_name: vendor.business_name, slug: vendor.slug,
        whatsapp_number: vendor.whatsapp_number ?? null, logo_url: vendor.logo_url ?? null,
        bio: vendor.bio ?? null, tier: vendor.tier || 'free', created_at: vendor.created_at,
        total_orders: vOrders.length, total_products: vProducts.length,
        total_revenue: revenue,
        page_views: vEvents.filter(e => e.event_type === 'store_view').length,
        wa_clicks: vEvents.filter(e => e.event_type === 'whatsapp_click').length,
      };
    });

    return res.status(200).json({
      globalRevenue, globalTraffic,
      vendorCount: (vendors || []).length,
      activeOrders: (orders || []).filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length,
      vendors: enrichedVendors,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}