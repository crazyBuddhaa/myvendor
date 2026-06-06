// POST /api/cache-bust
// Body: { slug?: string, oldSlug?: string, productIds?: string[] }
//
// Called from the browser to immediately evict entries from the in-memory cache
// after a vendor updates their profile or edits/deletes a product.
//
// Auth: valid Supabase JWT in Authorization header.

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

    const { slug, oldSlug, productIds } = req.body || {};

    // Bust store cache entries
    if (slug)                        cacheDel(`store:${slug}`);
    if (oldSlug && oldSlug !== slug) cacheDel(`store:${oldSlug}`);

    // Bust product cache entries
    if (Array.isArray(productIds)) {
        for (const id of productIds) {
            if (id) cacheDel(`product:${id}`);
        }
    }

    return res.status(200).json({ success: true });
}
