import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ IMPORTANT: Verify your actual Supabase URL and Anon Key here
const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentUser = null;
window.vendorSlug = null;
window.currentProductsCount = 0;

// Dynamic limit for products (Base 20 + any referral bonuses)
let FREE_PRODUCT_LIMIT = 20; 

// 🛡️ XSS SECURITY: Escapes malicious characters from user input
const escapeHTML = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// 🖼️ NEW: IMAGE OPTIMIZATION: Injects compression parameters into Cloudinary URLs
const optimizeCloudinaryUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    if (url.includes('/upload/w_') || url.includes('/upload/q_')) return url;
    return url.replace('/upload/', '/upload/w_600,q_auto,f_auto/');
};

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

    window.currentUser = profile;
    window.vendorSlug = profile.slug;
    
    // Apply referral bonus slots if they exist
    FREE_PRODUCT_LIMIT = 20 + (profile.bonus_slots || 0);

    injectUpgradeModal();

    if (document.getElementById('recentOrdersList')) await window.loadHomeDashboard();
    if (document.getElementById('productGrid')) await window.loadProducts();
    if (document.getElementById('orderList')) await window.loadOrders();
    if (document.getElementById('totalRevenue')) await window.loadAnalytics();
    if (document.getElementById('settingsForm')) await window.loadSettings();

    const urlParams = new URLSearchParams(window.location.search);
    if (document.getElementById('editProductForm') && urlParams.has('id')) {
        await window.loadEditProduct(urlParams.get('id'));
    }
}

