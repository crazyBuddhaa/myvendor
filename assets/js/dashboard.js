import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ IMPORTANT: Verify your actual Supabase URL and Anon Key here
const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentUser = null;
window.vendorSlug = null;
window.currentProductsCount = 0;
const FREE_PRODUCT_LIMIT = 15;

// ─── 1. AUTH & INITIALIZATION ─────────────────────────────────────
async function initDashboard() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const { data: profile } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) {
        window.location.href = '/onboarding.html';
        return;
    }

    // Set Global State
    window.currentUser = profile;
    window.vendorSlug = profile.slug;

    // Inject the Premium Upgrade Modal into the page globally
    injectUpgradeModal();

    // Route controller: Load appropriate data based on which page we are on
    if (document.getElementById('recentOrdersList')) await window.loadHomeDashboard();
    if (document.getElementById('productGrid')) await window.loadProducts();
    if (document.getElementById('orderList')) await window.loadOrders();
    if (document.getElementById('totalRevenue')) await window.loadAnalytics();

    // 🌟 NEW: Load Settings if we are on the settings page
    if (document.getElementById('settingsForm')) await window.loadSettings();

    // Check for edit product form
    const urlParams = new URLSearchParams(window.location.search);
    if (document.getElementById('editProductForm') && urlParams.has('id')) {
        await window.loadEditProduct(urlParams.get('id'));
    }
}

// ─── 2. PREMIUM TIER LOGIC (FREEMIUM) ─────────────────────────────
function injectUpgradeModal() {
    const modalHtml = `
    <div class="modal fade" id="premiumModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border: none; border-radius: 20px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0f6e3f, #0a4a2a); padding: 2rem 1.5rem; text-align: center; color: white;">
            <i class="bi bi-star-fill" style="color: #fbbf24; font-size: 2.5rem; margin-bottom: 1rem;"></i>
            <h3 style="font-family: 'Playfair Display', serif; font-weight: 800; margin-bottom: 0.5rem;">Upgrade to Premium</h3>
            <p style="font-size: 0.9rem; opacity: 0.9; margin: 0;">Unlock professional tools to scale your business.</p>
          </div>
          <div class="modal-body" style="padding: 1.5rem;">
            <p class="text-center fw-bold text-danger" id="premiumLockReason" style="font-size: 0.85rem;"></p>
            <ul style="list-style: none; padding: 0; margin-bottom: 1.5rem; font-size: 0.9rem; color: #4a6741;">
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Add <b>Unlimited</b> Products</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Multiple Gallery Images</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Branded Web Receipts</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Remove 'myvendor' Watermark</li>
            </ul>
            <button class="w-100" style="background: #0f6e3f; color: white; padding: 0.9rem; border: none; border-radius: 12px; font-weight: 700;" onclick="alert('Payment Gateway Integration Coming Soon!')">
                Upgrade Now - ₦3,000/mo
            </button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.showPremiumModal = function(reasonText) {
    document.getElementById('premiumLockReason').innerText = reasonText;
    const modalEl = document.getElementById('premiumModal');
    if (modalEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.show();
    } else {
        alert(reasonText + "\n\nUpgrade to Premium to unlock this feature.");
    }
};

// ─── 3. HOME DASHBOARD LOGIC ──────────────────────────────────────
window.loadHomeDashboard = async function() {
    if (!document.getElementById('recentOrdersList')) return;

    // Populate Greeting & Store Link
    const firstName = window.currentUser.business_name.split(' ')[0] || 'Vendor';
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.innerHTML = `Welcome back, ${firstName} 👋`;

    const storeUrl = `myvendor.qzz.io/${window.vendorSlug}`;
    const storeLinkEl = document.getElementById('storeLink');
    if (storeLinkEl) storeLinkEl.innerText = storeUrl;

    // Set up WhatsApp Share Button
    const waShareBtn = document.getElementById('waShareBtn');
    if (waShareBtn) {
        const shareText = encodeURIComponent(`Shop our latest collection online! Browse products and place orders directly here: https://${storeUrl}`);
        waShareBtn.href = `https://wa.me/?text=${shareText}`;
    }

    // Fetch Top-Level Stats (Using fast 'head' queries)
    const { count: prodCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', window.currentUser.id);

    const { count: orderCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', window.currentUser.id);

    if (document.getElementById('statProducts')) document.getElementById('statProducts').innerText = prodCount || 0;
    if (document.getElementById('statOrders')) document.getElementById('statOrders').innerText = orderCount || 0;

    // Fetch & Render Recent Orders (Top 4)
    const { data: recentOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', window.currentUser.id)
        .order('created_at', { ascending: false })
        .limit(4);

    const ordersListEl = document.getElementById('recentOrdersList');

    if (!recentOrders || recentOrders.length === 0) {
        ordersListEl.innerHTML = `<div class="empty-orders"><i class="bi bi-inbox fs-2 mb-2 d-block"></i>No orders yet. Share your link to get started!</div>`;
        return;
    }

    ordersListEl.innerHTML = recentOrders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let statusClass = 'status-new';
        if (o.status === 'processing') statusClass = 'status-processing';
        if (o.status === 'shipped') statusClass = 'status-shipped';
        if (o.status === 'delivered') statusClass = 'status-delivered';
        if (o.status === 'cancelled') statusClass = 'status-cancelled';

        return `
        <div class="order-row">
          <div class="order-info">
            <span class="order-id">${o.id}</span>
            <span class="order-date">${date} • <strong style="color:var(--text-dark);">${o.customer_name}</strong></span>
          </div>
          <div class="order-right">
            <div class="order-amount">₦${parseFloat(o.total_amount).toLocaleString()}</div>
            <div class="badge-status ${statusClass}">${o.status.replace('_', ' ')}</div>
          </div>
        </div>`;
    }).join('');
};

