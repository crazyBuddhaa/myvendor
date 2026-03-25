import { supabase, checkAuth } from './supabase.js';

// ─── 1. AUTH & INIT ──────────────────────────────────────────────
let currentUser = null;

async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return; 

    // --- HOME PAGE LOGIC ---
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
        // 1. Load Vendor Profile
        const { data: profile } = await supabase.from('vendor_profiles').select('*').eq('id', currentUser.id).single();
        if (profile) {
            welcomeName.innerText = `Welcome, ${profile.business_name} 👋`;
            document.getElementById('storeLink').innerText = `myvendor.qzz.io/${profile.slug}`;
            const waMsg = encodeURIComponent(`Shop my latest collection here: https://myvendor.qzz.io/${profile.slug}`);
            document.getElementById('waShareBtn').href = `https://wa.me/?text=${waMsg}`;
            window.vendorSlug = profile.slug;
        }

        // 2. Load Stats (Count Products & Orders)
        if (document.getElementById('statProducts')) {
            const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
            document.getElementById('statProducts').innerText = prodCount || 0;
        }
        
        if (document.getElementById('statOrders')) {
            const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
            document.getElementById('statOrders').innerText = orderCount || 0;
        }

        // 3. Load Recent Orders
        const recentOrdersList = document.getElementById('recentOrdersList');
        if (recentOrdersList) {
            const { data: recentOrders } = await supabase
                .from('orders')
                .select('*')
                .eq('vendor_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(3);

            if (!recentOrders || recentOrders.length === 0) {
                recentOrdersList.innerHTML = `
                <div id="emptyOrders" class="text-center py-4">
                  <i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i>
                  <p class="text-muted mt-2" style="font-size: 0.85rem;">No orders yet. Share your store link!</p>
                </div>`;
            } else {
                let html = '';
                recentOrders.forEach(o => {
                    const date = new Date(o.created_at).toLocaleDateString();
                    html += `
                    <div class="order-row">
                      <div>
                        <div class="order-id">${o.id}</div>
                        <div class="order-date">${date}</div>
                      </div>
                      <div>
                        <div class="order-amount">₦${parseFloat(o.total_amount).toLocaleString()}</div>
                        <div class="badge-status status-${o.status} text-end mt-1" style="text-transform: capitalize;">${o.status}</div>
                      </div>
                    </div>`;
                });
                recentOrdersList.innerHTML = html;
            }
        }
    }

    // --- INVENTORY PAGE LOGIC ---
    const productList = document.getElementById('productList');
    if (productList) {
        const { data } = await supabase.from('vendor_profiles').select('slug').eq('id', currentUser.id).single();
        if (data) window.vendorSlug = data.slug;
        await window.loadProducts();
    }
}

// ─── 2. SAVE PRODUCT LOGIC (Add Product Page) ────────────────────
window.saveProduct = async function(event) {
    event.preventDefault();
    if (!currentUser) return;

    const btnSave = document.getElementById('btnSave');
    const spinner = document.getElementById('saveSpinner');
    const icon = document.getElementById('saveIcon');
    const label = document.getElementById('saveLabel');
    
    btnSave.disabled = true;
    spinner.style.display = 'block';
    icon.style.display = 'none';
    label.innerText = 'Uploading...';

    try {
        const title = document.getElementById('prodTitle').value;
        const price = document.getElementById('prodPrice').value;
        const category = document.getElementById('prodCategory').value;
        const desc = document.getElementById('prodDesc').value;
        const inStock = document.getElementById('stockSwitch').checked;
        
        let variantsJson = [];
        if(document.getElementById('variantSwitch') && document.getElementById('variantSwitch').checked) {
            const sizes = document.getElementById('varSizes').value.split(',').map(s => s.trim()).filter(Boolean);
            const colors = document.getElementById('varColors').value.split(',').map(c => c.trim()).filter(Boolean);
            if(sizes.length > 0) variantsJson.push({ name: "Size", options: sizes });
            if(colors.length > 0) variantsJson.push({ name: "Color", options: colors });
        }

        const fileInput = document.getElementById('fileInput');
        let finalImageUrl = null;

        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, file);
            if (uploadError) throw uploadError;
            const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
            finalImageUrl = publicUrlData.publicUrl;
        }

        const { error: dbError } = await supabase.from('products').insert([{
            vendor_id: currentUser.id,
            title: title,
            price: price,
            category: category,
            description: desc,
            in_stock: inStock,
            variants: variantsJson.length > 0 ? variantsJson : null,
            image_url: finalImageUrl
        }]);

        if (dbError) throw dbError;
        window.location.href = '/dashboard/products.html';

    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
        btnSave.disabled = false;
        spinner.style.display = 'none';
        icon.style.display = 'inline';
        label.innerText = 'Save Product';
    }
};

