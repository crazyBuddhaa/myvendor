import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initStore() {
    // 1. Get vendor slug from URL (e.g., ?vendor=glamstore)
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('vendor');

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
    document.getElementById('displayStoreName').innerText = vendor.business_name;
    document.getElementById('navStoreLink').href = `/storefront/?vendor=${slug}`;

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
        // If out of stock, we add a grayscale filter and a label
        const outOfStockStyle = p.in_stock ? '' : 'filter: grayscale(1); opacity: 0.7;';
        const stockLabel = p.in_stock ? '' : '<div class="stock-tag">Out of Stock</div>';

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