// ─── 4. PRODUCT & INVENTORY LOGIC ─────────────────────────────────

window.loadProducts = async function() {
    const list = document.getElementById('productGrid');
    if (!list) return;

    const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', currentUser.id)
        .order('created_at', {ascending: false});

    const emptyState = document.getElementById('emptyState');

    window.currentProductsCount = prods ? prods.length : 0;

    if (!prods || prods.length === 0) { 
        if(emptyState) {
            emptyState.classList.remove('hidden');
            const addBtn = emptyState.querySelector('.btn-add-modern');
            if (addBtn) addBtn.classList.remove('hidden');
        }
        list.innerHTML = ''; 
        return; 
    }

    if(emptyState) emptyState.classList.add('hidden');

    list.innerHTML = prods.map(p => {
        let badgeClass = 'stock-in';
        let badgeText = 'In Stock';

        if (p.status === 'pre_order') {
            badgeClass = 'stock-low';
            badgeText = 'Pre-Order';
        } else if (p.status === 'out_of_stock' || p.in_stock === false) {
            badgeClass = 'stock-out';
            badgeText = 'Sold Out';
        }

        const imgHtml = p.image_url 
            ? `<img src="${p.image_url}" alt="${p.title}">` 
            : `<i class="bi bi-box placeholder-icon"></i>`;

        return `
        <div class="product-card">
            <div class="product-image">
                ${imgHtml}
            </div>
            <div class="product-info">
                <div class="product-title">${p.title}</div>
                <div class="product-price">₦${parseFloat(p.price).toLocaleString()}</div>
                <div class="stock-badge ${badgeClass}">${badgeText}</div>
                
                <div class="product-actions">
                    <a href="/dashboard/edit-product.html?id=${p.id}" class="action-btn">
                        <i class="bi bi-pencil"></i> Edit
                    </a>
                    <button class="action-btn" onclick="copyProductLink('${p.id}')">
                        <i class="bi bi-link-45deg"></i> Link
                    </button>
                    <button class="action-btn delete" onclick="deleteProduct('${p.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
};

// ─── ADD PRODUCT ───
window.saveProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave') || document.getElementById('saveBtn');
    if(btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    // Premium Check
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
    if (currentUser.tier !== 'premium' && count >= FREE_PRODUCT_LIMIT) {
        if(btn) btn.innerHTML = 'Save Product';
        window.showPremiumModal(`You have reached the free limit of ${FREE_PRODUCT_LIMIT} products.`);
        return;
    }

    // Read URLs directly from the hidden inputs the Cloudinary Widget populated!
    const imgInput = document.getElementById('imageUrl');
    const finalImageUrl = (imgInput && imgInput.value !== '') ? imgInput.value : null;

    const extraInput = document.getElementById('extraImagesData');
    let extraImagesArr = [];
    if (extraInput && extraInput.value) {
        try {
            extraImagesArr = JSON.parse(extraInput.value);
        } catch (err) {
            extraImagesArr = [];
        }
    }

    const statusVal = document.getElementById('prodStatus') ? document.getElementById('prodStatus').value : 'active';
    const qtyVal = document.getElementById('prodQty') ? document.getElementById('prodQty').value : '';

    const productData = {
        vendor_id: currentUser.id,
        title: document.getElementById('prodTitle').value,
        price: document.getElementById('prodPrice').value,
        description: document.getElementById('prodDesc').value,
        image_url: finalImageUrl, // The Cloudinary URL
        extra_images: extraImagesArr, // Array of premium gallery URLs
        category: document.getElementById('prodCategory') ? document.getElementById('prodCategory').value : 'Other',
        colors: document.getElementById('prodColors') ? document.getElementById('prodColors').value : null,
        sizes: document.getElementById('prodSizes') ? document.getElementById('prodSizes').value : null,
        material: document.getElementById('prodMaterial') ? document.getElementById('prodMaterial').value : null,
        weight: document.getElementById('prodWeight') ? document.getElementById('prodWeight').value : null,
        dimensions: document.getElementById('prodDimensions') ? document.getElementById('prodDimensions').value : null,
        tags: document.getElementById('prodTags') ? document.getElementById('prodTags').value : null,
        status: statusVal,
        quantity: qtyVal !== '' ? parseInt(qtyVal) : null,
        in_stock: statusVal !== 'out_of_stock'
    };

    const { error } = await supabase.from('products').insert([productData]);

    if (error) {
        alert("Error saving product: " + error.message);
        if(btn) btn.innerHTML = 'Save Product';
    } else {
        window.location.href = '/dashboard/products.html';
    }
};

// ─── EDIT PRODUCT ───
window.loadEditProduct = async function(id) {
    const header = document.getElementById('pageHeader');
    const saveBtn = document.getElementById('btnSave') || document.getElementById('btnUpdate');

    if (header) header.innerHTML = 'Edit Product <i class="bi bi-pencil-square text-success"></i>';
    if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Update Product';

    const { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error || !p) {
        alert("Product not found.");
        window.location.href = '/dashboard/products.html';
        return;
    }

    // Populate text inputs (Checking both add/edit ID patterns just in case)
    const setVal = (id1, id2, val) => {
        if(document.getElementById(id1)) document.getElementById(id1).value = val || '';
        else if(document.getElementById(id2)) document.getElementById(id2).value = val || '';
    };

    setVal('editProdTitle', 'prodTitle', p.title);
    setVal('editProdPrice', 'prodPrice', p.price);
    setVal('editProdDesc', 'prodDesc', p.description);
    setVal('editProdCategory', 'prodCategory', p.category || 'Other');
    setVal('editProdStatus', 'prodStatus', p.status || 'in_stock');
    setVal('editProdQty', 'prodQty', p.quantity !== null ? p.quantity : '');
    setVal('editProdColors', 'prodColors', p.colors);
    setVal('editProdSizes', 'prodSizes', p.sizes);
    setVal('editProdMaterial', 'prodMaterial', p.material);
    setVal('editProdWeight', 'prodWeight', p.weight);
    setVal('editProdDimensions', 'prodDimensions', p.dimensions);
    setVal('editProdTags', 'prodTags', p.tags);

    // Populate existing primary image into the hidden input so it doesn't get lost on update
    if (p.image_url) {
        if(document.getElementById('imageUrl')) document.getElementById('imageUrl').value = p.image_url;

        const preview = document.getElementById('imagePreview') || document.getElementById('editImagePreview');
        const wrapper = document.getElementById('imagePreviewWrapper');
        const removeBtn = document.getElementById('removeImgBtn') || document.getElementById('editRemoveImgBtn');

        if (preview && wrapper) {
            preview.src = p.image_url;
            preview.style.display = 'block';
            wrapper.style.display = 'block';
            if (removeBtn) removeBtn.classList.remove('hidden');
        }
    }

    // Populate existing gallery images into the hidden input
    if (p.extra_images && p.extra_images.length > 0) {
        if(document.getElementById('extraImagesData')) document.getElementById('extraImagesData').value = JSON.stringify(p.extra_images);

        // This array keeps track of current images so new ones can be appended via the widget
        window.uploadedGalleryImages = [...p.extra_images]; 

        const container = document.getElementById('extraImagesContainer');
        if (container) {
            p.extra_images.forEach(url => {
                const imgBox = document.createElement('div');
                imgBox.style.cssText = "width:75px; height:75px; border-radius:12px; overflow:hidden; border:1px solid #e9eee5;";

                const img = document.createElement('img');
                img.src = url;
                img.style.cssText = "width:100%; height:100%; object-fit:cover;";

                imgBox.appendChild(img);
                container.insertBefore(imgBox, container.lastElementChild);
            });
        }
    }

    const loader = document.getElementById('loadingState');
    const form = document.getElementById('editProductForm') || document.getElementById('addProductForm');

    if (loader) loader.classList.add('hidden');
    if (form) form.classList.remove('hidden');
};

window.updateProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave') || document.getElementById('btnUpdate');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Updating...';
    btn.disabled = true;

    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    // Read URLs directly from hidden inputs
    const imgInput = document.getElementById('imageUrl');
    const finalImageUrl = (imgInput && imgInput.value !== '') ? imgInput.value : null;

    const extraInput = document.getElementById('extraImagesData');
    let extraImagesArr = [];
    if (extraInput && extraInput.value) {
        try {
            extraImagesArr = JSON.parse(extraInput.value);
        } catch(err) {
            extraImagesArr = [];
        }
    }

    const getVal = (id1, id2) => {
        const el1 = document.getElementById(id1);
        const el2 = document.getElementById(id2);
        return el1 ? el1.value : (el2 ? el2.value : null);
    };

    const statusVal = getVal('editProdStatus', 'prodStatus') || 'active';
    const qtyVal = getVal('editProdQty', 'prodQty') || '';

    const productData = {
        title: getVal('editProdTitle', 'prodTitle'),
        price: getVal('editProdPrice', 'prodPrice'),
        description: getVal('editProdDesc', 'prodDesc'),
        image_url: finalImageUrl, // Saving Cloudinary URL
        extra_images: extraImagesArr,
        category: getVal('editProdCategory', 'prodCategory') || 'Other',
        colors: getVal('editProdColors', 'prodColors'),
        sizes: getVal('editProdSizes', 'prodSizes'),
        material: getVal('editProdMaterial', 'prodMaterial'),
        weight: getVal('editProdWeight', 'prodWeight'),
        dimensions: getVal('editProdDimensions', 'prodDimensions'),
        tags: getVal('editProdTags', 'prodTags'),
        status: statusVal,
        quantity: qtyVal !== '' ? parseInt(qtyVal) : null,
        in_stock: statusVal !== 'out_of_stock'
    };

    const { error } = await supabase.from('products').update(productData).eq('id', productId);

    if (error) {
        alert("Error updating product: " + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    } else {
        window.location.href = '/dashboard/products.html';
    }
};

window.deleteProduct = async function(id) {
    if(confirm("Delete this product permanently?")) {
        await supabase.from('products').delete().eq('id', id);
        window.loadProducts();
    }
};

window.copyProductLink = function(id) {
    // UPDATED: Now uses the clean path that matches vercel.json rewrite rules
    navigator.clipboard.writeText(`https://myvendor.qzz.io/product/${id}`);
    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = "Product link copied!";
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
        alert("Product link copied!");
    }
};


// ─── 5. ORDER MANAGEMENT LOGIC ────────────────────────────────────
window.loadOrders = async function() {
    const list = document.getElementById('orderList');
    if (!list) return;

    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', currentUser.id)
        .order('created_at', { ascending: false });

    const emptyState = document.getElementById('emptyState');

    if (!orders || orders.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        list.innerHTML = '';
        return;
    }

    if(emptyState) emptyState.classList.add('hidden');

    list.innerHTML = orders.map(o => {
        const dateStr = new Date(o.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        let riderHtml = '';
        if (o.status === 'delivered') {
            riderHtml = `
            <div class="rider-info-modern" style="background: var(--green-soft); border-color: var(--green-bright);">
                <div class="rider-title"><i class="bi bi-check-circle-fill text-success"></i> Delivery Completed</div>
                <div class="rider-details">Delivered by: ${o.rider_name || 'N/A'} • <a href="tel:${o.rider_phone || ''}">${o.rider_phone || 'N/A'}</a></div>
            </div>`;
        } else if (o.rider_name) {
            riderHtml = `
            <div class="rider-info-modern">
                <div class="rider-title"><i class="bi bi-bicycle"></i> Dispatch Details</div>
                <div class="rider-details">${o.rider_name} • <a href="tel:${o.rider_phone}">${o.rider_phone}</a></div>
            </div>`;
        }

        let actionsHtml = '';
        if (o.status === 'cancelled') {
            actionsHtml = ''; 
        } else if (o.status === 'delivered') {
            actionsHtml = `
            <div class="order-actions-modern" style="grid-template-columns: 1fr 1fr;">
                <button class="btn-action-modern btn-track" onclick="copyTracking('${o.id}')">
                    <i class="bi bi-link-45deg"></i> Copy Link
                </button>
                <button class="btn-action-modern" style="background: #fefaf5; border: 1px solid #d97706; color: #b45309;" onclick="generateReceipt('${o.id}')">
                    <i class="bi bi-receipt"></i> Receipt <i class="bi bi-lock-fill small ms-1"></i>
                </button>
            </div>`;
        } else {
            actionsHtml = `
            <div class="order-actions-modern" style="grid-template-columns: 1fr 1fr;">
                <button class="btn-action-modern btn-update" onclick="openStatusModal('${o.id}', '${o.status}')">
                    <i class="bi bi-pencil-square"></i> Update Status
                </button>
                <button class="btn-action-modern btn-track" style="grid-column: span 1;" onclick="copyTracking('${o.id}')">
                    <i class="bi bi-link-45deg"></i> Copy Link
                </button>
                <button class="btn-action-modern btn-chat" onclick="alert('Copy the tracking link and send it to the customer on WhatsApp!')">
                    <i class="bi bi-whatsapp"></i> Chat
                </button>
                <button class="btn-action-modern" style="background: #fefaf5; border: 1px solid #d97706; color: #b45309;" onclick="generateReceipt('${o.id}')">
                    <i class="bi bi-receipt"></i> Receipt <i class="bi bi-lock-fill small ms-1"></i>
                </button>
            </div>`;
        }

        let statusClass = 'status-new';
        if (o.status === 'processing') statusClass = 'status-processing';
        if (o.status === 'shipped') statusClass = 'status-shipped';
        if (o.status === 'delivered') statusClass = 'status-delivered';
        if (o.status === 'cancelled') statusClass = 'status-cancelled';

        return `
        <div class="order-card-modern" data-status="${o.status}">
            <div class="order-header-modern">
                <div>
                    <div class="order-id-modern">${o.id}</div>
                    <div class="order-date-modern">${dateStr}</div>
                </div>
                <div style="text-align: right;">
                    <div class="order-amount-modern">₦${parseFloat(o.total_amount).toLocaleString()}</div>
                    <span class="status-badge-modern ${statusClass}">${o.status.replace('_', ' ')}</span>
                </div>
            </div>
            
            <div class="customer-info-modern">
                <div class="customer-name-modern"><i class="bi bi-person-circle text-success" style="opacity: 0.8;"></i> ${o.customer_name}</div>
                <div class="item-summary-modern">${o.items}</div>
            </div>
            ${riderHtml}
            ${actionsHtml}
        </div>`;
    }).join('');
};

window.generateReceipt = function(orderId) {
    // 1. Check if the user is on the premium tier
    if (currentUser.tier !== 'premium') {
        window.showPremiumModal("Custom Branded Receipts are a Premium feature.");
        return;
    }
    
    // 2. Open the receipt page in a new tab, passing the order ID in the URL
    window.open(`/dashboard/receipt.html?id=${orderId}`, '_blank');
};

window.filterOrders = function(status, pillElement) {
    document.querySelectorAll('.filter-pill-modern').forEach(p => p.classList.remove('active'));
    if(pillElement) pillElement.classList.add('active');

    const cards = document.querySelectorAll('.order-card-modern');
    let visibleCount = 0;

    cards.forEach(card => {
        if (status === 'all' || card.dataset.status === status) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    const emptyState = document.getElementById('emptyState');
    if (visibleCount === 0 && cards.length > 0) {
        if(emptyState) emptyState.classList.remove('hidden');
    } else if (cards.length > 0) {
        if(emptyState) emptyState.classList.add('hidden');
    }
};

window.handleCreateOrder = async function(e) {
    e.preventDefault();
    const submitBtn = document.querySelector('#createOrderForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    try {
        const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
        const { error } = await supabase.from('orders').insert([{ 
            id, vendor_id: currentUser.id, 
            customer_name: document.getElementById('newCustomerName').value, 
            items: document.getElementById('newOrderItems').value, 
            total_amount: document.getElementById('newOrderTotal').value, 
            status: 'new' 
        }]);

        if (error) throw error;

        if(document.getElementById('createOrderModal')) {
            bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        }
        window.loadOrders(); 
        navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);

        const toast = document.getElementById('toastMsg');
        if (toast) {
            toast.innerText = "Order Created & Tracking Link Copied!";
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        } else {
            alert('Order Created & Link Copied!');
        }
    } catch (error) {
        alert("Error creating order: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
};

window.copyTracking = function(id) {
    navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = "Tracking link copied!";
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
        alert("Tracking link copied!");
    }
};

window.currentOrderId = null;
window.openStatusModal = function(id, status) {
    currentOrderId = id;
    const select = document.getElementById('statusSelect');

    // Reset all options
    Array.from(select.options).forEach(opt => opt.disabled = false);

    // Forward-only logic
    if (status === 'processing') {
        select.querySelector('option[value="new"]').disabled = true;
    } else if (status === 'shipped') {
        select.querySelector('option[value="new"]').disabled = true;
        select.querySelector('option[value="processing"]').disabled = true;
    }

    select.value = status;

    const riderGroup = document.getElementById('riderDetailsGroup');
    if(riderGroup) riderGroup.style.display = (status === 'shipped' || status === 'delivered') ? 'block' : 'none';

    new bootstrap.Modal(document.getElementById('statusModal')).show();
};

window.saveStatus = async function() {
    const status = document.getElementById('statusSelect').value;
    const riderName = document.getElementById('riderName') ? document.getElementById('riderName').value : null;
    const riderPhone = document.getElementById('riderPhone') ? document.getElementById('riderPhone').value : null;

    await supabase.from('orders').update({ status, rider_name: riderName, rider_phone: riderPhone }).eq('id', currentOrderId);
    bootstrap.Modal.getInstance(document.getElementById('statusModal')).hide();
    window.loadOrders();
};

const statusSelect = document.getElementById('statusSelect');
if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
        const riderGroup = document.getElementById('riderDetailsGroup');
        if(riderGroup) riderGroup.style.display = (e.target.value === 'shipped' || e.target.value === 'delivered') ? 'block' : 'none';
    });
}

// ─── 6. ANALYTICS LOGIC ──────────────────────────────────────────
window.loadAnalytics = async function() {
    const revEl = document.getElementById('totalRevenue');
    if (!revEl) return;

    const { data: orders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id);

    let totalRev = 0, totalOrd = 0, pendingOrd = 0;
    let productSales = {};

    if (orders) {
        totalOrd = orders.length;
        orders.forEach(o => {
            if (o.status === 'delivered') {
                const orderTotal = parseFloat(o.total_amount || 0);
                totalRev += orderTotal;

                const itemsArr = o.items.split(/,|\n/).map(i => i.trim()).filter(Boolean);
                itemsArr.forEach(item => {
                    const cleanName = item.replace(/^\d+x\s*/i, '').trim();
                    if (!productSales[cleanName]) productSales[cleanName] = { count: 0, revenue: 0 };
                    productSales[cleanName].count += 1;
                    productSales[cleanName].revenue += (orderTotal / itemsArr.length); 
                });
            }
            if (o.status === 'new' || o.status === 'processing') pendingOrd++;
        });
    }

    document.getElementById('totalRevenue').innerText = `₦${totalRev.toLocaleString()}`;
    document.getElementById('totalOrders').innerText = totalOrd;
    document.getElementById('pendingOrders').innerText = pendingOrd;

    const { data: events } = await supabase.from('analytics_events').select('event_type').eq('vendor_id', currentUser.id);

    let storeViews = 0, prodViews = 0, waClicks = 0;
    if (events) {
        events.forEach(e => {
            if (e.event_type === 'store_view') storeViews++;
            if (e.event_type === 'product_view') prodViews++;
            if (e.event_type === 'whatsapp_click') waClicks++;
        });
    }

    document.getElementById('statStoreViews').innerText = storeViews;
    document.getElementById('statProductViews').innerText = prodViews;
    document.getElementById('statWaClicks').innerText = waClicks;

    const topProductsList = document.getElementById('topProductsList');
    const sortedProducts = Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5); 

    if (sortedProducts.length === 0) {
        topProductsList.innerHTML = `<div class="empty-state"><i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i><br>No delivered orders yet to calculate top products.</div>`;
    } else {
        topProductsList.innerHTML = sortedProducts.map((prod, index) => `
            <div class="top-product-item">
                <div class="product-rank">${index + 1}</div>
                <div class="product-info">
                    <div class="product-name">${prod[0]}</div>
                    <div class="product-sales">${prod[1].count} order${prod[1].count !== 1 ? 's' : ''}</div>
                </div>
                <div class="product-revenue">₦${prod[1].revenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
            </div>
        `).join('');
    }
};