// ─── 3. UI HELPERS (Add Product Page) ──────────────────────────
window.previewImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
            document.getElementById('removeImgBtn').style.display = 'flex';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

window.clearImage = function(e) {
    e.preventDefault();
    document.getElementById('fileInput').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('removeImgBtn').style.display = 'none';
}

window.toggleVariants = function() {
    const isChecked = document.getElementById('variantSwitch').checked;
    document.getElementById('variantsBox').classList.toggle('hidden', !isChecked);
}

// ─── 4. INVENTORY LOGIC (Products Page) ──────────────────────────
window.loadProducts = async function() {
    const productList = document.getElementById('productList');
    const emptyState = document.getElementById('emptyState');
    if (!productList) return;

    productList.innerHTML = '<div class="text-center py-4 text-muted">Loading your products...</div>';

    const { data: products, error } = await supabase.from('products').select('*').eq('vendor_id', currentUser.id).order('created_at', { ascending: false });

    if (error || !products || products.length === 0) {
        productList.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    
    let html = '';
    products.forEach(p => {
        const checked = p.in_stock ? 'checked' : '';
        const statusText = p.in_stock ? 'In Stock' : 'Sold Out';
        const imgHtml = p.image_url ? `<img src="${p.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">` : `<span style="font-size:2rem;">📦</span>`;

        html += `
        <div class="product-card" data-category="${p.category || 'other'}">
            <div class="prod-img" style="background:#f1f5f9; overflow:hidden; display:flex; align-items:center; justify-content:center;">${imgHtml}</div>
            <div class="prod-details">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="prod-title">${p.title}</div>
                    <div class="form-check form-switch" style="padding-left: 2.5em;">
                        <input class="form-check-input" type="checkbox" role="switch" ${checked} onchange="toggleStock('${p.id}', this.checked)">
                    </div>
                </div>
                <div class="prod-price">₦${parseFloat(p.price).toLocaleString()}</div>
                <div class="prod-meta">Status: <span id="status-${p.id}" class="${p.in_stock ? 'text-success' : 'text-danger'}" style="font-weight:700;">${statusText}</span></div>
                <div class="prod-actions">
                    <button class="btn-action copy" onclick="copyProductLink('${p.id}')"><i class="bi bi-link-45deg"></i> Link</button>
                    <button class="btn-action delete" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        </div>`;
    });
    productList.innerHTML = html;
}

window.toggleStock = async function(productId, isVisible) {
    const statusLabel = document.getElementById(`status-${productId}`);
    statusLabel.innerText = isVisible ? "In Stock" : "Sold Out";
    statusLabel.className = isVisible ? "text-success" : "text-danger";

    const { error } = await supabase.from('products').update({ in_stock: isVisible }).eq('id', productId);
    if (error) {
        alert("Update failed: " + error.message);
        window.loadProducts();
    }
};

window.deleteProduct = async function(id) {
    if(confirm('Delete this product?')) {
        await supabase.from('products').delete().eq('id', id);
        window.loadProducts();
    }
}

window.copyProductLink = function(id) {
    const linkText = `myvendor.qzz.io/product/?vendor=${window.vendorSlug || 'store'}&id=${id}`;
    navigator.clipboard.writeText(`https://${linkText}`).then(() => {
        const toast = document.getElementById('toastMsg');
        if (toast) {
            toast.innerText = 'Product link copied!';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        }
    });
}

// ─── 5. SEARCH LOGIC ───────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('keyup', e => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.product-card').forEach(card => {
            const title = card.querySelector('.prod-title').innerText.toLowerCase();
            card.style.display = title.includes(term) ? 'flex' : 'none';
        });
    });
}

initDashboard(); 