import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ IMPORTANT: Verify your actual Supabase URL and Anon Key here
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

    // Inject the Premium Upgrade Modal into the page globally
    injectUpgradeModal();

    // Route controller: Load appropriate data based on which page we are on
    if (document.getElementById('recentOrdersList')) await window.loadHomeDashboard();
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

// ─── 3. HOME DASHBOARD LOGIC ──────────────────────────────────────
window.loadHomeDashboard = async function() {
    if (!document.getElementById('recentOrdersList')) return;

    // Populate Greeting & Store Link
    const firstName = window.currentUser.business_name.split(' ')[0] || 'Vendor';
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.innerHTML = `Welcome back, ${firstName} 👋`;

    const storeUrl = `myvendor.qzz.io/${window.vendorSlug}`;
    const storeLinkEl = document.getElementById('storeLink');
    if (storeLinkEl) storeLinkEl.innerText = storeUrl;

    // Set up WhatsApp Share Button
    const waShareBtn = document.getElementById('waShareBtn');
    if (waShareBtn) {
        const shareText = encodeURIComponent(`Shop our latest collection online! Browse products and place orders directly here: https://${storeUrl}`);
        waShareBtn.href = `https://wa.me/?text=${shareText}`;
    }

    // Fetch Top-Level Stats (Using fast 'head' queries to save bandwidth)
    const { count: prodCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', window.currentUser.id);
        
    const { count: orderCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', window.currentUser.id);

    if (document.getElementById('statProducts')) document.getElementById('statProducts').innerText = prodCount || 0;
    if (document.getElementById('statOrders')) document.getElementById('statOrders').innerText = orderCount || 0;

    // Fetch & Render Recent Orders (Top 4)
    const { data: recentOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', window.currentUser.id)
        .order('created_at', { ascending: false })
        .limit(4);

    const ordersListEl = document.getElementById('recentOrdersList');
    
    if (!recentOrders || recentOrders.length === 0) {
        ordersListEl.innerHTML = `<div class="empty-orders"><i class="bi bi-inbox fs-2 mb-2 d-block"></i>No orders yet. Share your link to get started!</div>`;
        return;
    }

    ordersListEl.innerHTML = recentOrders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        let statusClass = 'status-new';
        if (o.status === 'processing') statusClass = 'status-processing';
        if (o.status === 'shipped') statusClass = 'status-shipped';
        if (o.status === 'delivered') statusClass = 'status-delivered';
        if (o.status === 'cancelled') statusClass = 'status-cancelled';

        return `
        <div class="order-row">
          <div class="order-info">
            <span class="order-id">${o.id}</span>
            <span class="order-date">${date} • <strong style="color:var(--text-dark);">${o.customer_name}</strong></span>
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
    
    // Track count for Free Tier limits
    window.currentProductsCount = prods ? prods.length : 0;

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
    // Logic to generate PDF receipt goes here
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
        topProductsList.innerHTML = `<div class="empty-state"><i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i><br>No delivered orders yet to calculate top products.</div>`;
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

// ─── 7. UTILS & LOGOUT ───────────────────────────────────────────
window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
};

// Ignite!
initDashboard();