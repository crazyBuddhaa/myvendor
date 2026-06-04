import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-admin-password, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const provided = req.headers['x-admin-password'];
  if (!provided || provided !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing vendor id' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (req.method === 'PUT') {
    const { business_name, slug, whatsapp_number, tier } = req.body || {};
    const patch = {};
    if (business_name   != null) patch.business_name   = business_name;
    if (slug            != null) patch.slug             = slug;
    if (whatsapp_number != null) patch.whatsapp_number  = whatsapp_number;
    if (tier            != null) patch.tier             = tier;

    const { error } = await supabase.from('vendor_profiles').update(patch).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    const { data: rows } = await supabase.from('vendor_profiles').select('*').eq('id', id).limit(1);
    const v = rows?.[0];
    if (!v) return res.status(404).json({ error: 'Vendor not found' });

    return res.status(200).json({
      id: v.id, business_name: v.business_name, slug: v.slug,
      whatsapp_number: v.whatsapp_number ?? null, logo_url: v.logo_url ?? null,
      bio: v.bio ?? null, tier: v.tier || 'free', created_at: v.created_at,
      total_orders: 0, total_products: 0, total_revenue: 0, page_views: 0, wa_clicks: 0,
    });
  }

  if (req.method === 'DELETE') {
    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      const { error } = await supabase.from('vendor_profiles').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ success: true, message: 'Vendor permanently deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}