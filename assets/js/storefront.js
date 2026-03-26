import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ IMPORTANT: Verify your actual Supabase URL and Anon Key here
const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initStore() {
    // 1. EXTRACT SLUG
    let slug = null;
    const params = new URLSearchParams(window.location.search);
    if (params.has('vendor')) {
        slug = params.get('vendor');
    }
    if (!slug) {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart !== 'storefront' && !lastPart.includes('.html')) {
                slug = lastPart;
            }
        }
    }

    if (slug) slug = slug.trim().toLowerCase();

    // SHOW ERROR IF NO SLUG
    if (!slug) {
        document.body.innerHTML = `
            <div class="text-center py-5" style="background: var(--cream); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <i class="bi bi-shop text-muted" style="font-size: 3rem; color: var(--text-soft) !important;"></i>
                <h3 class="mt-3 fw-bold" style="color: var(--forest); font-family: 'Playfair Display', serif;">Store not found</h3>
                <p style="color: var(--text-soft);">We couldn't detect a store name in the link.</p>
            </div>`;
        return;
    }

    // 2. FETCH VENDOR
    const { data: vendor, error: vError } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('slug', slug)
        .single();

    if (vError || !vendor) {
        document.body.innerHTML = `
            <div class="text-center py-5" style="background: var(--cream); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <i class="bi bi-exclamation-circle text-danger" style="font-size: 3rem;"></i>
                <h3 class="mt-3 fw-bold" style="color: var(--forest); font-family: 'Playfair Display', serif;">Store Does Not Exist</h3>
                <p style="color: var(--text-soft);">There is no store registered with the name "${slug}".</p>
            </div>`;
        return;
    }

    // 3. UPDATE UI WITH VENDOR INFO
    document.title = `${vendor.business_name} - myvendor`;
    const storeNameEl = document.getElementById('displayStoreName');
    if(storeNameEl) storeNameEl.innerText = vendor.business_name;

    const navLinkEl = document.getElementById('navStoreLink');
    if(navLinkEl) navLinkEl.href = `/${slug}`;

    // 🌟 BACKGROUND ANALYTICS
    supabase.from('analytics_events').insert([{ vendor_id: vendor.id, event_type: 'store_view', product_id: null }]).then();

    // 4. FETCH VENDOR'S PRODUCTS
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

    const grid = document.getElementById('productGrid');
    const empty = document.getElementById('emptyState');
    const filterContainer = document.getElementById('categoryFilters');
    const countEl = document.getElementById('productCount');

    if (pError || !products || products.length === 0) {
        if(grid) grid.innerHTML = '';
        if(empty) empty.classList.remove('hidden');
        if(countEl) countEl.innerText = '0 Items';
        return;
    }

    if(empty) empty.classList.add('hidden');
    if(countEl) countEl.innerText = `${products.length} Items`;

    // 🌟 GENERATE PREMIUM CATEGORY PILLS 🌟
    if (filterContainer) {
        const categories = ['All', ...new Set(products.map(p => p.category).filter(c => c && c.trim() !== 'Other' && c.trim() !== ''))];
        
        if (categories.length > 1) {
            filterContainer.style.display = 'flex';
            filterContainer.innerHTML = categories.map((cat, index) => `
                <button class="filter-pill ${index === 0 ? 'active' : ''}" onclick="filterStorefront('${cat}', this)">
                    ${cat}
                </button>
            `).join('');
        }
    }

    // 🌟 RENDER PREMIUM PRODUCT GRID 🌟
    if(grid) {
        grid.innerHTML = products.map((p, i) => {
            const delay = i * 0.05; // Stagger animation
            const isOut = !p.in_stock;
            const badge = isOut ? `<div class="sold-out-badge">Sold Out</div>` : '';
            const imgHtml = p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="${isOut ? 'filter: grayscale(1); opacity: 0.8;' : ''}">` : '📦';
            const catData = p.category ? p.category : 'Other';

            return `
            <div class="product-item" data-category="${catData}" style="animation-delay: ${delay}s;">
                <a href="/product/?vendor=${slug}&id=${p.id}" class="text-decoration-none">
                    <div class="product-card">
                        ${badge}
                        <div class="prod-img-wrapper">
                            ${imgHtml}
                        </div>
                        <div class="prod-info">
                            <h2 class="prod-title">${p.title}</h2>
                            <p class="prod-price">₦${parseFloat(p.price).toLocaleString()}</p>
                        </div>
                    </div>
                </a>
            </div>`;
        }).join('');
    }
}

// 🌟 UPDATED: SEARCH & FILTER LOGIC 🌟
window.searchStore = function() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const items = document.querySelectorAll('.product-item');
    let visibleCount = 0;

    items.forEach(item => {
        const title = item.querySelector('.prod-title').innerText.toLowerCase();
        if (title.includes(term)) {
            item.style.display = 'block';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });
    
    // Update count dynamically during search
    const countEl = document.getElementById('productCount');
    if(countEl) countEl.innerText = `${visibleCount} Items`;
};

window.filterStorefront = function(category, buttonElement) {
    // Update active pill styling
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');

    // Update Section Label Text
    const labelText = document.querySelector('.section-label-text');
    if (labelText) {
        labelText.innerText = category === 'All' ? 'All Products' : category;
    }

    // Filter the grid items
    const items = document.querySelectorAll('.product-item');
    let visibleCount = 0;

    items.forEach(item => {
        if (category === 'All' || item.getAttribute('data-category') === category) {
            item.style.display = 'block';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Update count dynamically during filter
    const countEl = document.getElementById('productCount');
    if(countEl) countEl.innerText = `${visibleCount} Items`;
};

// Initialize the storefront
initStore();