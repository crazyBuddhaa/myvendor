export default async function handler(req, res) {
  // Grab the vendor slug from your vercel.json rewrite
  const { vendor } = req.query;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // 🌟 FIXED: Query the 'vendor_profiles' table using the 'slug' column
    const response = await fetch(`${SUPABASE_URL}/rest/v1/vendor_profiles?slug=eq.${vendor}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const data = await response.json();
    const storeData = data[0];

    // If the store doesn't exist, send them to the landing page
    if (!storeData) {
      return res.redirect(302, '/');
    }

    // 🌟 FIXED: Use 'business_name' instead of 'display_name'
    const storeName = storeData.business_name || 'myvendor Store';
    const storeBio = storeData.bio || 'Shop our latest collection and order directly via WhatsApp.';
    const storeImage = 'https://myvendor.qzz.io/assets/img/logo.png'; // Fallback to your app logo

    // Build the "Bot Trap" HTML for WhatsApp/Twitter previews
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${storeName} — myvendor</title>
        
        <meta property="og:type" content="website">
        <meta property="og:title" content="${storeName}">
        <meta property="og:description" content="${storeBio}">
        <meta property="og:image" content="${storeImage}">
        
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${storeName}">
        <meta name="twitter:description" content="${storeBio}">
        <meta name="twitter:image" content="${storeImage}">

        <script>
          // Send real users to your actual storefront HTML file
          // Note: Ensure your storefront HTML file is actually located at /storefront/index.html!
          // If it's just 'storefront.html' in your root, change this to: '/storefront/index.html?vendor=${vendor}'
          window.location.replace('/storefront.html?vendor=${vendor}');
        </script>
      </head>
      <body>
        Redirecting to store...
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    console.error("API Error:", error);
    res.redirect(302, '/');
  }
}