// ─── 2. PREMIUM TIER LOGIC ────────────────────────────────────────
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

    const firstName = window.currentUser.business_name.split(' ')[0] || 'Vendor';
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.innerHTML = `Welcome back, ${escapeHTML(firstName)} 👋`;

    const storeUrl = `${window.location.host}/${window.vendorSlug}`;
    const storeLinkEl = document.getElementById('storeLink');
    if (storeLinkEl) storeLinkEl.innerText = storeUrl;

    const waShareBtn = document.getElementById('waShareBtn');
    if (waShareBtn) {
        const shareText = encodeURIComponent(`Shop our latest collection online! Browse products and place orders directly here: https://${storeUrl}`);
        waShareBtn.href = `https://wa.me/?text=${shareText}`;
    }

    const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', window.currentUser.id);
    const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', window.currentUser.id);

    if (document.getElementById('statProducts')) document.getElementById('statProducts').innerText = prodCount || 0;
    if (document.getElementById('statOrders')) document.getElementById('statOrders').innerText = orderCount || 0;

    const { data: recentOrders } = await supabase.from('orders').select('*').eq('vendor_id', window.currentUser.id).order('created_at', { ascending: false }).limit(4);
    const ordersListEl = document.getElementById('recentOrdersList');

    if (!recentOrders || recentOrders.length === 0) {
        ordersListEl.innerHTML = `<div class="empty-orders"><i class="bi bi-inbox fs-2 mb-2 d-block"></i>No orders yet. Share your link to get started!</div>`;
        return;
    }

    ordersListEl.innerHTML = recentOrders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        let statusClass = o.status === 'processing' ? 'status-processing' : o.status === 'shipped' ? 'status-shipped' : o.status === 'delivered' ? 'status-delivered' : o.status === 'cancelled' ? 'status-cancelled' : 'status-new';

        return `
        <div class="order-row">
          <div class="order-info">
            <span class="order-id">${o.id}</span>
            <span class="order-date">${date} • <strong style="color:var(--text-dark);">${escapeHTML(o.customer_name)}</strong></span>
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

        // Apply XSS protection to the title and alt text
        const safeTitle = escapeHTML(p.title);
        const imgHtml = p.image_url 
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

// ─── ADD PRODUCT ───
window.saveProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave') || document.getElementById('saveBtn');
    if(btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    // Premium Check (Using the dynamic FREE_PRODUCT_LIMIT set during init)
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
    if (currentUser.tier !== 'premium' && count >= FREE_PRODUCT_LIMIT) {
        if(btn) btn.innerHTML = 'Save Product';
        window.showPremiumModal(`You have reached the free limit of ${FREE_PRODUCT_LIMIT} products.`);
        return;
    }

    const imgInput = document.getElementById('imageUrl');
    const finalImageUrl = (imgInput && imgInput.value !== '') ? imgInput.value : null;

    const extraInput = document.getElementById('extraImagesData');
    let extraImagesArr = [];
    if (extraInput && extraInput.value) {
        try { extraImagesArr = JSON.parse(extraInput.value); } catch (err) { extraImagesArr = []; }
    }

    const statusVal = document.getElementById('prodStatus') ? document.getElementById('prodStatus').value : 'active';
    const qtyVal = document.getElementById('prodQty') ? document.getElementById('prodQty').value : '';

    const productData = {
        vendor_id: currentUser.id,
        title: document.getElementById('prodTitle').value,
        price: document.getElementById('prodPrice').value,
        description: document.getElementById('prodDesc').value,
        
        // 🌟 Apply Cloudinary Optimization to URLs before saving
        image_url: optimizeCloudinaryUrl(finalImageUrl),
        extra_images: extraImagesArr.map(url => optimizeCloudinaryUrl(url)),
        
        category: document.getElementById('prodCategory') ? document.getElementById('prodCategory').value : 'Other',
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
    const { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error || !p) {
        alert("Product not found.");
        window.location.href = '/dashboard/products.html';
        return;
    }

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

    // Populate main image
    if (p.image_url) {
        if(document.getElementById('imageUrl')) document.getElementById('imageUrl').value = p.image_url;
        const preview = document.getElementById('imagePreview') || document.getElementById('editImagePreview');
        const wrapper = document.getElementById('imagePreviewWrapper');
        if (preview && wrapper) {
            preview.src = p.image_url;
            preview.style.display = 'block';
            wrapper.style.display = 'block';
        }
    }

    // Populate gallery images
    if (p.extra_images && p.extra_images.length > 0) {
        if(document.getElementById('extraImagesData')) document.getElementById('extraImagesData').value = JSON.stringify(p.extra_images);
        window.uploadedGalleryImages = [...p.extra_images]; 
        const container = document.getElementById('extraImagesContainer');
        if (container) {
            p.extra_images.forEach(url => {
                const imgBox = document.createElement('div');
                imgBox.style.cssText = "width:75px; height:75px; border-radius:12px; overflow:hidden; border:1px solid #e9eee5;";
                imgBox.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
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

    const imgInput = document.getElementById('imageUrl');
    const finalImageUrl = (imgInput && imgInput.value !== '') ? imgInput.value : null;

    const extraInput = document.getElementById('extraImagesData');
    let extraImagesArr = [];
    if (extraInput && extraInput.value) {
        try { extraImagesArr = JSON.parse(extraInput.value); } catch(err) { extraImagesArr = []; }
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
        
        // 🌟 Apply Cloudinary Optimization to URLs before saving
        image_url: optimizeCloudinaryUrl(finalImageUrl),
        extra_images: extraImagesArr.map(url => optimizeCloudinaryUrl(url)),
        
        category: getVal('editProdCategory', 'prodCategory') || 'Other',
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
    // Generates a clean URL compatible with Vercel routing
    navigator.clipboard.writeText(`https://${window.location.host}/product/${id}`);
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

    const { data: orders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });
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
                <div class="rider-details">Delivered by: ${escapeHTML(o.rider_name) || 'N/A'} • <a href="tel:${escapeHTML(o.rider_phone) || ''}">${escapeHTML(o.rider_phone) || 'N/A'}</a></div>
            </div>`;
        } else if (o.rider_name) {
            riderHtml = `
            <div class="rider-info-modern">
                <div class="rider-title"><i class="bi bi-bicycle"></i> Dispatch Details</div>
                <div class="rider-details">${escapeHTML(o.rider_name)} • <a href="tel:${escapeHTML(o.rider_phone)}">${escapeHTML(o.rider_phone)}</a></div>
            </div>`;
        }

        let actionsHtml = '';
        if (o.status === 'cancelled') {
            actionsHtml = ''; 
        } else if (o.status === 'delivered') {
            actionsHtml = `
            <div class="order-actions-modern">
                <button class="btn-action-modern btn-track" onclick="copyTracking('${o.id}')"><i class="bi bi-link-45deg"></i> Copy Link</button>
                <button class="btn-action-modern" style="background: #fefaf5; border: 1px solid #d97706; color: #b45309;" onclick="generateReceipt('${o.id}', this)"><i class="bi bi-receipt"></i> Receipt</button>
            </div>`;
        } else {
            actionsHtml = `
            <div class="order-actions-modern">
                <button class="btn-action-modern btn-update" onclick="openStatusModal('${o.id}', '${o.status}')"><i class="bi bi-pencil-square"></i> Status</button>
                <button class="btn-action-modern" style="background: #fefaf5; border: 1px solid #d97706; color: #b45309;" onclick="generateReceipt('${o.id}', this)"><i class="bi bi-receipt"></i> Receipt</button>
                <button class="btn-action-modern btn-track" onclick="copyTracking('${o.id}')"><i class="bi bi-link-45deg"></i> Link</button>
            </div>`;
        }

        let statusClass = o.status === 'processing' ? 'status-processing' : o.status === 'shipped' ? 'status-shipped' : o.status === 'delivered' ? 'status-delivered' : o.status === 'cancelled' ? 'status-cancelled' : 'status-new';

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
                <div class="customer-name-modern"><i class="bi bi-person-circle text-success" style="opacity: 0.8;"></i> ${escapeHTML(o.customer_name)}</div>
                <div class="item-summary-modern">${escapeHTML(o.items)}</div>
            </div>
            ${riderHtml}
            ${actionsHtml}
        </div>`;
    }).join('');
};

