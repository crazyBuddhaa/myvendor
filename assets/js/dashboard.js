import { supabase, checkAuth } from './supabase.js';

// ─── 1. AUTH & INIT ──────────────────────────────────────────────
let currentUser = null;

async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return; 

    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
        const { data: profile } = await supabase.from('vendor_profiles').select('*').eq('id', currentUser.id).single();
        if (profile) {
            welcomeName.innerText = `Welcome, ${profile.business_name} 👋`;
            document.getElementById('storeLink').innerText = `myvendor.qzz.io/${profile.slug}`;
            const waMsg = encodeURIComponent(`Shop my latest collection here: https://myvendor.qzz.io/${profile.slug}`);
            document.getElementById('waShareBtn').href = `https://wa.me/?text=${waMsg}`;
            window.vendorSlug = profile.slug;
        }

        if (document.getElementById('statProducts')) {
            const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
            document.getElementById('statProducts').innerText = prodCount || 0;
        }
        
        if (document.getElementById('statOrders')) {
            const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
            document.getElementById('statOrders').innerText = orderCount || 0;
        }

        const recentOrdersList = document.getElementById('recentOrdersList');
        if (recentOrdersList) {
            const { data: recentOrders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false }).limit(3);
            if (!recentOrders || recentOrders.length === 0) {
                recentOrdersList.innerHTML = `<div class="text-center py-4"><p class="text-muted mt-2" style="font-size: 0.85rem;">No orders yet.</p></div>`;
            } else {
                let html = '';
                recentOrders.forEach(o => {
                    const date = new Date(o.created_at).toLocaleDateString();
                    html += `<div class="order-row"><div><div class="order-id">${o.id}</div><div class="order-date">${date}</div></div><div><div class="order-amount">₦${parseFloat(o.total_amount).toLocaleString()}</div><div class="status-badge status-${o.status} text-end mt-1">${o.status}</div></div></div>`;
                });
                recentOrdersList.innerHTML = html;
            }
        }
    }

    if (document.getElementById('productList')) {
        const { data } = await supabase.from('vendor_profiles').select('slug').eq('id', currentUser.id).single();
        if (data) window.vendorSlug = data.slug;
        await window.loadProducts();
    }

    if (document.getElementById('orderList')) {
        await window.loadOrders();
    }
}

// ─── 2. PRODUCT LOGIC (Add & Inventory) ──────────────────────────
window.saveProduct = async function(event) {
    event.preventDefault();
    const btnSave = document.getElementById('btnSave');
    btnSave.disabled = true;
    try {
        const title = document.getElementById('prodTitle').value;
        const price = document.getElementById('prodPrice').value;
        const category = document.getElementById('prodCategory').value;
        const desc = document.getElementById('prodDesc').value;
        const inStock = document.getElementById('stockSwitch').checked;
        const fileInput = document.getElementById('fileInput');
        let finalImageUrl = null;

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
            await supabase.storage.from('product-images').upload(fileName, file);
            finalImageUrl = supabase.storage.from('product-images').getPublicUrl(fileName).data.publicUrl;
        }

        await supabase.from('products').insert([{ vendor_id: currentUser.id, title, price, category, description: desc, in_stock: inStock, image_url: finalImageUrl }]);
        window.location.href = '/dashboard/products.html';
    } catch (e) { alert(e.message); btnSave.disabled = false; }
};

window.loadProducts = async function() {
    const { data: products } = await supabase.from('products').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });
    const list = document.getElementById('productList');
    if (!products || products.length === 0) { document.getElementById('emptyState').classList.remove('hidden'); return; }
    document.getElementById('emptyState').classList.add('hidden');
    list.innerHTML = products.map(p => `
        <div class="product-card">
            <div class="prod-img">${p.image_url ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '📦'}</div>
            <div class="prod-details">
                <div class="d-flex justify-content-between">
                    <div class="prod-title">${p.title}</div>
                    <div class="form-check form-switch"><input class="form-check-input" type="checkbox" ${p.in_stock ? 'checked' : ''} onchange="toggleStock('${p.id}', this.checked)"></div>
                </div>
                <div class="prod-price">₦${parseFloat(p.price).toLocaleString()}</div>
                <div class="prod-actions">
                    <button class="btn-action copy" onclick="copyProductLink('${p.id}')">Link</button>
                    <button class="btn-action delete" onclick="deleteProduct('${p.id}')">Delete</button>
                </div>
            </div>
        </div>`).join('');
};

