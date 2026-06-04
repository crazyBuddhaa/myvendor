import { supabase } from '/assets/js/supabase.js';
import { escapeHTML } from '/assets/js/utils.js';

// ── CART ──────────────────────────────────────────────────────────────────────
let _vendorId        = null;
let _vendorName      = '';
let _vendorWa        = '';
let _vendorTemplate  = '';
let _vendorIsPremium = false;
let _products        = [];

const cartKey  = () => `mv_cart_${_vendorId}`;
const getCart  = () => { try { return JSON.parse(localStorage.getItem(cartKey())) || []; } catch { return []; } };
const saveCart = items => { localStorage.setItem(cartKey(), JSON.stringify(items)); _updateFab(); };
const _ikey    = item => item._key || item.id;   // unique key per cart line

// ── Variant picker ────────────────────────────────────────────────────────────

function _showVariantPicker(p) {
    const picker = document.getElementById('variantPicker');
    if (!picker) { _doAddToCart(p.id, null, null); return; }

    const sizesArr  = p.sizes  ? p.sizes.split(',').map(s => s.trim()).filter(Boolean)  : [];
    const colorsArr = p.colors ? p.colors.split(',').map(c => c.trim()).filter(Boolean) : [];

    picker.querySelector('.vp-title').textContent = p.title;
    picker.querySelector('.vp-price').textContent = '\u20a6' + parseFloat(p.price).toLocaleString();
    picker._productId = p.id;

    let html = '';
    if (sizesArr.length) {
        html += `<div class="vp-section">
            <div class="vp-label">Size</div>
            <div class="vp-chips" id="vpSizeChips">
                ${sizesArr.map(s => `<button class="vp-chip" onclick="mvPickChip(this)">${escapeHTML(s)}</button>`).join('')}
            </div>
        </div>`;
    }
    if (colorsArr.length) {
        html += `<div class="vp-section">
            <div class="vp-label">Colour</div>
            <div class="vp-chips" id="vpColorChips">
                ${colorsArr.map(c => `<button class="vp-chip" onclick="mvPickChip(this)">${escapeHTML(c)}</button>`).join('')}
            </div>
        </div>`;
    }
    picker.querySelector('.vp-options').innerHTML = html;
    picker.classList.add('open');
    document.getElementById('mvOverlay').classList.add('open');
}

