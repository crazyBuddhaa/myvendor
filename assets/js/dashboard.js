import { supabase, checkAuth } from './supabase.js';

let currentUser = null;

// ─── 1. CORE INITIALIZATION ───────────────────────────────────────
async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return;

    // A. FETCH PROFILE & SETTINGS
    const { data: profile } = await supabase.from('vendor_profiles').select('*').eq('id', currentUser.id).single();
    if (profile) {
        window.vendorSlug = profile.slug;
        const fullLink = `myvendor.qzz.io/${profile.slug}`;
        
        if (document.getElementById('welcomeName')) document.getElementById('welcomeName').innerText = `Welcome, ${profile.business_name} 👋`;
        if (document.getElementById('storeLink')) document.getElementById('storeLink').innerText = fullLink;
        if (document.getElementById('waShareBtn')) {
            const waMsg = encodeURIComponent(`Shop my latest collection here: https://${fullLink}`);
            document.getElementById('waShareBtn').href = `https://wa.me/?text=${waMsg}`;
        }

        // Settings Page Auto-fill
        if (document.getElementById('settingsForm')) {
            document.getElementById('settingsLoading')?.classList.add('d-none');
            document.getElementById('settingsForm').classList.remove('d-none');
            document.getElementById('setBizName').value = profile.business_name;
            document.getElementById('setPhone').value = profile.phone || '';
            document.getElementById('setSlug').value = profile.slug;
        }
    }

    // B. LOAD HOME ANALYTICS
    if (document.getElementById('statRevenue')) {
        await loadSalesAnalytics();
        await loadRecentOrders();
    }

    // C. PAGE SPECIFIC LOADERS
    if (document.getElementById('productList')) await window.loadProducts();
    if (document.getElementById('orderList')) await window.loadOrders();
    if (document.getElementById('editProductForm')) await window.loadEditProduct();
}

// ─── 2. SALES ANALYTICS LOGIC ─────────────────────────────────────
async function loadSalesAnalytics() {
    const { data: orders } = await supabase.from('orders').select('total_amount, status').eq('vendor_id', currentUser.id);

    if (orders) {
        // Calculate Total Revenue (Excluding Cancelled)
        const revenue = orders
            .filter(o => o.status !== 'cancelled')
            .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        
        // Count Statuses
        const completedCount = orders.filter(o => o.status === 'delivered').length;
        const pendingCount = orders.filter(o => ['new', 'processing', 'shipped'].includes(o.status)).length;

        // Update UI
        if (document.getElementById('statRevenue')) document.getElementById('statRevenue').innerText = `₦${revenue.toLocaleString()}`;
        if (document.getElementById('statOrders')) document.getElementById('statOrders').innerText = completedCount;
        if (document.getElementById('statPending')) document.getElementById('statPending').innerText = pendingCount;
    }
}

// ─── 3. SETTINGS & PROFILE ────────────────────────────────────────
window.updateSettings = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnUpdateSettings');
    btn.disabled = true; btn.innerText = "Updating...";

    const { error } = await supabase.from('vendor_profiles').update({
        business_name: document.getElementById('setBizName').value,
        phone: document.getElementById('setPhone').value
    }).eq('id', currentUser.id);

    if (!error) {
        alert("Settings updated!");
        window.location.href = '/dashboard/home.html';
    } else {
        alert(error.message);
        btn.disabled = false; btn.innerText = "Update Profile";
    }
};

window.handleLogout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/dashboard/index.html';
};

