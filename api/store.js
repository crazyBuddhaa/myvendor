export default async function handler(req, res) {
  // Grab the store name from the URL
  const { name } = req.query;

  // 1. Fetch the store data directly from Supabase via REST API
  // Vercel securely injects your environment variables here
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/stores?store_name=eq.${name}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    const data = await response.json();
    const storeData = data[0];

    // If someone types a wrong store name, just send them to the homepage
    if (!storeData) {
      return res.redirect(302, '/');
    }

    // 2. Build the "Bot Trap" HTML
    // WhatsApp reads the meta tags, Humans run the <script> and get redirected!
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${storeData.display_name} — myvendor</title>
        
        <meta property="og:type" content="website">
        <meta property="og:title" content="${storeData.display_name} — myvendor">
        <meta property="og:description" content="${storeData.bio || 'Order directly via WhatsApp.'}">
        <meta property="og:image" content="${storeData.logo_url || 'https://myvendor.qzz.io/default-banner.jpg'}">
        
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${storeData.display_name} — myvendor">
        <meta name="twitter:description" content="${storeData.bio || 'Order directly via WhatsApp.'}">
        <meta name="twitter:image" content="${storeData.logo_url || 'https://myvendor.qzz.io/default-banner.jpg'}">

        <script>
          window.location.replace('/storefront.html?store=${name}');
        </script>
      </head>
      <body>
        Loading store...
      </body>
      </html>
    `;

    // Send the HTML response
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    // Fallback if the database fails
    res.redirect(302, '/');
  }
      }
