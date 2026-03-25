import { supabase, checkAuth } from './supabase.js';

// ─── 1. AUTH & INITIALIZATION ─────────────────────────────────────
let currentUser = null;

async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return; 

    // --- HOME PAGE LOGIC (Stats & Recent Orders) ---
    if (document.getElementById('statProducts')) {
        // 1. Get Product Count
        const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        document.getElementById('statProducts').innerText = pCount || 0;

        // 2. Get Order Count
        const { count: oCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        document.getElementById('statOrders').innerText = oCount || 0;

        // 3. Load Recent Orders
        const recentList = document.getElementById('recentOrdersList');
        if (recentList) {
            const { data: recents } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false }).limit(3);
            if (!recents || recents.length === 0) {
                recentList.innerHTML = `<div class="text-center py-4 text-muted" style="font-size:0.8rem;">No orders yet.</div>`;
            } else {
                recentList.innerHTML = recents.map(o => `
                    <div class="order-row d-flex justify-content-between align-items-center" style="padding: 12px 0; border-bottom: 1px solid #eee;">
                        <div>
                            <div style="font-weight:700; font-size:0.9rem;">${o.id}</div>
                            <div style="font-size:0.75rem; color:gray;">${o.customer_name}</div>
                        </div>
                        <div class="text-end">
                            <div style="font-weight:700; color:var(--green);">₦${parseFloat(o.total_amount).toLocaleString()}</div>
                            <div class="status-badge status-${o.status}" style="font-size:0.65rem;">${o.status}</div>
                        </div>
                    </div>`).join('');
            }
        }

        // 4. Vendor Profile
        const { data: profile } = await supabase.from('vendor_profiles').select('business_name, slug').eq('id', currentUser.id).single();
        if (profile) {
            if(document.getElementById('welcomeName')) document.getElementById('welcomeName').innerText = `Welcome, ${profile.business_name} 👋`;
            if(document.getElementById('storeLink')) document.getElementById('storeLink').innerText = `myvendor.qzz.io/${profile.slug}`;
            window.vendorSlug = profile.slug;
        }
    }

    // --- INVENTORY PAGE LOADER ---
    if (document.getElementById('productList')) {
        const { data: profile } = await supabase.from('vendor_profiles').select('slug').eq('id', currentUser.id).single();
        if (profile) window.vendorSlug = profile.slug;
        await window.loadProducts();
    }

    // --- ORDERS PAGE LOADER ---
    if (document.getElementById('orderList')) {
        await window.loadOrders();
    }
}

// ─── 2. INVENTORY & PRODUCT LOGIC ──────────────────────────────────
window.loadProducts = async function() {
    const list = document.getElementById('productList');
    const { data: prods } = await supabase.from('products').select('*').eq('vendor_id', currentUser.id).order('created_at', {ascending: false});
    
    if (!prods || prods.length === 0) { 
        document.getElementById('emptyState').classList.remove('hidden'); 
        list.innerHTML = ''; 
        return; 
    }
    
    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = prods.map(p => `
        <div class="product-card">
            <div class="prod-img">${p.image_url ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '📦'}</div>
            <div class="prod-details">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="prod-title">${p.title}</div>
                    <div class="form-check form-switch" style="padding-left: 2.5em;">
                        <input class="form-check-input" type="checkbox" role="switch" ${p.in_stock ? 'checked' : ''} onchange="toggleStock('${p.id}', this.checked)">
                    </div>
                </div>
                <div class="prod-price">₦${parseFloat(p.price).toLocaleString()}</div>
                <div style="font-size:0.75rem; font-weight:700;" id="status-${p.id}" class="${p.in_stock ? 'text-success' : 'text-danger'}">${p.in_stock ? 'In Stock' : 'Out of Stock'}</div>
                <div class="prod-actions mt-2">
                    <button class="btn-action copy" onclick="copyProductLink('${p.id}')"><i class="bi bi-link-45deg"></i> Link</button>
                    <button class="btn-action delete" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        </div>`).join('');
};

window.toggleStock = async function(id, isChecked) {
    const label = document.getElementById(`status-${id}`);
    label.innerText = isChecked ? "In Stock" : "Out of Stock";
    label.className = isChecked ? "text-success" : "text-danger";
    await supabase.from('products').update({ in_stock: isChecked }).eq('id', id);
};

window.copyProductLink = function(id) {
    const link = `https://myvendor.qzz.io/product/?vendor=${window.vendorSlug}&id=${id}`;
    navigator.clipboard.writeText(link);
    alert("Product link copied!");
};

window.deleteProduct = async function(id) {
    if(confirm("Delete permanently?")) {
        await supabase.from('products').delete().eq('id', id);
        window.loadProducts();
    }
};

// ─── 3. ORDER MANAGEMENT ──────────────────────────────────────────
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
        <div class="order-card" data-status="${o.status}">
            <div class="order-header d-flex justify-content-between">
                <div><div class="order-id">${o.id}</div><div class="order-date">${new Date(o.created_at).toLocaleDateString()}</div></div>
                <div class="text-end"><div class="order-amount">₦${parseFloat(o.total_amount).toLocaleString()}</div><span class="status-badge status-${o.status}">${o.status}</span></div>
            </div>
            <div class="customer-info mt-2"><strong>${o.customer_name}</strong><div class="item-summary">${o.items}</div></div>
            ${o.rider_name ? `<div class="rider-info mt-2" style="background:#f0fdf4;padding:8px;border-radius:8px;font-size:0.8rem;">Rider: ${o.rider_name} (${o.rider_phone})</div>` : ''}
            <div class="order-actions mt-3 d-grid" style="grid-template-columns:1fr 1fr; gap:8px;">
                <button class="btn-action update" onclick="openStatusModal('${o.id}', '${o.status}')">Update</button>
                <button class="btn-action copy" onclick="copyTracking('${o.id}')">Link</button>
            </div>
        </div>`).join('');
};

window.handleCreateOrder = async function(e) {
    e.preventDefault();
    const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
    const { error } = await supabase.from('orders').insert([{ 
        id, 
        vendor_id: currentUser.id, 
        customer_name: document.getElementById('newCustomerName').value, 
        items: document.getElementById('newOrderItems').value, 
        total_amount: document.getElementById('newOrderTotal').value, 
        status: 'new' 
    }]);

    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        window.loadOrders();
        navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
        alert('Order Saved! Link copied.');
    } else { alert(error.message); }
};

window.copyTracking = function(id) {
    navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
    alert("Tracking link copied!");
};

window.saveProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    try {
        const file = document.getElementById('fileInput').files[0];
        let url = null;
        if(file) {
            const name = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
            await supabase.storage.from('product-images').upload(name, file);
            url = supabase.storage.from('product-images').getPublicUrl(name).data.publicUrl;
        }
        await supabase.from('products').insert([{
            vendor_id: currentUser.id,
            title: document.getElementById('prodTitle').value,
            price: document.getElementById('prodPrice').value,
            category: document.getElementById('prodCategory').value,
            description: document.getElementById('prodDesc').value,
            in_stock: document.getElementById('stockSwitch').checked,
            image_url: url
        }]);
        window.location.href = "/dashboard/products.html";
    } catch(err) { alert(err.message); btn.disabled = false; }
};

initDashboard();