import { supabase } from '/assets/js/supabase.js';
import { escapeHTML } from '/assets/js/utils.js';

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

    if (!slug) {
        document.body.innerHTML = `
            <div class="text-center py-5" style="background: var(--cream-bg); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <i class="bi bi-shop text-muted" style="font-size: 3rem; color: var(--text-muted) !important;"></i>
                <h3 class="mt-3 fw-bold" style="color: var(--green-deep); font-family: 'Playfair Display', serif;">Store not found</h3>
                <p style="color: var(--text-muted);">We couldn't detect a store name in the link.</p>
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
            <div class="text-center py-5" style="background: var(--cream-bg); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <i class="bi bi-exclamation-circle text-danger" style="font-size: 3rem;"></i>
                <h3 class="mt-3 fw-bold" style="color: var(--green-deep); font-family: 'Playfair Display', serif;">Store Does Not Exist</h3>
                <p style="color: var(--text-muted);">There is no store registered with the name "${escapeHTML(slug)}".</p>
            </div>`;
        return;
    }

    // 3. UPDATE UI WITH VENDOR INFO
    document.title = `${vendor.business_name} - myvendor`;
    const storeNameEl = document.getElementById('displayStoreName');
    if (storeNameEl) storeNameEl.innerHTML = escapeHTML(vendor.business_name);

    const navLinkEl = document.getElementById('navStoreLink');
    if (navLinkEl) navLinkEl.href = `/${vendor.slug}`;

    // BACKGROUND ANALYTICS
    supabase.from('analytics_events').insert([{ vendor_id: vendor.id, event_type: 'store_view', product_id: null }]).then();

    // 4. FETCH VENDOR'S PRODUCTS
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

    const grid            = document.getElementById('productGrid');
    const empty           = document.getElementById('emptyState');
    const filterContainer = document.getElementById('categoryFilters');
    const countEl         = document.getElementById('productCount');

    if (pError || !products || products.length === 0) {
        if (grid)    grid.innerHTML = '';
        if (empty)   empty.classList.remove('hidden');
        if (countEl) countEl.innerText = '0 items';
        return;
    }

    if (empty)   empty.classList.add('hidden');
    if (countEl) countEl.innerText = `${products.length} items`;

    // GENERATE CATEGORY PILLS
    if (filterContainer) {
        const categories = ['All', ...new Set(products.map(p => p.category).filter(c => c && c.trim() !== 'Other' && c.trim() !== ''))];

        if (categories.length > 1) {
            filterContainer.style.display = 'flex';
            filterContainer.innerHTML = categories.map((cat, index) => `
                <button class="filter-pill ${index === 0 ? 'active' : ''}" onclick="filterStorefront('${escapeHTML(cat)}', this)">
                    ${escapeHTML(cat)}
                </button>
            `).join('');
        }
    }

    // RENDER PRODUCT GRID
    if (grid) {
        grid.innerHTML = products.map((p, i) => {
            const delay   = i * 0.05;
            const isOut   = !p.in_stock;
            const badge   = isOut ? `<div class="sold-out-tag">SOLD OUT</div>` : '';
            const imgHtml = p.image_url
                ? `<img src="${p.image_url}" alt="${escapeHTML(p.title)}" style="${isOut ? 'filter: grayscale(1); opacity: 0.8;' : ''}">`
                : '<i class="bi bi-box" style="font-size:2rem; color:var(--text-muted);"></i>';
            const catData = p.category ? p.category : 'Other';

            return `
            <a href="/product/${p.id}" class="product-item text-decoration-none" data-category="${escapeHTML(catData)}" style="animation-delay: ${delay}s;">
                <div class="product-card">
                    <div class="prod-img">
                        ${badge}
                        ${imgHtml}
                    </div>
                    <div class="prod-info">
                        <div class="prod-title">${escapeHTML(p.title)}</div>
                        <div class="prod-price">₦${parseFloat(p.price).toLocaleString()}</div>
                    </div>
                </div>
            </a>`;
        }).join('');
    }
}

// SEARCH & FILTER LOGIC
window.searchStore = function () {
    const term  = document.getElementById('searchInput').value.toLowerCase();
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

    const countEl = document.getElementById('productCount');
    if (countEl) countEl.innerText = `${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;

    const empty = document.getElementById('emptyState');
    if (visibleCount === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
    }
};

window.filterStorefront = function (category, buttonElement) {
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');

    const labelText = document.querySelector('.section-title');
    if (labelText) {
        labelText.innerText = category === 'All' ? 'All offerings' : category;
    }

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

    const countEl = document.getElementById('productCount');
    if (countEl) countEl.innerText = `${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;

    const empty = document.getElementById('emptyState');
    if (visibleCount === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
    }
};

initStore();
