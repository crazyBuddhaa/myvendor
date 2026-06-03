// ─── PRODUCT & INVENTORY ──────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { escapeHTML, optimizeCloudinaryUrl } from '../utils.js';

// ── List ──────────────────────────────────────────────────────────────────────

window.loadProducts = async function () {
    const list = document.getElementById('productGrid');
    if (!list) return;

    const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', state.currentUser.id)
        .order('created_at', { ascending: false });

    const emptyState = document.getElementById('emptyState');
    window.currentProductsCount = prods ? prods.length : 0;

    // ── Slot usage bar ────────────────────────────────────────────────────────
    const slotBar  = document.getElementById('slotUsageBar');
    if (slotBar) {
        const count    = window.currentProductsCount;
        const limit    = state.freeProductLimit;
        const isPrem   = state.currentUser.tier === 'premium';

        if (isPrem) {
            slotBar.style.display = 'block';
            slotBar.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;color:var(--text-muted);font-weight:600;background:var(--card-white);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:0.55rem 1rem;"><i class="bi bi-star-fill" style="color:#f59e0b;font-size:0.7rem;"></i> Premium — unlimited product slots</div>`;
        } else {
            const pct   = Math.min((count / limit) * 100, 100);
            const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
            const warn  = pct >= 100
                ? `<p style="font-size:0.7rem;color:#ef4444;margin:0.4rem 0 0;font-weight:600;">⚠️ Limit reached. <a href="/dashboard/referrals.html" style="color:#ef4444;">Refer friends</a> for free slots or upgrade.</p>`
                : pct >= 70
                ? `<p style="font-size:0.7rem;color:#b45309;margin:0.4rem 0 0;font-weight:600;">💡 ${limit - count} slot${limit - count === 1 ? '' : 's'} left. <a href="/dashboard/referrals.html" style="color:var(--green-primary);">Refer friends</a> to earn +3 free slots.</p>`
                : '';
            slotBar.style.display = 'block';
            slotBar.innerHTML = `
            <div style="background:var(--card-white);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:0.7rem 1rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                    <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;"><i class="bi bi-box-seam me-1"></i> Product Slots</span>
                    <span style="font-size:0.78rem;font-weight:800;color:${color};">${count} / ${limit}</span>
                </div>
                <div style="background:#e9eee5;border-radius:100px;height:5px;overflow:hidden;">
                    <div style="width:${pct}%;background:${color};height:100%;border-radius:100px;transition:width 0.4s ease;"></div>
                </div>
                ${warn}
            </div>`;
        }
    }

    if (!prods || prods.length === 0) {
        if (emptyState) {
            emptyState.classList.remove('hidden');
            const addBtn = emptyState.querySelector('.btn-add-modern');
            if (addBtn) addBtn.classList.remove('hidden');
        }
        list.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    list.innerHTML = prods.map(p => {
        let badgeClass = 'stock-in';
        let badgeText  = 'In Stock';

        if (p.status === 'pre_order') {
            badgeClass = 'stock-low'; badgeText = 'Pre-Order';
        } else if (p.status === 'out_of_stock' || p.in_stock === false) {
            badgeClass = 'stock-out'; badgeText = 'Sold Out';
        }

        const safeTitle = escapeHTML(p.title);
        const imgHtml   = p.image_url
            ? `<img src="${p.image_url}" alt="${safeTitle}">`
            : `<i class="bi bi-box placeholder-icon"></i>`;

        return `
        <div class="product-card">
            <div class="product-image">${imgHtml}</div>
            <div class="product-info">
                <div class="product-title">${safeTitle}</div>
                <div class="product-price">₦${parseFloat(p.price).toLocaleString()}</div>
                <div class="stock-badge ${badgeClass}">${badgeText}</div>
                <div class="product-actions">
                    <a href="/dashboard/edit-product.html?id=${p.id}" class="action-btn"><i class="bi bi-pencil"></i> Edit</a>
                    <button class="action-btn" onclick="copyProductLink('${p.id}')"><i class="bi bi-link-45deg"></i> Link</button>
                    <button class="action-btn delete" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
};

// ── Add ───────────────────────────────────────────────────────────────────────

window.saveProduct = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave') || document.getElementById('saveBtn');
    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', state.currentUser.id);

    if (state.currentUser.tier !== 'premium' && count >= state.freeProductLimit) {
        if (btn) btn.innerHTML = 'Save Product';
        window.showPremiumModal(`You have reached the free limit of ${state.freeProductLimit} products.`);
        return;
    }

    const imgInput = document.getElementById('imageUrl');
    const finalImageUrl = (imgInput && imgInput.value !== '') ? imgInput.value : null;

    const extraInput = document.getElementById('extraImagesData');
    let extraImagesArr = [];
    if (extraInput && extraInput.value) {
        try { extraImagesArr = JSON.parse(extraInput.value); } catch { extraImagesArr = []; }
    }

    const statusVal = document.getElementById('prodStatus') ? document.getElementById('prodStatus').value : 'active';
    const qtyVal    = document.getElementById('prodQty')    ? document.getElementById('prodQty').value    : '';

    const getField = id => {
        const el = document.getElementById(id);
        return el && el.value.trim() !== '' ? el.value.trim() : null;
    };

    const productData = {
        vendor_id:    state.currentUser.id,
        title:        document.getElementById('prodTitle').value,
        price:        document.getElementById('prodPrice').value,
        description:  document.getElementById('prodDesc').value,
        image_url:    optimizeCloudinaryUrl(finalImageUrl),
        extra_images: extraImagesArr.map(url => optimizeCloudinaryUrl(url)),
        category:     document.getElementById('prodCategory') ? document.getElementById('prodCategory').value : 'Other',
        status:       statusVal,
        quantity:     qtyVal !== '' ? parseInt(qtyVal) : null,
        in_stock:     statusVal !== 'out_of_stock',
        tags:         getField('prodTags'),
        colors:       getField('prodColors'),
        sizes:        getField('prodSizes'),
        material:     getField('prodMaterial'),
        weight:       getField('prodWeight'),
        dimensions:   getField('prodDimensions'),
    };

    const { error } = await supabase.from('products').insert([productData]);

    if (error) {
        alert('Error saving product: ' + error.message);
        if (btn) btn.innerHTML = 'Save Product';
    } else {
        window.location.href = '/dashboard/products.html';
    }
};

// ── Edit (load) ───────────────────────────────────────────────────────────────

window.loadEditProduct = async function (id) {
    const { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error || !p) {
        alert('Product not found.');
        window.location.href = '/dashboard/products.html';
        return;
    }

    if (p.vendor_id !== state.currentUser.id) {
        alert('You do not have permission to edit this product.');
        window.location.href = '/dashboard/products.html';
        return;
    }

    const setVal = (id1, id2, val) => {
        if (document.getElementById(id1))      document.getElementById(id1).value = val || '';
        else if (document.getElementById(id2)) document.getElementById(id2).value = val || '';
    };

    setVal('editProdTitle',      'prodTitle',      p.title);
    setVal('editProdPrice',      'prodPrice',      p.price);
    setVal('editProdDesc',       'prodDesc',       p.description);
    setVal('editProdCategory',   'prodCategory',   p.category   || 'Other');
    setVal('editProdStatus',     'prodStatus',     p.status     || 'in_stock');
    setVal('editProdQty',        'prodQty',        p.quantity !== null ? p.quantity : '');
    setVal('editProdTags',       'prodTags',       p.tags       || '');
    setVal('editProdColors',     'prodColors',     p.colors     || '');
    setVal('editProdSizes',      'prodSizes',      p.sizes      || '');
    setVal('editProdMaterial',   'prodMaterial',   p.material   || '');
    setVal('editProdWeight',     'prodWeight',     p.weight     || '');
    setVal('editProdDimensions', 'prodDimensions', p.dimensions || '');

    if (p.image_url) {
        if (document.getElementById('imageUrl')) document.getElementById('imageUrl').value = p.image_url;
        const preview = document.getElementById('imagePreview') || document.getElementById('editImagePreview');
        const wrapper = document.getElementById('imagePreviewWrapper');
        if (preview && wrapper) {
            preview.src            = p.image_url;
            preview.style.display  = 'block';
            wrapper.style.display  = 'block';
        }
    }

    if (p.extra_images && p.extra_images.length > 0) {
        if (document.getElementById('extraImagesData')) {
            document.getElementById('extraImagesData').value = JSON.stringify(p.extra_images);
        }
        window.uploadedGalleryImages = [...p.extra_images];
        const container = document.getElementById('extraImagesContainer');
        if (container) {
            p.extra_images.forEach(url => {
                const imgBox = document.createElement('div');
                imgBox.style.cssText = 'width:75px; height:75px; border-radius:12px; overflow:hidden; border:1px solid #e9eee5;';
                imgBox.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
                container.insertBefore(imgBox, container.lastElementChild);
            });
        }
    }

    const loader = document.getElementById('loadingState');
    const form   = document.getElementById('editProductForm') || document.getElementById('addProductForm');
    if (loader) loader.classList.add('hidden');
    if (form)   form.classList.remove('hidden');
};

// ── Edit (save) ───────────────────────────────────────────────────────────────

window.updateProduct = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave') || document.getElementById('btnUpdate');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Updating...';
    btn.disabled = true;

    const productId = new URLSearchParams(window.location.search).get('id');

    const imgInput = document.getElementById('imageUrl');
    const finalImageUrl = (imgInput && imgInput.value !== '') ? imgInput.value : null;

    const extraInput = document.getElementById('extraImagesData');
    let extraImagesArr = [];
    if (extraInput && extraInput.value) {
        try { extraImagesArr = JSON.parse(extraInput.value); } catch { extraImagesArr = []; }
    }

    const getVal = (id1, id2) => {
        const el1 = document.getElementById(id1);
        const el2 = document.getElementById(id2);
        return el1 ? el1.value : (el2 ? el2.value : null);
    };

    const statusVal = getVal('editProdStatus', 'prodStatus') || 'active';
    const qtyVal    = getVal('editProdQty',    'prodQty')    || '';

    const nullIfEmpty = (id1, id2) => {
        const v = getVal(id1, id2);
        return v && v.trim() !== '' ? v.trim() : null;
    };

    const productData = {
        title:        getVal('editProdTitle',    'prodTitle'),
        price:        getVal('editProdPrice',    'prodPrice'),
        description:  getVal('editProdDesc',     'prodDesc'),
        image_url:    optimizeCloudinaryUrl(finalImageUrl),
        extra_images: extraImagesArr.map(url => optimizeCloudinaryUrl(url)),
        category:     getVal('editProdCategory', 'prodCategory') || 'Other',
        status:       statusVal,
        quantity:     qtyVal !== '' ? parseInt(qtyVal) : null,
        in_stock:     statusVal !== 'out_of_stock',
        tags:         nullIfEmpty('editProdTags',       'prodTags'),
        colors:       nullIfEmpty('editProdColors',     'prodColors'),
        sizes:        nullIfEmpty('editProdSizes',      'prodSizes'),
        material:     nullIfEmpty('editProdMaterial',   'prodMaterial'),
        weight:       nullIfEmpty('editProdWeight',     'prodWeight'),
        dimensions:   nullIfEmpty('editProdDimensions', 'prodDimensions'),
    };

    const { error } = await supabase.from('products').update(productData).eq('id', productId).eq('vendor_id', state.currentUser.id);

    if (error) {
        alert('Error updating product: ' + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    } else {
        window.location.href = '/dashboard/products.html';
    }
};

// ── Delete ────────────────────────────────────────────────────────────────────

window.deleteProduct = async function (id) {
    if (confirm('Delete this product permanently?')) {
        await supabase.from('products').delete().eq('id', id);
        window.loadProducts();
    }
};

// ── Copy link ─────────────────────────────────────────────────────────────────

window.copyProductLink = function (id) {
    navigator.clipboard.writeText(`https://${window.location.host}/product/${id}`);
    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = 'Product link copied!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
        alert('Product link copied!');
    }
};
