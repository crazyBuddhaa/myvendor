import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. Check for the admin password in the request headers
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized. Nice try, hacker!' });
    }

    // 2. Initialize Supabase using the hidden SERVICE_ROLE key
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY // ⚠️ Master Key! Bypasses RLS.
    );

    try {
        // 3. Fetch global platform stats
        const { count: vendorCount } = await supabase.from('vendor_profiles').select('*', { count: 'exact', head: true });
        const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });

        // 4. Send the data safely back to the frontend
        return res.status(200).json({
            vendors: vendorCount || 0,
            orders: orderCount || 0,
            products: productCount || 0
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}