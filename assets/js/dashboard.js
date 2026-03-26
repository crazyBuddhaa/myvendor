import { supabase, checkAuth } from './supabase.js';

let currentUser = null;

// ─── 1. CORE INITIALIZATION ───────────────────────────────────────
async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return;

    // A. FETCH PROFILE & SETUP HOME PAGE
    const { data: profile } = await supabase.from('vendor_profiles').select('*').eq('id', currentUser.id).single();

    if (profile) {
        window.vendorSlug = profile.slug;
        const fullLink = `myvendor.qzz.io/${profile.slug}`; 

        // Populate Home UI
        if (document.getElementById('welcomeName')) {
            document.getElementById('welcomeName').innerText = `Welcome, ${profile.business_name} 👋`;
        }
        if (document.getElementById('storeLink')) {
            document.getElementById('storeLink').innerText = fullLink;
        }
        if (document.getElementById('waShareBtn')) {
            const waMsg = encodeURIComponent(`Shop my latest collection here: https://${fullLink}`);
            document.getElementById('waShareBtn').href = `https://wa.me/?text=${waMsg}`;
        }
    }

    // B. LOAD HOME STATS & RECENT ORDERS
    if (document.getElementById('statProducts')) {
        const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        document.getElementById('statProducts').innerText = pCount || 0;

        const { count: oCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        document.getElementById('statOrders').innerText = oCount || 0;

        await loadRecentOrders();
    }

    // C. LOAD INVENTORY, ORDERS & EDIT PAGES
    if (document.getElementById('productList')) await window.loadProducts();
    if (document.getElementById('orderList')) await window.loadOrders();
    if (document.getElementById('editProductForm')) await window.loadEditProduct();

    // D. LOAD SETTINGS PAGE
    if (document.getElementById('settingsForm')) {
        await window.loadSettings(profile);
    }

    // E. LOAD ANALYTICS PAGE
    if (document.getElementById('totalRevenue')) {
        await window.loadAnalytics();
    }
}

// ─── 2. HOME PAGE HELPERS ─────────────────────────────────────────
async function loadRecentOrders() {
    const list = document.getElementById('recentOrdersList');
    if (!list) return;

    const { data } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).limit(3).order('created_at', {ascending: false});

    if (!data || data.length === 0) {
        list.innerHTML = `
        <div id="emptyOrders" class="text-center py-4">
          <i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i>
          <p class="text-muted mt-2" style="font-size: 0.85rem;">No orders yet. Share your store link!</p>
        </div>`;
        return;
    }

    list.innerHTML = data.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `
        <div class="order-row d-flex justify-content-between align-items-center py-2 border-bottom">
          <div>
            <div class="fw-bold small">${o.id}</div>
            <div class="text-muted" style="font-size:0.7rem;">${date}</div>
          </div>
          <div class="text-end">
            <div class="fw-bold text-success small">₦${parseFloat(o.total_amount).toLocaleString()}</div>
            <div class="badge-status status-${o.status}" style="font-size:0.6rem; padding:0.1rem 0.4rem; border-radius:4px; text-transform:uppercase;">${o.status}</div>
          </div>
        </div>`;
    }).join('');
}

window.copyLink = function() {
    const linkText = document.getElementById('storeLink').innerText;
    if (linkText && linkText !== 'Loading...') {
        navigator.clipboard.writeText(`https://${linkText}`).then(() => {
            const toast = document.getElementById('toastMsg');
            if (toast) {
                toast.innerText = "Store link copied!";
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2500);
            } else {
                alert("Store link copied!");
            }
        });
    }
};

window.handleLogout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/dashboard/index.html';
};

