import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

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

    // Inject the Premium Upgrade Modal into the page
    injectUpgradeModal();

    // Check which page we are on and load appropriate data
    if (document.getElementById('productGrid')) await window.loadProducts();
    if (document.getElementById('orderList')) await window.loadOrders();
    if (document.getElementById('totalRevenue')) await window.loadAnalytics();
    
    // If on add/edit product page
    const urlParams = new URLSearchParams(window.location.search);
    if (document.getElementById('productTitle') && urlParams.has('id')) {
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
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Branded Web Receipts</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Remove 'myvendor' Watermark</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Priority Support</li>
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
    new bootstrap.Modal(document.getElementById('premiumModal')).show();
};

// ─── 3. PRODUCT & INVENTORY LOGIC ─────────────────────────────────
window.loadProducts = async function() {
    const list = document.getElementById('productGrid');
    if (!list) return;

    const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', currentUser.id)
        .order('created_at', {ascending: false});

    const emptyState = document.getElementById('emptyState');
    
    // Track count for Free Tier limits
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
                    <a href="/dashboard/add-product.html?id=${p.id}" class="action-btn">
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

window.saveProduct = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveBtn');
    if(btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    // 🌟 PREMIUM LOCK: Check Free Tier Limits before creating a NEW product
    if (!productId) {
        // We need to fetch count dynamically just to be safe if they didn't load inventory first
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', currentUser.id);
        
        if (currentUser.tier !== 'premium' && count >= FREE_PRODUCT_LIMIT) {
            if(btn) btn.innerHTML = 'Save Product';
            window.showPremiumModal(`You have reached the free limit of ${FREE_PRODUCT_LIMIT} products.`);
            return;
        }
    }

    const title = document.getElementById('productTitle').value;
    const price = document.getElementById('productPrice').value;
    const desc = document.getElementById('productDesc').value;
    const inStock = document.getElementById('inStockToggle').checked;
    const imgUrl = document.getElementById('imageUrl').value || null;

    const productData = {
        vendor_id: currentUser.id,
        title: title,
        price: price,
        description: desc,
        in_stock: inStock,
        image_url: imgUrl,
        // (You can add Category, Colors, etc. here based on your add-product.html fields)
        status: inStock ? 'active' : 'out_of_stock' 
    };

    let error;
    if (productId) {
        const { error: updateErr } = await supabase.from('products').update(productData).eq('id', productId);
        error = updateErr;
    } else {
        const { error: insertErr } = await supabase.from('products').insert([productData]);
        error = insertErr;
    }

    if (error) {
        alert("Error saving product: " + error.message);
        if(btn) btn.innerHTML = 'Save Product';
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
    navigator.clipboard.writeText(`https://myvendor.qzz.io/product/?vendor=${window.vendorSlug}&id=${id}`);
    alert("Product link copied!");
};

// ─── 4. ORDER MANAGEMENT LOGIC ────────────────────────────────────
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
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const riderHtml = o.rider_name ? `<div class="rider-info-modern"><div class="rider-title"><i class="bi bi-bicycle"></i> Dispatch Details</div><div class="rider-details">${o.rider_name} • <a href="tel:${o.rider_phone}">${o.rider_phone}</a></div></div>` : '';

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
                <div class="customer-name-modern"><i class="bi bi-person-circle text-success" style="opacity: 0.8;"></i> ${o.customer_name}</div>
                <div class="item-summary-modern">${o.items}</div>
            </div>
            ${riderHtml}
            
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
            </div>
        </div>`;
    }).join('');
};

window.generateReceipt = function(orderId) {
    if (currentUser.tier !== 'premium') {
        window.showPremiumModal("Custom Branded Receipts are a Premium feature.");
        return;
    }
    // Logic to generate PDF receipt goes here (Feature coming soon)
    alert("Receipt generator opening for Order: " + orderId);
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
        alert('Order Created & Link Copied!');
    } catch (error) {
        alert("Error creating order: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
};

window.copyTracking = function(id) {
    navigator.clipboard.writeText(`https://myvendor.qzz.io/track/?id=${id}`);
    alert("Tracking link copied!");
};

window.currentOrderId = null;
window.openStatusModal = function(id, status) {
    currentOrderId = id;
    document.getElementById('statusSelect').value = status;
    const riderGroup = document.getElementById('riderDetailsGroup');
    if(riderGroup) riderGroup.style.display = (status === 'shipped') ? 'block' : 'none';
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

// ─── 5. ANALYTICS LOGIC ──────────────────────────────────────────
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
        topProductsList.innerHTML = `<div class="empty-state">No delivered orders yet to calculate top products.</div>`;
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

window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
};

// Ignite!
initDashboard();