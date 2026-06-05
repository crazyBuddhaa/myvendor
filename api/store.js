import { escapeHtml, sanitizeSlug } from './_utils.js';
import { cacheGet, cacheSet, cacheIsActive, setCacheHeaders } from './_cache.js';

export default async function handler(req, res) {
    const { vendor } = req.query;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    const safeSlug = sanitizeSlug(vendor);
    if (!safeSlug) {
        return res.redirect(302, '/');
    }

    const CACHE_KEY = `store:${safeSlug}`;
    const active    = await cacheIsActive(SUPABASE_URL, SUPABASE_KEY);

    // ── Cache HIT ──────────────────────────────────────────────────────────────
    if (active) {
        const cached = cacheGet(CACHE_KEY);
        if (cached) {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('X-Cache', 'HIT');
            setCacheHeaders(res);
            return res.status(200).send(cached);
        }
    }

    // ── Cache MISS / inactive: fetch from Supabase ────────────────────────────
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/vendor_profiles?slug=eq.${encodeURIComponent(safeSlug)}&select=*`,
            {
                headers: {
                    apikey:        SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                },
            }
        );

        const data      = await response.json();
        const storeData = data[0];

        if (!storeData) {
            return res.redirect(302, '/');
        }

        const storeName  = escapeHtml(storeData.business_name || 'myvendor Store');
        const storeBio   = escapeHtml(storeData.bio || 'Shop our latest collection and order directly via WhatsApp.');
        const storeImage = escapeHtml(storeData.logo_url || 'https://myvendor.ng/assets/img/logo.png');

        // "Bot trap": crawlers (WhatsApp, Twitter, Google) get OG meta tags here.
        // Real users are JS-redirected to the actual storefront page immediately.
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${storeName} — myvendor</title>
  <meta name="description" content="${storeBio}">

  <meta property="og:type"        content="website">
  <meta property="og:title"       content="${storeName}">
  <meta property="og:description" content="${storeBio}">
  <meta property="og:image"       content="${storeImage}">
  <meta property="og:url"         content="https://myvendor.ng/${safeSlug}">

  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${storeName}">
  <meta name="twitter:description" content="${storeBio}">
  <meta name="twitter:image"       content="${storeImage}">

  <script>window.location.replace('/storefront/index.html?vendor=${safeSlug}');</script>
</head>
<body>Redirecting to store...</body>
</html>`;

        if (active) {
            cacheSet(CACHE_KEY, html);
            setCacheHeaders(res);
        }

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('X-Cache', 'MISS');
        res.status(200).send(html);
    } catch (error) {
        console.error('store API error:', error);
        res.redirect(302, '/');
    }
}
