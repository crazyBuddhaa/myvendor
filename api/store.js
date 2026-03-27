export default async function handler(req, res) {
  // Grab the vendor name from your vercel.json rewrite
  const { vendor } = req.query;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // Fetch the store data. (Make sure 'stores' and 'store_name' match your database!)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/stores?store_name=eq.${vendor}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    const data = await response.json();
    const storeData = data[0];

    // If the store doesn't exist, send them to a 404 or home page
    if (!storeData) {
      return res.redirect(302, '/');
    }

    // Build the "Bot Trap" HTML for WhatsApp/Twitter previews
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${storeData.display_name} — myvendor</title>
        
        <meta property="og:type" content="website">
        <meta property="og:title" content="${storeData.display_name} — myvendor">
        <meta property="og:description" content="${storeData.bio || 'Order directly via WhatsApp.'}">
        <meta property="og:image" content="${storeData.logo_url || 'https://myvendor.qzz.io/assets/default-banner.jpg'}">
        
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${storeData.display_name} — myvendor">
        <meta name="twitter:description" content="${storeData.bio || 'Order directly via WhatsApp.'}">
        <meta name="twitter:image" content="${storeData.logo_url || 'https://myvendor.qzz.io/assets/default-banner.jpg'}">

        <script>
          // Send real users to your actual storefront HTML file just like your old vercel.json did!
          window.location.replace('/storefront/index.html?vendor=${vendor}');
        </script>
      </head>
      <body>
        Loading store...
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    res.redirect(302, '/');
  }
}