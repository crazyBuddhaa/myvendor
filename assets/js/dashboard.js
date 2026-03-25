import { supabase, checkAuth } from './supabase.js';

// ─── 1. CORE AUTH & ROUTING ──────────────────────────────────────
let currentUser = null;

async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return; 

    // --- SHARED PROFILE DATA ---
    const { data: profile } = await supabase.from('vendor_profiles').select('business_name, slug').eq('id', currentUser.id).single();
    if (profile) window.vendorSlug = profile.slug;

    // --- HOME PAGE BRAIN ---
    if (document.getElementById('statProducts')) {
        const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        const { count: oCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        document.getElementById('statProducts').innerText = pCount || 0;
        document.getElementById('statOrders').innerText = oCount || 0;
        if(document.getElementById('welcomeName')) document.getElementById('welcomeName').innerText = `Welcome, ${profile.business_name} 👋`;
        if(document.getElementById('storeLink')) document.getElementById('storeLink').innerText = `myvendor.qzz.io/${profile.slug}`;
        
        // Home Page Recent Orders Preview
        const recentList = document.getElementById('recentOrdersList');
        if (recentList) {
            const { data: recents } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false }).limit(3);
            if (!recents || recents.length === 0) {
                recentList.innerHTML = `<div class="text-center py-3 text-muted">No orders yet.</div>`;
            } else {
                recentList.innerHTML = recents.map(o => `<div class="d-flex justify-content-between py-2 border-bottom"><div><div class="fw-bold small">${o.id}</div><div class="extra-small text-muted">${o.customer_name}</div></div><div class="text-end"><div class="fw-bold text-success small">₦${parseFloat(o.total_amount).toLocaleString()}</div><span class="status-badge status-${o.status}" style="font-size:0.6rem;">${o.status}</span></div></div>`).join('');
            }
        }
    }

    // --- INVENTORY PAGE BRAIN ---
    if (document.getElementById('productList')) {
        await window.loadProducts();
    }

    // --- ORDERS PAGE BRAIN ---
    if (document.getElementById('orderList')) {
        await window.loadOrders();
    }
}

// ─── 2. INVENTORY FUNCTIONS ──────────────────────────────────────
window.loadProducts = async function() {
    const list = document.getElementById('productList');
    const { data: prods } = await supabase.from('products').select('*').eq('vendor_id', currentUser.id).order('created_at', {ascending: false});
    if (!prods || prods.length === 0) { document.getElementById('emptyState').classList.remove('hidden'); list.innerHTML = ''; return; }
    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = prods.map(p => `
        <div class="product-card p-3 bg-white rounded-4 border mb-3">
            <div class="d-flex gap-3">
                <div style="width:70px;height:70px;background:#f1f5f9;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    ${p.image_url ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;">` : '📦'}
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between">
                        <div class="fw-bold small">${p.title}</div>
                        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" ${p.in_stock ? 'checked' : ''} onchange="toggleStock('${p.id}', this.checked)"></div>
                    </div>
                    <div class="text-success fw-bold small">₦${parseFloat(p.price).toLocaleString()}</div>
                    <div id="status-${p.id}" class="extra-small ${p.in_stock ? 'text-success' : 'text-danger'} fw-bold">${p.in_stock ? 'In Stock' : 'Out of Stock'}</div>
                    <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-sm btn-light border px-2 py-1 extra-small" onclick="copyProductLink('${p.id}')">Link</button>
                        <button class="btn btn-sm btn-light border px-2 py-1 extra-small text-danger" onclick="deleteProduct('${p.id}')">Delete</button>
                    </div>
                </div>
            </div>
        </div>`).join('');
};

window.toggleStock = async function(id, check) {
    const label = document.getElementById(`status-${id}`);
    label.innerText = check ? "In Stock" : "Out of Stock";
    label.className = `extra-small ${check ? 'text-success' : 'text-danger'} fw-bold`;
    await supabase.from('products').update({ in_stock: check }).eq('id', id);
};

// ─── 3. ORDER FUNCTIONS ──────────────────────────────────────────
window.loadOrders = async function() {
    const { data: orders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });
    const list = document.getElementById('orderList');
    if (!orders || orders.length === 0) { document.getElementById('emptyState').classList.remove('hidden'); list.innerHTML = ''; return; }
    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = orders.map(o => `
        <div class="order-card p-3 bg-white rounded-4 border mb-3" data-status="${o.status}">
            <div class="d-flex justify-content-between mb-2">
                <div><div class="fw-bold small">${o.id}</div><div class="extra-small text-muted">${new Date(o.created_at).toLocaleDateString()}</div></div>
                <div class="text-end"><div class="fw-bold text-success small">₦${parseFloat(o.total_amount).toLocaleString()}</div><span class="status-badge status-${o.status}">${o.status}</span></div>
            </div>
            <div class="small mb-2"><strong>${o.customer_name}</strong>: <span class="text-muted">${o.items}</span></div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success flex-grow-1 extra-small" onclick="openStatusModal('${o.id}', '${o.status}')">Update Status</button>
                <button class="btn btn-sm btn-outline-success extra-small" onclick="copyTracking('${o.id}')">Link</button>
            </div>
        </div>`).join('');
};

window.handleCreateOrder = async function(e) {
    e.preventDefault();
    const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
    await supabase.from('orders').insert([{ 
        id, vendor_id: currentUser.id, customer_name: document.getElementById('newCustomerName').value, 
        items: document.getElementById('newOrderItems').value, total_amount: document.getElementById('newOrderTotal').value, status: 'new' 
    }]);
    bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
    window.loadOrders();
    navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
    alert("Saved & Copied!");
};

// --- GLOBAL HELPERS ---
window.copyProductLink = (id) => { navigator.clipboard.writeText(`https://myvendor.qzz.io/product/?vendor=${window.vendorSlug}&id=${id}`); alert("Copied!"); };
window.copyTracking = (id) => { navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`); alert("Copied!"); };
window.deleteProduct = async (id) => { if(confirm("Delete?")) { await supabase.from('products').delete().eq('id', id); window.loadProducts(); } };

initDashboard();