window.mvPickChip = btn => {
    btn.closest('.vp-chips').querySelectorAll('.vp-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
};

window.mvConfirmVariant = () => {
    const picker = document.getElementById('variantPicker');
    if (!picker) return;
    const sizeEl  = picker.querySelector('#vpSizeChips .vp-chip.selected');
    const colorEl = picker.querySelector('#vpColorChips .vp-chip.selected');
    picker.classList.remove('open');
    document.getElementById('mvOverlay').classList.remove('open');
    _doAddToCart(picker._productId, sizeEl?.textContent || null, colorEl?.textContent || null);
};

window.mvCloseVariant = () => {
    const picker = document.getElementById('variantPicker');
    if (picker) picker.classList.remove('open');
    document.getElementById('mvOverlay').classList.remove('open');
};

function _doAddToCart(productId, selectedSize, selectedColor) {
    const p = _products.find(x => x.id === productId);
    if (!p) return;
    const cart = getCart();
    const hit  = cart.find(i => i.id === productId && i._size === (selectedSize || null) && i._color === (selectedColor || null));
    if (hit) {
        hit.qty++;
    } else {
        const variantLabel = [selectedSize, selectedColor].filter(Boolean).join(' \u00b7 ');
        cart.push({
            _key:      Math.random().toString(36).slice(2),
            id:        p.id,
            _size:     selectedSize  || null,
            _color:    selectedColor || null,
            title:     p.title + (variantLabel ? ` (${variantLabel})` : ''),
            price:     p.price,
            image_url: p.image_url,
            qty:       1,
        });
    }
    saveCart(cart);
    _animateFab();
}

// ── Public cart actions ───────────────────────────────────────────────────────

window.mvAddToCart = productId => {
    const p = _products.find(x => x.id === productId);
    if (!p) return;
    const hasVariants = (p.sizes && p.sizes.trim()) || (p.colors && p.colors.trim());
    if (hasVariants) {
        _showVariantPicker(p);
    } else {
        _doAddToCart(productId, null, null);
    }
};

window.mvRemoveItem = key => { saveCart(getCart().filter(i => _ikey(i) !== key)); _renderItems(); };

window.mvChangeQty = (key, delta) => {
    saveCart(getCart().map(i => _ikey(i) === key ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
    _renderItems();
};

window.mvOpenCart = () => {
    _renderItems();
    document.getElementById('mvPanel').classList.add('open');
    document.getElementById('mvOverlay').classList.add('open');
};

window.mvCloseCart = () => {
    document.getElementById('mvPanel').classList.remove('open');
    document.getElementById('mvOverlay').classList.remove('open');
    _showStep('items');
};

// Smart overlay tap — closes whichever panel is open
window.mvOverlayClick = () => {
    const picker = document.getElementById('variantPicker');
    if (picker && picker.classList.contains('open')) {
        mvCloseVariant();
    } else {
        mvCloseCart();
    }
};

const _showStep = step => {
    document.getElementById('stepItems').style.display    = step === 'items'    ? 'flex' : 'none';
    document.getElementById('stepCheckout').style.display = step === 'checkout' ? 'flex' : 'none';
};

window.mvGoCheckout = () => { if (getCart().length) _showStep('checkout'); };
window.mvBackItems  = () => _showStep('items');

function _buildOrderMsg(vars) {
    const tpl = _vendorIsPremium && _vendorTemplate ? _vendorTemplate : null;
    if (tpl) {
        return tpl
            .replace(/\{vendor\}/g,  vars.vendor)
            .replace(/\{items\}/g,   vars.items)
            .replace(/\{total\}/g,   `\u20a6${vars.total}`)
            .replace(/\{name\}/g,    vars.name)
            .replace(/\{phone\}/g,   vars.phone)
            .replace(/\{address\}/g, vars.address)
            .replace(/\{notes\}/g,   vars.notes || '');
    }
    return `Hello *${vars.vendor}*, I\u2019d like to place an order!\n\n\uD83D\uDED2 *ORDER SUMMARY:*\n${vars.items}\n\n\uD83D\uDCB0 *Total: \u20a6${vars.total}*\n\n*\u2500\u2500 DETAILS \u2500\u2500*\n\uD83D\uDC64 *Name:* ${vars.name}\n\uD83D\uDCDE *Phone:* ${vars.phone}\n\uD83D\uDCCD *Address:* ${vars.address}${vars.notes ? `\n\uD83D\uDCDD *Notes:* ${vars.notes}` : ''}`;
}

window.mvPlaceOrder = e => {
    e.preventDefault();
    const cart    = getCart();
    if (!cart.length) return;
    const name    = document.getElementById('mvName').value;
    const phone   = document.getElementById('mvPhone').value;
    const address = document.getElementById('mvAddress').value;
    const notes   = document.getElementById('mvNotes').value;
    const items   = cart.map((i, n) => `${n + 1}. ${i.title} \u00d7 ${i.qty} \u2014 \u20a6${(i.price * i.qty).toLocaleString()}`).join('\n');
    const total   = cart.reduce((s, i) => s + i.price * i.qty, 0).toLocaleString();
    const msg     = _buildOrderMsg({ vendor: _vendorName, items, total, name, phone, address, notes });
    window.open(`https://wa.me/${_vendorWa}?text=${encodeURIComponent(msg)}`, '_blank');
    saveCart([]);
    _renderItems();
    window.mvCloseCart();
};

function _renderItems() {
    const cart = getCart();
    const body = document.getElementById('mvCartBody');
    const tot  = document.getElementById('mvTotal');
    const btn  = document.getElementById('mvCheckoutBtn');
    if (!body) return;

    if (!cart.length) {
        body.innerHTML = `
            <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                <i class="bi bi-bag-x" style="font-size:2.5rem;opacity:.45;display:block;margin-bottom:.7rem;"></i>
                <div style="font-weight:600;font-size:.85rem;">Your cart is empty</div>
                <div style="font-size:.78rem;margin-top:.3rem;">Tap the bag icon on any product</div>
            </div>`;
        if (tot) tot.textContent = '\u20a60';
        if (btn) { btn.disabled = true; btn.style.opacity = '0.45'; }
        return;
    }

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    body.innerHTML = cart.map(item => {
        const key = _ikey(item);
        return `
        <div style="display:flex;gap:.75rem;padding:.85rem 0;border-bottom:1px solid var(--border-light);">
            <div style="width:52px;height:52px;border-radius:10px;overflow:hidden;background:#f8f2ea;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-light);">
                ${item.image_url
                    ? `<img src="${escapeHTML(item.image_url)}" style="width:100%;height:100%;object-fit:cover;" alt="">`
                    : '<i class="bi bi-box" style="color:var(--text-muted);font-size:1.1rem;"></i>'}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:.8rem;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(item.title)}</div>
                <div style="font-weight:700;font-size:.82rem;color:var(--green-primary);margin:.2rem 0 .45rem;">\u20a6${parseFloat(item.price).toLocaleString()}</div>
                <div style="display:flex;align-items:center;gap:.4rem;">
                    <button onclick="mvChangeQty('${key}',-1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid var(--border-light);background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.75rem;"><i class="bi bi-dash"></i></button>
                    <span style="font-weight:700;font-size:.85rem;min-width:1.4rem;text-align:center;">${item.qty}</span>
                    <button onclick="mvChangeQty('${key}',1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid var(--border-light);background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.75rem;"><i class="bi bi-plus"></i></button>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.4rem;flex-shrink:0;">
                <button onclick="mvRemoveItem('${key}')" style="border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:.85rem;padding:.1rem;opacity:.7;"><i class="bi bi-x-lg"></i></button>
                <div style="font-weight:800;font-size:.85rem;color:var(--text-dark);">\u20a6${(item.price * item.qty).toLocaleString()}</div>
            </div>
        </div>`;
    }).join('');

    if (tot) tot.textContent = `\u20a6${total.toLocaleString()}`;
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    _updateFab();
}

function _updateFab() {
    const count = getCart().reduce((s, i) => s + i.qty, 0);
    const fab   = document.getElementById('mvFab');
    const badge = document.getElementById('mvBadge');
    if (fab)   fab.style.display = count > 0 ? 'flex' : 'none';
    if (badge) badge.textContent = count;
    const navBtn   = document.getElementById('navCartBtn');
    const navCount = document.getElementById('navCartCount');
    if (navBtn) {
        navBtn.style.display = count > 0 ? 'flex' : 'none';
        if (navCount) navCount.textContent = count;
    }
}

function _animateFab() {
    const fab = document.getElementById('mvFab');
    if (!fab) return;
    fab.style.transform = 'scale(1.25)';
    setTimeout(() => fab.style.transform = '', 220);
}
// ── END CART ──────────────────────────────────────────────────────────────────


// ── SEO HELPERS ───────────────────────────────────────────────────────────────
function _setMeta(name, content) {
    if (!content) return;
    const prop = (name.startsWith('og:') || name.startsWith('twitter:')) ? 'property' : 'name';
    let el = document.querySelector(`meta[${prop}="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(prop, name); document.head.appendChild(el); }
    el.setAttribute('content', content);
}

function _injectLocalBusinessLD(vendor) {
    const ld = {
        '@context': 'https://schema.org',
        '@type':    'LocalBusiness',
        name:       vendor.business_name,
        url:        window.location.href,
    };
    if (vendor.bio)                             ld.description = vendor.bio;
    if (vendor.whatsapp_number || vendor.phone) ld.telephone   = vendor.whatsapp_number || vendor.phone;
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
}
// ── END SEO ───────────────────────────────────────────────────────────────────


// ── RECENTLY VIEWED ───────────────────────────────────────────────────────────
function _renderRecentlyViewed(vendorId) {
    const key = `mv_recent_${vendorId}`;
    let items = [];
    try { items = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* noop */ }
    if (!items.length) return;
    const section = document.getElementById('recentlyViewedSection');
    if (!section) return;
    section.style.display = 'block';
    const list = section.querySelector('.rv-list');
    if (!list) return;
    list.innerHTML = items.slice(0, 6).map(item => `
        <a href="/product/${item.id}" class="rv-item text-decoration-none">
            <div class="rv-img">
                ${item.image_url ? `<img src="${escapeHTML(item.image_url)}" alt="">` : '<i class="bi bi-box" style="font-size:1.2rem;color:var(--text-muted);"></i>'}
            </div>
            <div class="rv-title">${escapeHTML(item.title)}</div>
            <div class="rv-price">\u20a6${parseFloat(item.price).toLocaleString()}</div>
        </a>`).join('');
}
// ── END RECENTLY VIEWED ───────────────────────────────────────────────────────


// ── SEARCH & FILTER ───────────────────────────────────────────────────────────
window.searchStore = function () {
    const term  = document.getElementById('searchInput').value.toLowerCase();
    const items = document.querySelectorAll('.product-item');
    let visibleCount = 0;
    items.forEach(item => {
        const title = item.querySelector('.prod-title').innerText.toLowerCase();
        if (title.includes(term)) { item.style.display = 'block'; visibleCount++; }
        else { item.style.display = 'none'; }
    });
    const countEl = document.getElementById('productCount');
    if (countEl) countEl.innerText = `${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;
    const empty = document.getElementById('emptyState');
    if (empty) { visibleCount === 0 ? empty.classList.remove('hidden') : empty.classList.add('hidden'); }
};

window.filterStorefront = function (category, buttonElement) {
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');
    const labelText = document.querySelector('.section-title');
    if (labelText) labelText.innerText = category === 'All' ? 'All offerings' : category;
    const items = document.querySelectorAll('.product-item');
    let visibleCount = 0;
    items.forEach(item => {
        if (category === 'All' || item.getAttribute('data-category') === category) { item.style.display = 'block'; visibleCount++; }
        else { item.style.display = 'none'; }
    });
    const countEl = document.getElementById('productCount');
    if (countEl) countEl.innerText = `${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;
    const empty = document.getElementById('emptyState');
    if (empty) { visibleCount === 0 ? empty.classList.remove('hidden') : empty.classList.add('hidden'); }
};


// ── INIT STORE ────────────────────────────────────────────────────────────────
async function initStore() {
    // 1. Extract slug
    let slug = null;
    const params = new URLSearchParams(window.location.search);
    if (params.has('vendor')) slug = params.get('vendor');
    if (!slug) {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart !== 'storefront' && !lastPart.includes('.html')) slug = lastPart;
        }
    }
    if (slug) slug = slug.trim().toLowerCase();

    if (!slug) {
        document.body.innerHTML = `
            <div style="text-align:center;padding:5rem 1rem;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:var(--cream-bg);">
                <i class="bi bi-shop" style="font-size:3rem;color:var(--text-muted);opacity:.5;"></i>
                <h3 style="margin-top:1rem;font-weight:800;color:var(--green-deep);">Store not found</h3>
                <p style="color:var(--text-muted);">We couldn\u2019t detect a store name in the link.</p>
            </div>`;
        return;
    }

    // 2. Fetch vendor
    const { data: vendor, error: vError } = await supabase.from('vendor_profiles').select('*').eq('slug', slug).single();

    if (vError || !vendor) {
        document.body.innerHTML = `
            <div style="text-align:center;padding:5rem 1rem;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:var(--cream-bg);">
                <i class="bi bi-exclamation-circle" style="font-size:3rem;color:#ef4444;"></i>
                <h3 style="margin-top:1rem;font-weight:800;color:var(--green-deep);">Store does not exist</h3>
                <p style="color:var(--text-muted);">No store found for \u201c${escapeHTML(slug)}\u201d.</p>
            </div>`;
        return;
    }

    // 3. Update UI
    const storeNameEl = document.getElementById('displayStoreName');
    if (storeNameEl) storeNameEl.innerHTML = escapeHTML(vendor.business_name);
    const navLinkEl = document.getElementById('navStoreLink');
    if (navLinkEl) navLinkEl.href = `/${vendor.slug}`;

    // Clean URL: replace /storefront/index.html?vendor=slug with /slug
    if (window.location.pathname.includes('/storefront/')) {
        try { history.replaceState({}, document.title, '/' + slug); } catch (_) {}
    }

    // Show store logo if set
    if (vendor.logo_url) {
        const brandIcon = document.querySelector('.brand-icon');
        if (brandIcon) {
            brandIcon.innerHTML = `<img src="${escapeHTML(vendor.logo_url)}" alt="${escapeHTML(vendor.business_name)}" style="width:100%;height:100%;border-radius:14px;object-fit:cover;">`;
            brandIcon.style.background = 'transparent';
            brandIcon.style.boxShadow  = 'none';
        }
    }

    // 4. SEO
    document.title = `${vendor.business_name} | myvendor`;
    const desc = vendor.bio || `Shop ${vendor.business_name} on myvendor \u2014 browse products and order via WhatsApp.`;
    _setMeta('description',    desc);
    _setMeta('og:title',       `${vendor.business_name} | myvendor`);
    _setMeta('og:description', desc);
    _setMeta('og:type',        'website');
    _setMeta('og:url',         window.location.href);
    _setMeta('twitter:card',   'summary');
    _injectLocalBusinessLD(vendor);

    // 5. Cart context
    _vendorId        = vendor.id;
    _vendorName      = vendor.business_name;
    _vendorWa        = (vendor.whatsapp_number || vendor.phone || '').replace(/\D/g, '');
    _vendorTemplate  = vendor.order_template  || '';
    _vendorIsPremium = vendor.tier === 'premium';
    _updateFab();

    supabase.from('analytics_events').insert([{ vendor_id: vendor.id, event_type: 'store_view', product_id: null }]).then();

    // 6. Vacation mode
    if (vendor.vacation_mode) {
        const grid = document.getElementById('productGrid');
        if (grid) grid.innerHTML = `
            <div style="text-align:center;padding:4rem 1.5rem;color:var(--text-muted);">
                <i class="bi bi-moon-stars-fill" style="font-size:2.8rem;display:block;margin-bottom:1rem;color:var(--green-primary);opacity:.65;"></i>
                <div style="font-weight:800;font-size:1.05rem;margin-bottom:.6rem;color:var(--text-dark);">We\u2019re on a short break \uD83C\uDF3F</div>
                <div style="font-size:.85rem;max-width:260px;margin:0 auto 1.25rem;line-height:1.5;">Check back soon, or reach us directly on WhatsApp.</div>
                ${_vendorWa ? `<a href="https://wa.me/${_vendorWa}" target="_blank" style="display:inline-flex;align-items:center;gap:.45rem;background:#25D366;color:white;padding:.65rem 1.3rem;border-radius:40px;font-weight:700;font-size:.85rem;text-decoration:none;"><i class="bi bi-whatsapp"></i> Message us</a>` : ''}
            </div>`;
        const searchZone    = document.querySelector('.search-zone');
        const catFilters    = document.getElementById('categoryFilters');
        const sectionHeader = document.querySelector('.section-header');
        const emptyState    = document.getElementById('emptyState');
        if (searchZone)    searchZone.style.display    = 'none';
        if (catFilters)    catFilters.style.display    = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';
        if (emptyState)    emptyState.classList.add('hidden');
        return;
    }

    // 7. Fetch & render products
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

    _products = products;
    if (empty)   empty.classList.add('hidden');
    if (countEl) countEl.innerText = `${products.length} items`;

    // Category filter pills
    if (filterContainer) {
        const categories = ['All', ...new Set(products.map(p => p.category).filter(c => c && c.trim() !== 'Other' && c.trim() !== ''))];
        if (categories.length > 1) {
            filterContainer.style.display = 'flex';
            filterContainer.innerHTML = categories.map((cat, index) => `
                <button class="filter-pill ${index === 0 ? 'active' : ''}" onclick="filterStorefront('${escapeHTML(cat)}', this)">
                    ${escapeHTML(cat)}
                </button>`).join('');
        }
    }

    // Render product grid
    if (grid) {
        grid.innerHTML = products.map((p, i) => {
            const delay   = i * 0.05;
            const isOut   = p.in_stock === false || p.status === 'out_of_stock';
            const badge   = isOut ? `<div class="sold-out-tag">SOLD OUT</div>` : '';
            const atcBtn  = !isOut
                ? `<button class="atc-btn" onclick="event.stopPropagation();event.preventDefault();mvAddToCart('${p.id}')" title="Add to cart" aria-label="Add to cart"><i class="bi bi-bag-plus-fill"></i></button>`
                : '';
            const imgHtml = p.image_url
                ? `<img src="${p.image_url}" alt="${escapeHTML(p.title)}" style="${isOut ? 'filter:grayscale(1);opacity:.8;' : ''}">`
                : '<i class="bi bi-box" style="font-size:2rem;color:var(--text-muted);"></i>';
            return `
            <a href="/product/${p.id}" class="product-item product-card text-decoration-none" data-category="${escapeHTML(p.category || 'Other')}" style="animation-delay:${delay}s;">
                <div class="prod-img">${badge}${imgHtml}${atcBtn}</div>
                <div class="prod-info">
                    <div class="prod-title">${escapeHTML(p.title)}</div>
                    <div class="prod-price">\u20a6${parseFloat(p.price).toLocaleString()}</div>
                </div>
            </a>`;
        }).join('');
    }

    // 8. Recently viewed
    _renderRecentlyViewed(vendor.id);
}

initStore();
