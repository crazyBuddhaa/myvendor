import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'myvendor-auth-token'
  }
});

// Helper function to check if a vendor is logged in.
// Waits for Supabase to restore / refresh the session from localStorage
// before deciding whether to redirect — prevents false logouts on page load.
export async function checkAuth() {
  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      subscription.unsubscribe();
      if (!session) {
        window.location.href = '/dashboard/index.html';
        resolve(null);
      } else {
        resolve(session.user);
      }
    });

    // Fallback: if onAuthStateChange never fires (e.g. no session at all),
    // getSession() will still return null and we redirect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        subscription.unsubscribe();
        window.location.href = '/dashboard/index.html';
        resolve(null);
      }
    });
  });
}
