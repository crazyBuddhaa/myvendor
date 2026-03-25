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
        
        // Populate Home UI if elements exist
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

    // C. LOAD INVENTORY & ORDERS PAGES
    if (document.getElementById('productList')) await window.loadProducts();
    if (document.getElementById('orderList')) await window.loadOrders();
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
        <div class="order-row">
          <div>
            <div class="order-id">${o.id}</div>
            <div class="order-date">${date}</div>
          </div>
          <div>
            <div class="order-amount">₦${parseFloat(o.total_amount).toLocaleString()}</div>
            <div class="badge-status status-${o.status} text-end mt-1">${o.status}</div>
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
        const checked = p.in_stock ? 'checked' : '';
        const statusClass = p.in_stock ? 'text-success' : 'text-danger';
        const statusText = p.in_stock ? 'In Stock' : 'Out of Stock';

        return `
        <div class="product-card p-3 bg-white rounded-4 border mb-3">
            <div class="d-flex gap-3">
                <div style="width:70px;height:70px;background:#f1f5f9;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    ${p.image_url ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;">` : '📦'}
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between">
                        <div class="fw-bold small" style="font-size: 0.9rem;">${p.title}</div>
                        <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" ${checked} onchange="toggleStock('${p.id}', this.checked)"></div>
                    </div>
                    <div class="text-success fw-bold small mb-1">₦${parseFloat(p.price).toLocaleString()}</div>
                    <div id="status-${p.id}" class="extra-small ${statusClass} fw-bold" style="font-size: 0.75rem;">${statusText}</div>
                    <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-sm btn-light border px-2 py-1 extra-small" onclick="copyProductLink('${p.id}')"><i class="bi bi-link"></i> Link</button>
                        <button class="btn btn-sm btn-light border px-2 py-1 extra-small text-danger" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.toggleStock = async function(id, isChecked) {
    const label = document.getElementById(`status-${id}`);
    label.innerText = isChecked ? "In Stock" : "Out of Stock";
    label.className = `extra-small ${isChecked ? 'text-success' : 'text-danger'} fw-bold`;
    await supabase.from('products').update({ in_stock: isChecked }).eq('id', id);
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

// ─── 4. ORDER MANAGEMENT LOGIC ────────────────────────────────────
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
                    <span class="badge-status status-${o.status}">${o.status}</span>
                </div>
            </div>
            <div class="small mb-2" style="font-size: 0.85rem;"><strong>${o.customer_name}</strong>: <span class="text-muted">${o.items}</span></div>
            ${o.rider_name ? `<div class="rider-info mt-2" style="background:#f0fdf4;padding:8px;border-radius:8px;font-size:0.8rem; border:1px solid #dcfce7;">Rider: ${o.rider_name} (${o.rider_phone})</div>` : ''}
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-sm btn-success flex-grow-1" style="font-size: 0.8rem; font-weight: 600;" onclick="openStatusModal('${o.id}', '${o.status}')">Update Status</button>
                <button class="btn btn-sm btn-outline-success" style="font-size: 0.8rem; font-weight: 600;" onclick="copyTracking('${o.id}')">Copy Link</button>
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
        if(document.getElementById('createOrderModal')) {
            bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        }
        window.loadOrders();
        navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
        alert('Order Created & Link Copied!');
    } else { 
        alert(error.message); 
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

// Filter & Status Modals
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

// ─── 5. UI HELPERS (Add Product Page) ─────────────────────────────
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

window.toggleVariants = function() { 
    const box = document.getElementById('variantsBox');
    if(box) box.classList.toggle('hidden', !document.getElementById('variantSwitch').checked); 
};

// ─── RUN THE APP ──────────────────────────────────────────────────
initDashboard();