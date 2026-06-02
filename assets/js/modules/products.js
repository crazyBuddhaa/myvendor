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

    const setVal = (id1, id2, val) => {
        if (document.getElementById(id1))      document.getElementById(id1).value = val || '';
        else if (document.getElementById(id2)) document.getElementById(id2).value = val || '';
    };

    setVal('editProdTitle',    'prodTitle',    p.title);
    setVal('editProdPrice',    'prodPrice',    p.price);
    setVal('editProdDesc',     'prodDesc',     p.description);
    setVal('editProdCategory', 'prodCategory', p.category || 'Other');
    setVal('editProdStatus',   'prodStatus',   p.status   || 'in_stock');
    setVal('editProdQty',      'prodQty',      p.quantity !== null ? p.quantity : '');

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
    };

    const { error } = await supabase.from('products').update(productData).eq('id', productId);

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
