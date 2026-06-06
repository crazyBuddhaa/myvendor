// ─── UNIFIED OG / BOT-TRAP HANDLER ───────────────────────────────────────────
// Serves OG meta-tag pages for WhatsApp / Twitter / Google crawlers.
// Real users are JS-redirected to the SPA immediately.
//
//  GET /api/og?vendor=<slug>  → store OG page  (routed via vercel.json /:vendor)
//  GET /api/og?id=<productId> → product OG page (routed via vercel.json /product/:id)

import { escapeHtml, sanitizeSlug, sanitizeId } from './_utils.js';
import { cacheGet, cacheSet, cacheIsActive, setCacheHeaders } from './_cache.js';

export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    // ── Store page ─────────────────────────────────────────────────────────────
    if (req.query.vendor !== undefined) {
        const safeSlug = sanitizeSlug(req.query.vendor);
        if (!safeSlug) return res.redirect(302, '/');

        const CACHE_KEY = `store:${safeSlug}`;
        const active    = await cacheIsActive(SUPABASE_URL, SUPABASE_KEY);

        if (active) {
            const cached = cacheGet(CACHE_KEY);
            if (cached) {
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('X-Cache', 'HIT');
                setCacheHeaders(res);
                return res.status(200).send(cached);
            }
        }

        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/vendor_profiles?slug=eq.${encodeURIComponent(safeSlug)}&select=*`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            const data      = await response.json();
            const storeData = data[0];
            if (!storeData) return res.redirect(302, '/');

            const storeName  = escapeHtml(storeData.business_name || 'myvendor Store');
            const storeBio   = escapeHtml(storeData.bio || 'Shop our latest collection and order directly via WhatsApp.');
            const storeImage = escapeHtml(storeData.logo_url || 'https://myvendor.ng/assets/img/logo.png');

            const html = `<!DOCTYPE html>
<html lang="en"><head>
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
</head><body>Redirecting to store...</body></html>`;

            if (active) { cacheSet(CACHE_KEY, html); setCacheHeaders(res); }
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('X-Cache', 'MISS');
            return res.status(200).send(html);
        } catch (error) {
            console.error('og store error:', error);
            return res.redirect(302, '/');
        }
    }

    // ── Product page ───────────────────────────────────────────────────────────
    if (req.query.id !== undefined) {
        const safeId = sanitizeId(req.query.id);
        if (!safeId) return res.redirect(302, '/');

        const CACHE_KEY = `product:${safeId}`;
        const active    = await cacheIsActive(SUPABASE_URL, SUPABASE_KEY);

        if (active) {
            const cached = cacheGet(CACHE_KEY);
            if (cached) {
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('X-Cache', 'HIT');
                setCacheHeaders(res);
                return res.status(200).send(cached);
            }
        }

        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(safeId)}&select=*`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            const data        = await response.json();
            const productData = data[0];
            if (!productData) return res.redirect(302, '/');

            const productDesc  = escapeHtml(productData.description || 'Tap to view details and order via WhatsApp.');
            const productImage = escapeHtml(productData.image_url || 'https://myvendor.ng/assets/img/logo.png');

            const formattedPrice = new Intl.NumberFormat('en-NG', {
                style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
            }).format(productData.price || 0);

            const ogTitle = escapeHtml(`${productData.title || productData.name} — ${formattedPrice}`);

            const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <title>${ogTitle}</title>
  <meta name="description" content="${productDesc}">
  <meta property="og:type"        content="product">
  <meta property="og:title"       content="${ogTitle}">
  <meta property="og:description" content="${productDesc}">
  <meta property="og:image"       content="${productImage}">
  <meta property="og:url"         content="https://myvendor.ng/product/${safeId}">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${ogTitle}">
  <meta name="twitter:description" content="${productDesc}">
  <meta name="twitter:image"       content="${productImage}">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product",
   "name":${JSON.stringify(productData.title || productData.name || '')},
   "description":${JSON.stringify(productData.description || '')},
   "image":${JSON.stringify(productData.image_url || '')},
   "offers":{"@type":"Offer","priceCurrency":"NGN","price":${JSON.stringify(String(productData.price || 0))},
   "availability":"https://schema.org/InStock","url":"https://myvendor.ng/product/${safeId}"}}
  </script>
  <script>window.location.replace('/product/index.html?id=${safeId}');</script>
</head><body>Loading product...</body></html>`;

            if (active) { cacheSet(CACHE_KEY, html); setCacheHeaders(res); }
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('X-Cache', 'MISS');
            return res.status(200).send(html);
        } catch (error) {
            console.error('og product error:', error);
            return res.redirect(302, '/');
        }
    }

    return res.redirect(302, '/');
}
