import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (req.headers.authorization !== `Bearer ${process.env.ADMIN_PASSWORD}`) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { action, vendorId, payload } = req.body;

    try {
        if (action === 'update_tier') {
            const { error } = await supabase.from('vendor_profiles').update({ tier: payload.tier }).eq('id', vendorId);
            if (error) throw error;
            return res.status(200).json({ success: true, message: `Upgraded to ${payload.tier}` });
        }

        if (action === 'edit_store') {
            const { error } = await supabase.from('vendor_profiles').update({
                business_name:   payload.name,
                slug:            payload.slug,
                whatsapp_number: payload.phone,
            }).eq('id', vendorId);
            if (error) throw error;
            return res.status(200).json({ success: true, message: 'Store updated' });
        }

        if (action === 'delete_store') {
            // Because we use the master key, deleting them from auth.users 
            // completely wipes their login credentials from the platform.
            const { error } = await supabase.auth.admin.deleteUser(vendorId);
            if (error) throw error;
            
            // Note: If you set up cascading deletes in Supabase, their profile 
            // and products will auto-delete. If not, we explicitly delete the profile here.
            await supabase.from('vendor_profiles').delete().eq('id', vendorId);
            
            return res.status(200).json({ success: true, message: 'Store permanently deleted' });
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}