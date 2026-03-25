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
        const fullLink = `myvendor.qzz.io/${profile.slug}`; // Change to .ng when live

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

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const name = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
            await supabase.storage.from('product-images').upload(name, file);
            imgUrl = supabase.storage.from('product-images').getPublicUrl(name).data.publicUrl;
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
        alert(e.message); 
        btn.disabled = false; 
        btn.innerText = "Save Product"; 
    }
};

window.loadProducts = async function() {
    const list = document.getElementById('productList');
    const { data: prods } = await supabase.from('products').select('*').eq('vendor_id', currentUser.id).order('created_at', {ascending: false});

    if (!prods || prods.length === 0) { 
        document.getElementById('emptyState').classList.remove('hidden'); 
        list.innerHTML = ''; 
        return; 
    }

    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = prods.map(p => {
        // Badges setup
        let badgeClass = 'stock-in';
        let badgeText = 'In Stock';

        if (p.status === 'pre_order') {
            badgeClass = 'bg-warning text-dark';
            badgeText = 'Pre-Order';
        } else if (p.status === 'out_of_stock' || p.in_stock === false) {
            badgeClass = 'stock-out';
            badgeText = 'Sold Out';
        }

        // Meta tags setup (Qty, Colors)
        let metaArr = [];
        if (p.category) metaArr.push(p.category);
        if (p.quantity) metaArr.push(`Qty: ${p.quantity}`);
        if (p.colors) metaArr.push(`Colors: ${p.colors}`);
        const metaText = metaArr.length > 0 ? metaArr.join(' • ') : 'No extra details';

        const imgHtml = p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%; height:100%; object-fit:cover;">` : '📦';

        return `
        <div class="product-card p-3 bg-white rounded-4 border mb-3">
            <div class="d-flex gap-3">
                <div style="width:70px; height:70px; background:#f1f5f9; border-radius:12px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                    ${imgHtml}
                </div>
                <div class="flex-grow-1 overflow-hidden">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="fw-bold small text-truncate pe-2">${p.title}</div>
                        <span class="stock-badge ${badgeClass} flex-shrink-0" style="font-size: 0.65rem; padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;">${badgeText}</span>
                    </div>
                    <div class="text-success fw-bold small mb-1">₦${parseFloat(p.price).toLocaleString()}</div>
                    <div class="text-muted" style="font-size: 0.7rem;">${metaText}</div>
                    
                    <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-sm btn-light border px-2 py-1" style="font-size:0.75rem; font-weight:600;" onclick="window.location.href='/dashboard/edit-product.html?id=${p.id}'"><i class="bi bi-pencil"></i> Edit</button>
                        <button class="btn btn-sm btn-light border px-2 py-1" style="font-size:0.75rem; font-weight:600;" onclick="copyProductLink('${p.id}')"><i class="bi bi-link"></i> Link</button>
                        <button class="btn btn-sm btn-danger px-2 py-1 text-white" style="font-size:0.75rem; font-weight:600; border:none;" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                    </div>
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

    // Fill basic details
    document.getElementById('editProdTitle').value = product.title || '';
    document.getElementById('editProdPrice').value = product.price || '';
    if(document.getElementById('editProdCategory')) document.getElementById('editProdCategory').value = product.category || 'Other';
    if(document.getElementById('editProdDesc')) document.getElementById('editProdDesc').value = product.description || '';

    // Fill the new Tags/Inventory details
    if(document.getElementById('editProdStatus')) {
        document.getElementById('editProdStatus').value = product.status || (product.in_stock ? 'in_stock' : 'out_of_stock');
    }
    if(document.getElementById('editProdQty')) document.getElementById('editProdQty').value = product.quantity || '';
    if(document.getElementById('editProdColors')) document.getElementById('editProdColors').value = product.colors || '';

    // Handle Image
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

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const name = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
            await supabase.storage.from('product-images').upload(name, file);
            finalImgUrl = supabase.storage.from('product-images').getPublicUrl(name).data.publicUrl;
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
    const { data: orders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });

    if (!orders || orders.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        list.innerHTML = '';
        return;
    }

    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = orders.map(o => `
        <div class="order-card p-3 bg-white rounded-4 border mb-3" data-status="${o.status}">
            <div class="d-flex justify-content-between mb-2">
                <div>
                    <div class="fw-bold" style="font-size: 0.9rem;">${o.id}</div>
                    <div class="text-muted" style="font-size: 0.75rem;">${new Date(o.created_at).toLocaleDateString()}</div>
                </div>
                <div class="text-end">
                    <div class="fw-bold text-success" style="font-size: 0.9rem;">₦${parseFloat(o.total_amount).toLocaleString()}</div>
                    <span class="badge-status status-${o.status}" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: 4px; text-transform: uppercase;">${o.status}</span>
                </div>
            </div>
            <div class="small mb-2" style="font-size: 0.85rem;"><strong>${o.customer_name}</strong>: <span class="text-muted">${o.items}</span></div>
            ${o.rider_name ? `<div class="rider-info mt-2" style="background:#f0fdf4;padding:8px;border-radius:8px;font-size:0.8rem; border:1px dashed #bbf7d0;"><strong>Rider:</strong> ${o.rider_name} (${o.rider_phone})</div>` : ''}
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-sm btn-success flex-grow-1" style="font-size: 0.8rem; font-weight: 600;" onclick="openStatusModal('${o.id}', '${o.status}')">Update Status</button>
                <button class="btn btn-sm btn-outline-success" style="font-size: 0.8rem; font-weight: 600;" onclick="copyTracking('${o.id}')">Copy Link</button>
            </div>
        </div>`).join('');
};

window.openCreateOrderModal = function() {
    document.getElementById('createOrderForm').reset();
    new bootstrap.Modal(document.getElementById('createOrderModal')).show();
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
        window.loadOrders();
        navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);

        const toast = document.getElementById('toastMsg');
        if (toast) {
            toast.innerText = "Order Created & Link Copied!";
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

window.filterOrders = function(status, pill) {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    document.querySelectorAll('.order-card').forEach(card => {
        card.style.display = (status === 'all' || card.dataset.status === status) ? 'block' : 'none';
    });
};

let currentOrderId = null;
window.openStatusModal = function(id, status) {
    currentOrderId = id;
    document.getElementById('statusSelect').value = status;
    const riderGroup = document.getElementById('riderDetailsGroup');
    if(riderGroup) riderGroup.style.display = status === 'shipped' ? 'block' : 'none';
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
    document.getElementById('setBizName').value = profile.business_name || '';
    document.getElementById('setSlug').value = profile.slug || '';
    document.getElementById('setWaNumber').value = profile.whatsapp_number || '';
    document.getElementById('setBio').value = profile.bio || '';
};

window.updateSettings = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveSettings');
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const { error } = await supabase.from('vendor_profiles').update({
            business_name: document.getElementById('setBizName').value,
            slug: document.getElementById('setSlug').value.toLowerCase().replace(/\s+/g, '-'), // Enforce valid slug format
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
    const { data: orders, error } = await supabase
        .from('orders')
        .select('total_amount, status')
        .eq('vendor_id', currentUser.id);

    if (error || !orders) return;

    let revenue = 0;
    let pendingCount = 0;

    orders.forEach(order => {
        // Only count 'delivered' orders toward total revenue
        if (order.status === 'delivered') {
            revenue += parseFloat(order.total_amount) || 0;
        }
        
        if (order.status === 'new' || order.status === 'processing') {
            pendingCount++;
        }
    });

    document.getElementById('totalRevenue').innerText = `₦${revenue.toLocaleString()}`;
    document.getElementById('totalOrders').innerText = orders.length;
    document.getElementById('pendingOrders').innerText = pendingCount;
};

// ─── RUN THE APP ──────────────────────────────────────────────────
initDashboard();