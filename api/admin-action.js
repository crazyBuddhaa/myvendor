import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { action, vendorId, amount } = req.body;

    try {
        if (action === 'add_slots') {
            // Get current slots
            const { data: vendor } = await supabase.from('vendor_profiles').select('bonus_slots').eq('id', vendorId).single();
            const newSlots = (vendor.bonus_slots || 0) + (amount || 3);

            // Update DB
            const { error } = await supabase.from('vendor_profiles').update({ bonus_slots: newSlots }).eq('id', vendorId);
            if (error) throw error;

            return res.status(200).json({ success: true, newSlots });
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}