// ─── 7. SETTINGS LOGIC ───────────────────────────────────────────
window.loadSettings = async function() {
    if (!window.currentUser) return;

    if (document.getElementById('setBizName')) {
        document.getElementById('setBizName').value = window.currentUser.business_name || '';
    }
    if (document.getElementById('setWaNumber')) {
        document.getElementById('setWaNumber').value = window.currentUser.wa_number || '';
    }
    if (document.getElementById('setBio')) {
        document.getElementById('setBio').value = window.currentUser.bio || '';
    }
    if (document.getElementById('setSlug')) {
        const slugInput = document.getElementById('setSlug');
        slugInput.value = window.currentUser.slug || '';
        // Trigger the live preview update event
        slugInput.dispatchEvent(new Event('input'));
    }
};

window.updateSettings = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveSettings');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    btn.disabled = true;

    let newSlug = document.getElementById('setSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

    // Basic validation
    if (!newSlug) {
        alert("Store Link cannot be empty.");
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    // Slug uniqueness check: Make sure no other vendor took this custom link
    if (newSlug !== window.currentUser.slug) {
        const { data: existingVendor } = await supabase
            .from('vendor_profiles')
            .select('id')
            .eq('slug', newSlug)
            .single();

        if (existingVendor) {
            alert("This Store Link is already taken. Please choose another one.");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
    }

    const updatedData = {
        business_name: document.getElementById('setBizName').value.trim(),
        slug: newSlug,
        wa_number: document.getElementById('setWaNumber').value.trim(),
        bio: document.getElementById('setBio').value.trim()
    };

    const { error } = await supabase
        .from('vendor_profiles')
        .update(updatedData)
        .eq('id', window.currentUser.id);

    if (error) {
        alert("Error saving settings: " + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    } else {
        // Success! Update global state and UI instantly
        window.currentUser = { ...window.currentUser, ...updatedData };
        window.vendorSlug = updatedData.slug;

        btn.innerHTML = '<i class="bi bi-check-lg"></i> Saved Successfully!';

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);
    }
};

// ─── 8. UTILS & LOGOUT ───────────────────────────────────────────
window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
};

// Ignite!
initDashboard();