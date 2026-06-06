// POST /api/cache-bust
// Body: { slug: string, oldSlug?: string }
//
// Called from the browser (settings save) to immediately evict store HTML from
// the in-memory cache after a vendor updates their profile.
//
// Auth: valid Supabase JWT in Authorization header — we verify the token to
// prevent anonymous cache poisoning / denial-of-cache attacks.

import { createClient } from '@supabase/supabase-js';
import { cacheDel }     from './_cache.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify the caller holds a valid Supabase session
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { slug, oldSlug } = req.body || {};

    if (slug)                        cacheDel(`store:${slug}`);
    if (oldSlug && oldSlug !== slug) cacheDel(`store:${oldSlug}`);

    return res.status(200).json({ success: true });
}