// ─── 3. PRODUCT & INVENTORY LOGIC ─────────────────────────────────
window.saveProduct = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const fileInput = document.getElementById('fileInput');
        let imgUrl = null;

        // 🌟 CLOUDINARY UPLOAD 🌟
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', 'myvendor_uploads'); 
            formData.append('folder', `myvendor/${currentUser.id}`);

            const res = await fetch(`https://api.cloudinary.com/v1_1/dzxkxc7zu/image/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            
            // Apply auto-optimization for fast loading
            imgUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
        }

        await supabase.from('products').insert([{ 
            vendor_id: currentUser.id, 
            title: document.getElementById('prodTitle').value, 
            price: document.getElementById('prodPrice').value, 
            category: document.getElementById('prodCategory') ? document.getElementById('prodCategory').value : 'Other',
            description: document.getElementById('prodDesc') ? document.getElementById('prodDesc').value : '',
            in_stock: document.getElementById('stockSwitch') ? document.getElementById('stockSwitch').checked : true,
            status: document.getElementById('prodStatus') ? document.getElementById('prodStatus').value : 'in_stock',
            quantity: document.getElementById('prodQty') ? parseInt(document.getElementById('prodQty').value) : null,
            colors: document.getElementById('prodColors') ? document.getElementById('prodColors').value : null,
            image_url: imgUrl 
        }]);
        window.location.href = '/dashboard/products.html';
    } catch (e) { 
        alert("Error saving product: " + e.message); 
        btn.disabled = false; 
        btn.innerText = "Save Product"; 
    }
};

// ─── 3. PRODUCT & INVENTORY LOGIC ─────────────────────────────────

window.loadProducts = async function() {
    // 🌟 UPDATED: Targeting the new 'productGrid' ID instead of 'productList'
    const list = document.getElementById('productGrid'); 
    if (!list) return;

    const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', currentUser.id)
        .order('created_at', {ascending: false});

    const emptyState = document.getElementById('emptyState');

    if (!prods || prods.length === 0) { 
        if(emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.querySelector('h3').innerText = 'Your inventory is empty';
            emptyState.querySelector('p').innerText = 'Add your first product to start selling.';
            const addBtn = emptyState.querySelector('.btn-add-modern');
            if (addBtn) addBtn.classList.remove('hidden');
        }
        list.innerHTML = ''; 
        return; 
    }

    if(emptyState) emptyState.classList.add('hidden');
    
    // 🌟 UPDATED: Generating the new Modern UI cards
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

window.deleteProduct = async function(id) {
    if(confirm("Delete this product permanently?")) {
        await supabase.from('products').delete().eq('id', id);
        window.loadProducts();
    }
};

window.copyProductLink = function(id) {
    navigator.clipboard.writeText(`https://myvendor.qzz.io/product/?vendor=${window.vendorSlug}&id=${id}`);
    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = "Product link copied!";
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
        alert("Product link copied!");
    }
};


// ─── 4. EDIT PRODUCT LOGIC ────────────────────────────────────────
let currentEditId = null;
let currentExistingImageUrl = null;

window.loadEditProduct = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    currentEditId = urlParams.get('id');

    if (!currentEditId) {
        alert("Product ID not found.");
        window.location.href = '/dashboard/products.html';
        return;
    }

    const { data: product, error } = await supabase.from('products').select('*').eq('id', currentEditId).single();

    document.getElementById('loadingState').classList.add('hidden');

    if (error || !product) {
        alert("Failed to load product.");
        window.location.href = '/dashboard/products.html';
        return;
    }

    document.getElementById('editProductForm').classList.remove('hidden');

    document.getElementById('editProdTitle').value = product.title || '';
    document.getElementById('editProdPrice').value = product.price || '';
    if(document.getElementById('editProdCategory')) document.getElementById('editProdCategory').value = product.category || 'Other';
    if(document.getElementById('editProdDesc')) document.getElementById('editProdDesc').value = product.description || '';

    if(document.getElementById('editProdStatus')) {
        document.getElementById('editProdStatus').value = product.status || (product.in_stock ? 'in_stock' : 'out_of_stock');
    }
    if(document.getElementById('editProdQty')) document.getElementById('editProdQty').value = product.quantity || '';
    if(document.getElementById('editProdColors')) document.getElementById('editProdColors').value = product.colors || '';

    if (product.image_url) {
        currentExistingImageUrl = product.image_url;
        document.getElementById('editImagePreview').src = product.image_url;
        document.getElementById('editImagePreview').style.display = 'block';
        document.getElementById('editRemoveImgBtn').classList.remove('hidden');
    }
};

