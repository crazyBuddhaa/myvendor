import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ IMPORTANT: Paste your actual Supabase URL and Anon Key here!
const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initStore() {
    // 1. BULLETPROOF SLUG EXTRACTOR
    let slug = null;
    
    // Check 1: Is it in a query parameter? (e.g., ?vendor=glamstore)
    const params = new URLSearchParams(window.location.search);
    if (params.has('vendor')) {
        slug = params.get('vendor');
    }

    // Check 2: Is it in the path? (e.g., /glamstore)
    if (!slug) {
        // Break the URL path into pieces
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            // Make sure we aren't accidentally grabbing 'storefront' or 'index.html'
            if (lastPart !== 'storefront' && !lastPart.includes('.html')) {
                slug = lastPart;
            }
        }
    }

    // Clean it up just in case
    if (slug) {
        slug = slug.trim().toLowerCase();
    }

    // If still no slug, show error with debugging info
    if (!slug) {
        document.body.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-shop text-muted" style="font-size: 3rem;"></i>
                <h3 class="mt-3 fw-bold text-dark">Store not found</h3>
                <p class="text-muted">We couldn't detect a store name in the link.</p>
            </div>`;
        return;
    }

    // 2. FETCH VENDOR PROFILE
    const { data: vendor, error: vError } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('slug', slug)
        .single();

    if (vError || !vendor) {
        document.body.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-circle text-danger" style="font-size: 3rem;"></i>
                <h3 class="mt-3 fw-bold text-dark">Vendor Does Not Exist</h3>
                <p class="text-muted">There is no store registered with the name "${slug}".</p>
            </div>`;
        return;
    }

    // 3. UPDATE UI WITH VENDOR INFO
    document.title = `${vendor.business_name} - myvendor`;
    const storeNameEl = document.getElementById('displayStoreName');
    if(storeNameEl) storeNameEl.innerText = vendor.business_name;
    
    const navLinkEl = document.getElementById('navStoreLink');
    if(navLinkEl) navLinkEl.href = `/${slug}`;

    // 4. FETCH VENDOR'S PRODUCTS
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

    const grid = document.getElementById('productGrid');
    const empty = document.getElementById('emptyState');

    if (pError || !products || products.length === 0) {
        if(grid) grid.innerHTML = '';
        if(empty) empty.classList.remove('hidden');
        return;
    }

    if(empty) empty.classList.add('hidden');
    if(grid) {
        grid.innerHTML = products.map(p => {
            const outOfStockStyle = p.in_stock ? '' : 'filter: grayscale(1); opacity: 0.7;';
            const stockLabel = p.in_stock ? '' : '<div class="stock-tag" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; font-size: 0.6rem; padding: 4px 8px; border-radius: 4px; font-weight: 700; z-index: 2;">Sold Out</div>';

            return `
            <div class="col-6 mb-3">
                <a href="/product/?vendor=${slug}&id=${p.id}" class="product-card-link text-decoration-none">
                    <div class="product-card" style="background: white; border-radius: 12px; border: 1px solid #eee; overflow: hidden; position: relative; height: 100%; transition: 0.2s; ${outOfStockStyle}">
                        ${stockLabel}
                        <div class="product-img" style="aspect-ratio: 1/1; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 2rem; overflow: hidden;">
                            ${p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width: 100%; height: 100%; object-fit: cover;">` : '📦'}
                        </div>
                        <div class="product-info" style="padding: 10px;">
                            <h2 class="product-title" style="font-size: 0.85rem; font-weight: 700; color: #333; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.4rem;">${p.title}</h2>
                            <p class="product-price" style="color: #16a34a; font-weight: 800; margin-top: 5px; font-size: 0.95rem;">₦${parseFloat(p.price).toLocaleString()}</p>
                        </div>
                    </div>
                </a>
            </div>`;
        }).join('');
    }
}

// Global search function
window.searchStore = function() {
    const searchInput = document.getElementById('searchInput');
    if(!searchInput) return;
    
    const term = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('.product-card-link');
    
    cards.forEach(card => {
        const title = card.querySelector('.product-title').innerText.toLowerCase();
        card.parentElement.style.display = title.includes(term) ? 'block' : 'none';
    });
};

initStore();