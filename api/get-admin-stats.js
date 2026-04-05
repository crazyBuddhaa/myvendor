import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized. Nice try, hacker!' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY // ⚠️ Master Key
    );

    try {
        // 1. Fetch raw counts for orders and products
        const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });

        // 2. Fetch the actual list of all vendors (newest first)
        const { data: vendors, error: vendorErr } = await supabase
            .from('vendor_profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (vendorErr) throw vendorErr;

        // 3. Send it all back
        return res.status(200).json({
            vendorCount: vendors ? vendors.length : 0,
            orders: orderCount || 0,
            products: productCount || 0,
            vendorList: vendors || []
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}