window.updateProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnUpdate');
    btn.disabled = true; 
    btn.innerText = "Updating...";

    try {
        let finalImgUrl = currentExistingImageUrl;
        const fileInput = document.getElementById('editFileInput');

        // 🌟 CLOUDINARY UPLOAD 🌟
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', 'myvendor_uploads'); 
            formData.append('folder', `myvendor/${currentUser.id}`);

            const res = await fetch(`https://api.cloudinary.com/v1_1/dzxkxc7zu/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            
            finalImgUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
        }

        const newStatus = document.getElementById('editProdStatus').value;
        const rawQty = document.getElementById('editProdQty').value;
        const newQty = rawQty ? parseInt(rawQty) : null;
        const newColors = document.getElementById('editProdColors').value;

        const { error } = await supabase.from('products').update({
            title: document.getElementById('editProdTitle').value,
            price: document.getElementById('editProdPrice').value,
            category: document.getElementById('editProdCategory').value,
            description: document.getElementById('editProdDesc').value,
            status: newStatus,
            quantity: newQty,
            colors: newColors,
            in_stock: (newStatus === 'in_stock' || newStatus === 'pre_order'), 
            image_url: finalImgUrl
        }).eq('id', currentEditId);

        if (error) throw error;
        window.location.href = '/dashboard/products.html';

    } catch (err) {
        alert("Error updating product: " + err.message);
        btn.disabled = false; 
        btn.innerText = "Update Product";
    }
};

window.previewEditImage = function(i) {
    if(i.files[0]) {
        let r = new FileReader();
        r.onload = e => { 
            document.getElementById('editImagePreview').src = e.target.result; 
            document.getElementById('editImagePreview').style.display = 'block'; 
            document.getElementById('editRemoveImgBtn').classList.remove('hidden'); 
        };
        r.readAsDataURL(i.files[0]);
    }
};

window.clearEditImage = function(e) {
    e.preventDefault(); e.stopPropagation();
    document.getElementById('editFileInput').value = '';
    document.getElementById('editImagePreview').style.display = 'none';
    document.getElementById('editRemoveImgBtn').classList.add('hidden');
    currentExistingImageUrl = null;
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
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { 
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        });

        // Conditionally render rider info if it exists
        const riderHtml = o.rider_name ? `
            <div class="rider-info-modern">
                <div class="rider-title"><i class="bi bi-bicycle"></i> Dispatch Details</div>
                <div class="rider-details">${o.rider_name} • <a href="tel:${o.rider_phone}">${o.rider_phone}</a></div>
            </div>` : '';

        return `
        <div class="order-card-modern" data-status="${o.status}">
            <div class="order-header-modern">
                <div>
                    <div class="order-id-modern">${o.id}</div>
                    <div class="order-date-modern">${date}</div>
                </div>
                <div style="text-align: right;">
                    <div class="order-amount-modern">₦${parseFloat(o.total_amount).toLocaleString()}</div>
                    <span class="status-badge-modern status-${o.status}">${o.status.replace('_', ' ')}</span>
                </div>
            </div>
            
            <div class="customer-info-modern">
                <div class="customer-name-modern">
                    <i class="bi bi-person-circle text-success" style="opacity: 0.8;"></i> ${o.customer_name}
                </div>
                <div class="item-summary-modern">
                    ${o.items}
                </div>
            </div>
            
            ${riderHtml}
            
            <div class="order-actions-modern">
                <button class="btn-action-modern btn-update" onclick="openStatusModal('${o.id}', '${o.status}')">
                    <i class="bi bi-pencil-square"></i> Update Status
                </button>
                <button class="btn-action-modern btn-chat" onclick="alert('To chat, copy the tracking link and send it to the customer on WhatsApp!')">
                    <i class="bi bi-whatsapp"></i> Chat
                </button>
                <button class="btn-action-modern btn-track" onclick="copyTracking('${o.id}')">
                    <i class="bi bi-link-45deg"></i> Copy Tracking Link
                </button>
            </div>
        </div>`;
    }).join('');
};

window.filterOrders = function(status, pillElement) {
    // Update active pill styling
    document.querySelectorAll('.filter-pill-modern').forEach(p => p.classList.remove('active'));
    if(pillElement) pillElement.classList.add('active');

    // Filter the cards
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

    // Handle empty state dynamically during filtering
    const emptyState = document.getElementById('emptyState');
    if (visibleCount === 0 && cards.length > 0) {
        if(emptyState) emptyState.classList.remove('hidden');
    } else if (cards.length > 0) {
        if(emptyState) emptyState.classList.add('hidden');
    }
};

window.openCreateOrderModal = function() {
    document.getElementById('createOrderForm').reset();
    new bootstrap.Modal(document.getElementById('createOrderModal')).show();
};

window.handleCreateOrderOriginal = window.handleCreateOrder; // Store original if needed
window.handleCreateOrder = async function(e) {
    e.preventDefault();

    const submitBtn = document.querySelector('#createOrderForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    try {
        const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;

        const { error } = await supabase.from('orders').insert([{ 
            id, 
            vendor_id: currentUser.id, 
            customer_name: document.getElementById('newCustomerName').value, 
            items: document.getElementById('newOrderItems').value, 
            total_amount: document.getElementById('newOrderTotal').value, 
            status: 'new' 
        }]);

        if (error) throw error;

        if(document.getElementById('createOrderModal')) {
            bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        }
        window.loadOrders(); // Refresh the beautiful new list
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

let currentOrderId = null;
window.openStatusModal = function(id, status) {
    currentOrderId = id;
    document.getElementById('statusSelect').value = status;
    
    // Toggle rider inputs based on current status
    const riderGroup = document.getElementById('riderDetailsGroup');
    if(riderGroup) {
        riderGroup.style.display = (status === 'shipped') ? 'block' : 'none';
    }
    
    new bootstrap.Modal(document.getElementById('statusModal')).show();
};

window.saveStatus = async function() {
    const status = document.getElementById('statusSelect').value;
    const riderName = document.getElementById('riderName') ? document.getElementById('riderName').value : null;
    const riderPhone = document.getElementById('riderPhone') ? document.getElementById('riderPhone').value : null;

    await supabase.from('orders').update({ 
        status, 
        rider_name: riderName, 
        rider_phone: riderPhone 
    }).eq('id', currentOrderId);
    
    bootstrap.Modal.getInstance(document.getElementById('statusModal')).hide();
    window.loadOrders();
};

// Listen for status changes in the modal to reveal Rider details
const statusSelect = document.getElementById('statusSelect');
if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
        const riderGroup = document.getElementById('riderDetailsGroup');
        if(riderGroup) riderGroup.style.display = e.target.value === 'shipped' ? 'block' : 'none';
    });
}

// ─── 6. UI HELPERS (Add Product Page) ─────────────────────────────
window.previewImage = function(i) {
    if(i.files[0]) {
        let r = new FileReader();
        r.onload = e => { 
            document.getElementById('imagePreview').src = e.target.result; 
            document.getElementById('imagePreview').style.display = 'block'; 
            document.getElementById('removeImgBtn').style.display = 'flex'; 
        };
        r.readAsDataURL(i.files[0]);
    }
};

window.clearImage = function(e) {
    e.preventDefault();
    document.getElementById('fileInput').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('removeImgBtn').style.display = 'none';
};

// ─── 7. SETTINGS LOGIC ───────────────────────────────────────────
window.loadSettings = async function(profile) {
    const loader = document.getElementById('loadingState');
    const form = document.getElementById('settingsForm');
    
    if (loader) loader.classList.add('hidden');
    if (form) form.classList.remove('hidden');

    if (document.getElementById('setBizName')) document.getElementById('setBizName').value = profile.business_name || '';
    if (document.getElementById('setSlug')) document.getElementById('setSlug').value = profile.slug || '';
    if (document.getElementById('setWaNumber')) document.getElementById('setWaNumber').value = profile.whatsapp_number || '';
    if (document.getElementById('setBio')) document.getElementById('setBio').value = profile.bio || '';
};

window.updateSettings = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveSettings');
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const { error } = await supabase.from('vendor_profiles').update({
            business_name: document.getElementById('setBizName').value,
            slug: document.getElementById('setSlug').value.toLowerCase().replace(/\s+/g, '-'), 
            whatsapp_number: document.getElementById('setWaNumber').value,
            bio: document.getElementById('setBio').value
        }).eq('id', currentUser.id);

        if (error) throw error;
        
        alert("Profile updated successfully!");
        window.location.href = '/dashboard/home.html';
    } catch (err) {
        alert("Error updating profile: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Update Profile";
    }
};

// ─── 8. ANALYTICS LOGIC ──────────────────────────────────────────
window.loadAnalytics = async function() {
    // A. FETCH ORDERS (Revenue & Counts)
    const { data: orders, error: oError } = await supabase
        .from('orders')
        .select('total_amount, status')
        .eq('vendor_id', currentUser.id);

    if (orders) {
        let revenue = 0;
        let pendingCount = 0;

        orders.forEach(order => {
            if (order.status === 'delivered') revenue += parseFloat(order.total_amount) || 0;
            if (order.status === 'new' || order.status === 'processing') pendingCount++;
        });

        if(document.getElementById('totalRevenue')) document.getElementById('totalRevenue').innerText = `₦${revenue.toLocaleString()}`;
        if(document.getElementById('totalOrders')) document.getElementById('totalOrders').innerText = orders.length;
        if(document.getElementById('pendingOrders')) document.getElementById('pendingOrders').innerText = pendingCount;
    }

    // B. FETCH ANALYTICS EVENTS (Traffic & Clicks)
    const { data: events, error: eError } = await supabase
        .from('analytics_events')
        .select('event_type, product_id, products(title)')
        .eq('vendor_id', currentUser.id);

    if (events) {
        let storeViews = 0;
        let productViews = 0;
        let waClicks = 0;
        let productStats = {}; 

        events.forEach(ev => {
            if (ev.event_type === 'store_view') storeViews++;
            
            if (ev.event_type === 'product_view') {
                productViews++;
                if(ev.product_id) {
                    if(!productStats[ev.product_id]) productStats[ev.product_id] = { title: ev.products?.title || 'Unknown Item', views: 0, clicks: 0 };
                    productStats[ev.product_id].views++;
                }
            }

            if (ev.event_type === 'whatsapp_click') {
                waClicks++;
                if(ev.product_id) {
                    if(!productStats[ev.product_id]) productStats[ev.product_id] = { title: ev.products?.title || 'Unknown Item', views: 0, clicks: 0 };
                    productStats[ev.product_id].clicks++;
                }
            }
        });

        if(document.getElementById('statStoreViews')) document.getElementById('statStoreViews').innerText = storeViews;
        if(document.getElementById('statProductViews')) document.getElementById('statProductViews').innerText = productViews;
        if(document.getElementById('statWaClicks')) document.getElementById('statWaClicks').innerText = waClicks;

        const topProductsHtml = Object.values(productStats)
            .sort((a, b) => b.clicks - a.clicks || b.views - a.views) 
            .slice(0, 5) 
            .map(p => `
                <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <div class="fw-bold small text-truncate" style="max-width: 60%;">${p.title}</div>
                    <div class="text-end small">
                        <span class="text-muted me-3" style="font-size:0.75rem;"><i class="bi bi-eye"></i> ${p.views}</span>
                        <span class="text-success fw-bold" style="font-size:0.8rem;"><i class="bi bi-whatsapp"></i> ${p.clicks}</span>
                    </div>
                </div>
            `).join('');
        
        if(document.getElementById('topProductsList')) {
            document.getElementById('topProductsList').innerHTML = topProductsHtml || '<p class="text-muted small py-3 text-center mb-0">No product traffic yet.</p>';
        }
    }
};

// ─── RUN THE APP ──────────────────────────────────────────────────
initDashboard();