// ─── 4. PRODUCT MANAGEMENT (ADD / EDIT / LIST) ─────────────────────
window.saveProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave');
    btn.disabled = true; btn.innerText = "Saving...";
    
    try {
        const fileInput = document.getElementById('fileInput');
        let imgUrl = null;
        if (fileInput?.files[0]) {
            const file = fileInput.files[0];
            const name = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
            await supabase.storage.from('product-images').upload(name, file);
            imgUrl = supabase.storage.from('product-images').getPublicUrl(name).data.publicUrl;
        }

        const status = document.getElementById('prodStatus').value;
        await supabase.from('products').insert([{ 
            vendor_id: currentUser.id, 
            title: document.getElementById('prodTitle').value, 
            price: document.getElementById('prodPrice').value, 
            category: document.getElementById('prodCategory').value,
            description: document.getElementById('prodDesc').value,
            status: status,
            quantity: document.getElementById('prodQty').value ? parseInt(document.getElementById('prodQty').value) : null,
            colors: document.getElementById('prodColors').value,
            in_stock: (status !== 'out_of_stock'),
            image_url: imgUrl 
        }]);
        window.location.href = '/dashboard/products.html';
    } catch (err) { alert(err.message); btn.disabled = false; btn.innerText = "Save Product"; }
};

window.loadProducts = async function() {
    const list = document.getElementById('productList');
    const { data: prods } = await supabase.from('products').select('*').eq('vendor_id', currentUser.id).order('created_at', {ascending: false});
    
    if (!prods?.length) { document.getElementById('emptyState').classList.remove('hidden'); list.innerHTML = ''; return; }
    
    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = prods.map(p => `
        <div class="product-card p-3 bg-white rounded-4 border mb-3">
            <div class="d-flex gap-3">
                <div style="width:70px; height:70px; background:#f1f5f9; border-radius:12px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                    ${p.image_url ? `<img src="${p.image_url}" style="width:100%; height:100%; object-fit:cover;">` : '📦'}
                </div>
                <div class="flex-grow-1 overflow-hidden">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="fw-bold small text-truncate pe-2">${p.title}</div>
                        <span class="stock-badge ${p.status === 'pre_order' ? 'bg-warning text-dark' : (p.status === 'out_of_stock' ? 'stock-out' : 'stock-in')} flex-shrink-0" style="font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${p.status.replace('_',' ')}</span>
                    </div>
                    <div class="text-success fw-bold small">₦${parseFloat(p.price).toLocaleString()}</div>
                    <div class="text-muted extra-small" style="font-size: 0.7rem;">${p.category} ${p.quantity ? ' • Qty: '+p.quantity : ''}</div>
                    <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-sm btn-light border px-2 py-1" style="font-size:0.75rem;" onclick="window.location.href='/dashboard/edit-product.html?id=${p.id}'"><i class="bi bi-pencil"></i> Edit</button>
                        <button class="btn btn-sm btn-light border px-2 py-1" style="font-size:0.75rem;" onclick="copyProductLink('${p.id}')"><i class="bi bi-link"></i> Link</button>
                        <button class="btn btn-sm btn-danger px-2 py-1 border-0" style="font-size:0.75rem;" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>`).join('');
};

window.loadEditProduct = async function() {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
    if (p) {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('editProductForm').classList.remove('hidden');
        document.getElementById('editProdTitle').value = p.title;
        document.getElementById('editProdPrice').value = p.price;
        document.getElementById('editProdStatus').value = p.status;
        document.getElementById('editProdQty').value = p.quantity || '';
        document.getElementById('editProdColors').value = p.colors || '';
        document.getElementById('editProdCategory').value = p.category;
        document.getElementById('editProdDesc').value = p.description || '';
        if (p.image_url) {
            window.currentExistingImageUrl = p.image_url;
            document.getElementById('editImagePreview').src = p.image_url;
            document.getElementById('editImagePreview').style.display = 'block';
            document.getElementById('editRemoveImgBtn').classList.remove('hidden');
        }
    }
};

