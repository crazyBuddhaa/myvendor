export default async function handler(req, res) {
  // Grab the product ID from the URL
  const { id } = req.query;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // Fetch the product data. 
    // IMPORTANT: Make sure 'products' and 'id' match your Supabase table!
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    const data = await response.json();
    const productData = data[0];

    // If the product doesn't exist, send them back to the home page
    if (!productData) {
      return res.redirect(302, '/');
    }

    // Format the price nicely (assuming it's in Naira)
    const formattedPrice = new Intl.NumberFormat('en-NG', { 
      style: 'currency', 
      currency: 'NGN',
      maximumFractionDigits: 0 
    }).format(productData.price || 0);

    // Build the "Bot Trap" HTML for the specific product
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${productData.name} — ${formattedPrice}</title>
        
        <meta property="og:type" content="product">
        <meta property="og:title" content="${productData.name} — ${formattedPrice}">
        <meta property="og:description" content="${productData.description || 'Tap to view details and order via WhatsApp.'}">
        <meta property="og:image" content="${productData.image_url || 'https://myvendor.qzz.io/assets/default-product.jpg'}">
        
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${productData.name} — ${formattedPrice}">
        <meta name="twitter:description" content="${productData.description || 'Tap to view details and order via WhatsApp.'}">
        <meta name="twitter:image" content="${productData.image_url || 'https://myvendor.qzz.io/assets/default-product.jpg'}">

        <script>
          // Send real users to your actual product HTML file
          window.location.replace('/product/index.html?id=${id}');
        </script>
      </head>
      <body>
        Loading product...
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    res.redirect(302, '/');
  }
}