window.generateReceipt = async function(orderId, btnElement) {
    let originalHtml = '';
    if (btnElement) {
        originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        btnElement.disabled = true;
    }

    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count, error } = await supabase
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('vendor_id', currentUser.id)
            .eq('event_type', 'receipt_generated')
            .gte('created_at', startOfMonth.toISOString());

        if (error) throw error;

        let RECEIPT_LIMIT = 10; 

        if (currentUser.tier !== 'premium' && count >= RECEIPT_LIMIT) {
            window.showPremiumModal(`You have reached your limit of ${RECEIPT_LIMIT} free receipts this month. Upgrade to generate unlimited branded receipts!`);
            if (btnElement) { btnElement.innerHTML = originalHtml; btnElement.disabled = false; }
            return;
        }

        await supabase.from('analytics_events').insert([{ vendor_id: currentUser.id, event_type: 'receipt_generated' }]);
        window.open(`/dashboard/receipt.html?id=${orderId}`, '_blank');
        
    } catch (err) {
        console.error(err);
        alert("Error generating receipt. Please try again.");
    } finally {
        if (btnElement) { btnElement.innerHTML = originalHtml; btnElement.disabled = false; }
    }
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

// Original single-textarea Create Order Logic
window.handleCreateOrder = async function(e) {
    e.preventDefault();
    const submitBtn = document.querySelector('#createOrderForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    try {
        const itemsValue = document.getElementById('newOrderItems').value.trim();
        if (!itemsValue) throw new Error("Please add items to the order.");

        const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
        
        const { error } = await supabase.from('orders').insert([{ 
            id, 
            vendor_id: currentUser.id, 
            customer_name: document.getElementById('newCustomerName').value, 
            items: itemsValue, 
            total_amount: document.getElementById('newOrderTotal').value, 
            status: 'new' 
        }]);

        if (error) throw error;

        if(document.getElementById('createOrderModal')) {
            bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        }
        
        document.getElementById('createOrderForm').reset();
        window.loadOrders(); 
        navigator.clipboard.writeText(`https://${window.location.host}/track/?id=${id}`);

        const toast = document.getElementById('toastMsg');
        if (toast) {
            toast.innerText = "Order Created & Tracking Link Copied!";
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        } else {
            alert('Order Created & Link Copied!');
        }
        
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
};

window.copyTracking = function(id) {
    navigator.clipboard.writeText(`https://${window.location.host}/track/?id=${id}`);
    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = "Tracking link copied!";
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    } else { alert("Tracking link copied!"); }
};

window.currentOrderId = null;
window.openStatusModal = function(id, status) {
    currentOrderId = id;
    const select = document.getElementById('statusSelect');
    Array.from(select.options).forEach(opt => opt.disabled = false);

    if (status === 'processing') select.querySelector('option[value="new"]').disabled = true;
    else if (status === 'shipped') {
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
        topProductsList.innerHTML = `<div class="empty-state"><i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i><br>No delivered orders yet.</div>`;
    } else {
        topProductsList.innerHTML = sortedProducts.map((prod, index) => `
            <div class="top-product-item">
                <div class="product-rank">${index + 1}</div>
                <div class="product-info">
                    <div class="product-name">${escapeHTML(prod[0])}</div>
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
    if (document.getElementById('setBizName')) document.getElementById('setBizName').value = window.currentUser.business_name || '';
    if (document.getElementById('setWaNumber')) document.getElementById('setWaNumber').value = window.currentUser.wa_number || '';
    if (document.getElementById('setBio')) document.getElementById('setBio').value = window.currentUser.bio || '';
    if (document.getElementById('setSlug')) {
        const slugInput = document.getElementById('setSlug');
        slugInput.value = window.currentUser.slug || '';
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

    if (!newSlug) {
        alert("Store Link cannot be empty.");
        btn.innerHTML = originalText; btn.disabled = false; return;
    }

    if (newSlug !== window.currentUser.slug) {
        const { data: existingVendor } = await supabase.from('vendor_profiles').select('id').eq('slug', newSlug).single();
        if (existingVendor) {
            alert("This Store Link is already taken. Please choose another one.");
            btn.innerHTML = originalText; btn.disabled = false; return;
        }
    }

    const updatedData = {
        business_name: document.getElementById('setBizName').value.trim(),
        slug: newSlug,
        wa_number: document.getElementById('setWaNumber').value.trim(),
        bio: document.getElementById('setBio').value.trim()
    };

    const { error } = await supabase.from('vendor_profiles').update(updatedData).eq('id', window.currentUser.id);

    if (error) {
        alert("Error saving settings: " + error.message);
        btn.innerHTML = originalText; btn.disabled = false;
    } else {
        window.currentUser = { ...window.currentUser, ...updatedData };
        window.vendorSlug = updatedData.slug;
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Saved Successfully!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    }
};

window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
};

// Ignite!
initDashboard();