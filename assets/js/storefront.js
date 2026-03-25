import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ IMPORTANT: Paste your actual Supabase URL and Anon Key here!
const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initStore() {
    // 1. Get vendor slug from URL
    const params = new URLSearchParams(window.location.search);
    let slug = params.get('vendor');

    // ✨ VERCEL REWRITE FIX ✨
    // If there is no ?vendor= in the URL, grab the store name straight from the path (e.g., /glamstore)
    if (!slug) {
        // This takes "/glamstore" and turns it into just "glamstore"
        const path = window.location.pathname.replace(/^\/|\/$/g, ''); 
        if (path && path !== 'storefront') {
            slug = path;
        }
    }

    if (!slug) {
        document.body.innerHTML = '<div class="text-center py-5"><h3>Store not found</h3><p>Please check the link.</p></div>';
        return;
    }

    // 2. Fetch Vendor Profile
    const { data: vendor, error: vError } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('slug', slug)
        .single();

    if (vError || !vendor) {
        document.getElementById('productGrid').innerHTML = '<div class="col-12 text-center py-5">Vendor does not exist.</div>';
        return;
    }

    // Update UI with Vendor Info
    document.title = `${vendor.business_name} - myvendor`;
    const storeNameEl = document.getElementById('displayStoreName');
    if(storeNameEl) storeNameEl.innerText = vendor.business_name;
    
    const navLinkEl = document.getElementById('navStoreLink');
    if(navLinkEl) navLinkEl.href = `/${slug}`;

    // 3. Fetch Vendor's Products
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

    const grid = document.getElementById('productGrid');
    const empty = document.getElementById('emptyState');

    if (pError || !products || products.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = products.map(p => {
        const outOfStockStyle = p.in_stock ? '' : 'filter: grayscale(1); opacity: 0.7;';
        const stockLabel = p.in_stock ? '' : '<div class="stock-tag">Sold Out</div>';

        return `
        <div class="col-6 mb-3">
            <a href="/product/?vendor=${slug}&id=${p.id}" class="product-card-link text-decoration-none">
                <div class="product-card" style="${outOfStockStyle}">
                    ${stockLabel}
                    <div class="product-img">
                        ${p.image_url ? `<img src="${p.image_url}" alt="${p.title}">` : '📦'}
                    </div>
                    <div class="product-info">
                        <h2 class="product-title">${p.title}</h2>
                        <p class="product-price">₦${parseFloat(p.price).toLocaleString()}</p>
                    </div>
                </div>
            </a>
        </div>`;
    }).join('');
}

// Global search function for the storefront
window.searchStore = function() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.product-card-link');
    
    cards.forEach(card => {
        const title = card.querySelector('.product-title').innerText.toLowerCase();
        card.parentElement.style.display = title.includes(term) ? 'block' : 'none';
    });
};

initStore();