window.updateProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnUpdate');
    btn.disabled = true; btn.innerText = "Updating...";
    const id = new URLSearchParams(window.location.search).get('id');
    
    let imgUrl = window.currentExistingImageUrl;
    const fileInput = document.getElementById('editFileInput');
    if (fileInput?.files[0]) {
        const file = fileInput.files[0];
        const name = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
        await supabase.storage.from('product-images').upload(name, file);
        imgUrl = supabase.storage.from('product-images').getPublicUrl(name).data.publicUrl;
    }

    const status = document.getElementById('editProdStatus').value;
    await supabase.from('products').update({
        title: document.getElementById('editProdTitle').value,
        price: document.getElementById('editProdPrice').value,
        status: status,
        quantity: document.getElementById('editProdQty').value ? parseInt(document.getElementById('editProdQty').value) : null,
        colors: document.getElementById('editProdColors').value,
        category: document.getElementById('editProdCategory').value,
        description: document.getElementById('editProdDesc').value,
        in_stock: (status !== 'out_of_stock'),
        image_url: imgUrl
    }).eq('id', id);
    window.location.href = '/dashboard/products.html';
};

// ─── 5. ORDER MANAGEMENT ──────────────────────────────────────────
window.loadOrders = async function() {
    const list = document.getElementById('orderList');
    const { data: orders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });
    if (!orders?.length) { document.getElementById('emptyState').classList.remove('hidden'); return; }
    
    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = orders.map(o => `
        <div class="order-card p-3 bg-white rounded-4 border mb-3" data-status="${o.status}">
            <div class="d-flex justify-content-between mb-2">
                <div><div class="fw-bold small">${o.id}</div><div class="text-muted extra-small">${new Date(o.created_at).toLocaleDateString()}</div></div>
                <div class="text-end"><div class="fw-bold text-success small">₦${parseFloat(o.total_amount).toLocaleString()}</div><span class="badge-status status-${o.status}" style="font-size:0.6rem; padding:2px 6px; border-radius:4px;">${o.status}</span></div>
            </div>
            <div class="small mb-2"><strong>${o.customer_name}</strong>: <span class="text-muted">${o.items}</span></div>
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-sm btn-success flex-grow-1 fw-bold" style="font-size:0.75rem;" onclick="openStatusModal('${o.id}', '${o.status}')">Status</button>
                <button class="btn btn-sm btn-outline-success fw-bold" style="font-size:0.75rem;" onclick="copyTracking('${o.id}')">Link</button>
            </div>
        </div>`).join('');
};

window.handleCreateOrder = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    
    const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
    await supabase.from('orders').insert([{ 
        id, vendor_id: currentUser.id, customer_name: document.getElementById('newCustomerName').value, 
        items: document.getElementById('newOrderItems').value, total_amount: document.getElementById('newOrderTotal').value, status: 'new' 
    }]);
    window.location.reload();
};

// ─── HELPER UI FUNCTIONS ──────────────────────────────────────────
window.previewImage = (i) => { if(i.files[0]) { let r = new FileReader(); r.onload = e => { document.getElementById('imagePreview').src = e.target.result; document.getElementById('imagePreview').style.display = 'block'; }; r.readAsDataURL(i.files[0]); } };
window.copyProductLink = (id) => { navigator.clipboard.writeText(`https://myvendor.qzz.io/product/?vendor=${window.vendorSlug}&id=${id}`); alert("Link copied!"); };
window.copyTracking = (id) => { navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`); alert("Tracking link copied!"); };
window.deleteProduct = async (id) => { if(confirm("Delete permanently?")) { await supabase.from('products').delete().eq('id', id); window.loadProducts(); } };

async function loadRecentOrders() {
    const list = document.getElementById('recentOrdersList');
    if (!list) return;
    const { data } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).limit(3).order('created_at', {ascending: false});
    if (data?.length) {
        list.innerHTML = data.map(o => `<div class="d-flex justify-content-between py-2 border-bottom"><div class="small fw-bold">${o.id}</div><div class="text-success small fw-bold">₦${parseFloat(o.total_amount).toLocaleString()}</div></div>`).join('');
    }
}

initDashboard();