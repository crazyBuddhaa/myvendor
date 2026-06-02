import { escapeHtml, sanitizeId } from './_utils.js';

export default async function handler(req, res) {
    const { id } = req.query;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    const safeId = sanitizeId(id);
    if (!safeId) {
        return res.redirect(302, '/');
    }

    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(safeId)}&select=*`,
            {
                headers: {
                    apikey:        SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                },
            }
        );

        const data        = await response.json();
        const productData = data[0];

        if (!productData) {
            return res.redirect(302, '/');
        }

        const productName  = escapeHtml(productData.title || productData.name || 'Product');
        const productDesc  = escapeHtml(productData.description || 'Tap to view details and order via WhatsApp.');
        const productImage = escapeHtml(productData.image_url || 'https://myvendor.ng/assets/img/logo.png');

        const formattedPrice = new Intl.NumberFormat('en-NG', {
            style:                'currency',
            currency:             'NGN',
            maximumFractionDigits: 0,
        }).format(productData.price || 0);

        const ogTitle = escapeHtml(`${productData.title || productData.name} — ${formattedPrice}`);

        // "Bot trap": crawlers get OG/JSON-LD here; real users are JS-redirected instantly.
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
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
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": ${JSON.stringify(productData.title || productData.name || '')},
    "description": ${JSON.stringify(productData.description || '')},
    "image": ${JSON.stringify(productData.image_url || '')},
    "offers": {
      "@type": "Offer",
      "priceCurrency": "NGN",
      "price": ${JSON.stringify(String(productData.price || 0))},
      "availability": "https://schema.org/InStock",
      "url": "https://myvendor.ng/product/${safeId}"
    }
  }
  </script>

  <script>window.location.replace('/product/index.html?id=${safeId}');</script>
</head>
<body>Loading product...</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    } catch (error) {
        console.error('product API error:', error);
        res.redirect(302, '/');
    }
}