window.toggleStock = async function(id, status) { await supabase.from('products').update({ in_stock: status }).eq('id', id); };
window.deleteProduct = async function(id) { if(confirm('Delete?')) { await supabase.from('products').delete().eq('id', id); window.loadProducts(); } };
window.copyProductLink = function(id) { 
    navigator.clipboard.writeText(`https://myvendor.qzz.io/product/?vendor=${window.vendorSlug}&id=${id}`);
    alert('Link copied!');
};

// ─── 3. ORDER LOGIC (Orders Page) ───────────────────────────────
window.loadOrders = async function() {
    const { data: orders } = await supabase.from('orders').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });
    const list = document.getElementById('orderList');
    if (!orders || orders.length === 0) { document.getElementById('emptyState').classList.remove('hidden'); return; }
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
                <button class="btn-action update" onclick="openStatusModal('${o.id}', '${o.status}')">Update Status</button>
                <button class="btn-action copy" onclick="copyTracking('${o.id}')">Copy Link</button>
            </div>
        </div>`).join('');
};

window.handleCreateOrder = async function(e) {
    e.preventDefault();
    const id = `MV-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
    const customer = document.getElementById('newCustomerName').value;
    const items = document.getElementById('newOrderItems').value;
    const total = document.getElementById('newOrderTotal').value;
    await supabase.from('orders').insert([{ id, vendor_id: currentUser.id, customer_name: customer, items, total_amount: total, status: 'new' }]);
    bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
    window.loadOrders();
    navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
    alert('Order created & link copied!');
};

window.copyTracking = function(id) { navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`); alert('Link copied!'); };

// Filtering Logic
window.filterOrders = function(status, pill) {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    document.querySelectorAll('.order-card').forEach(card => {
        card.style.display = (status === 'all' || card.dataset.status === status) ? 'block' : 'none';
    });
};

// Status Update Modal Logic
let currentUpdateId = null;
window.openStatusModal = function(id, status) {
    currentUpdateId = id;
    document.getElementById('statusSelect').value = status;
    const modal = new bootstrap.Modal(document.getElementById('statusModal'));
    modal.show();
};

window.saveStatus = async function() {
    const status = document.getElementById('statusSelect').value;
    const riderName = document.getElementById('riderName').value;
    const riderPhone = document.getElementById('riderPhone').value;
    
    await supabase.from('orders').update({ status, rider_name: riderName, rider_phone: riderPhone }).eq('id', currentUpdateId);
    bootstrap.Modal.getInstance(document.getElementById('statusModal')).hide();
    window.loadOrders();
};

// Toggle Rider Inputs based on Status
const statusSelect = document.getElementById('statusSelect');
if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
        document.getElementById('riderDetailsGroup').style.display = e.target.value === 'shipped' ? 'block' : 'none';
    });
}

// ─── 4. UI MISC ──────────────────────────────────────────────────
window.previewImage = function(i) {
    if(i.files[0]) {
        let r = new FileReader();
        r.onload = e => { document.getElementById('imagePreview').src = e.target.result; document.getElementById('imagePreview').style.display='block'; document.getElementById('removeImgBtn').style.display='flex'; };
        r.readAsDataURL(i.files[0]);
    }
};

window.toggleVariants = function() { document.getElementById('variantsBox').classList.toggle('hidden', !document.getElementById('variantSwitch').checked); };

initDashboard();