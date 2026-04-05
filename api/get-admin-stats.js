import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    try {
        const { data: vendors } = await supabase.from('vendor_profiles').select('*').order('created_at', { ascending: false });
        const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
        
        // Fetch ALL orders to calculate global revenue
        const { data: orders } = await supabase.from('orders').select('total_amount, status');

        let totalRevenue = 0;
        let pendingCount = 0;

        if (orders) {
            orders.forEach(o => {
                if (o.status === 'delivered') {
                    totalRevenue += parseFloat(o.total_amount || 0);
                } else if (o.status === 'new' || o.status === 'processing') {
                    pendingCount++;
                }
            });
        }

        return res.status(200).json({
            vendorList: vendors || [],
            vendorCount: vendors ? vendors.length : 0,
            products: productCount || 0,
            orders: orders ? orders.length : 0,
            revenue: totalRevenue,
            pending: pendingCount
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}