import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to check if a vendor is logged in
export async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (!session || error) {
        window.location.href = '/dashboard/index.html';
        return null;
    }
    return session.user;
}
