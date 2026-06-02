// ─── HOME DASHBOARD ───────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { escapeHTML } from '../utils.js';

window.loadHomeDashboard = async function () {
    if (!document.getElementById('recentOrdersList')) return;

    const firstName = state.currentUser.business_name.split(' ')[0] || 'Vendor';
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.innerHTML = `Welcome back, ${escapeHTML(firstName)} 👋`;

    const storeUrl = `${window.location.host}/${state.vendorSlug}`;
    const storeLinkEl = document.getElementById('storeLink');
    if (storeLinkEl) storeLinkEl.innerText = storeUrl;

    const waShareBtn = document.getElementById('waShareBtn');
    if (waShareBtn) {
        const shareText = encodeURIComponent(
            `Shop our latest collection online! Browse products and place orders directly here: https://${storeUrl}`
        );
        waShareBtn.href = `https://wa.me/?text=${shareText}`;
    }

    const { count: prodCount  } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('vendor_id', state.currentUser.id);
    const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('vendor_id', state.currentUser.id);

    if (document.getElementById('statProducts')) document.getElementById('statProducts').innerText = prodCount  || 0;
    if (document.getElementById('statOrders'))   document.getElementById('statOrders').innerText   = orderCount || 0;

    const { data: recentOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', state.currentUser.id)
        .order('created_at', { ascending: false })
        .limit(4);

    const ordersListEl = document.getElementById('recentOrdersList');

    if (!recentOrders || recentOrders.length === 0) {
        ordersListEl.innerHTML = `<div class="empty-orders"><i class="bi bi-inbox fs-2 mb-2 d-block"></i>No orders yet. Share your link to get started!</div>`;
        return;
    }

    ordersListEl.innerHTML = recentOrders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const statusClass = o.status === 'processing' ? 'status-processing'
            : o.status === 'shipped'   ? 'status-shipped'
            : o.status === 'delivered' ? 'status-delivered'
            : o.status === 'cancelled' ? 'status-cancelled'
            : 'status-new';

        return `
        <div class="order-row">
          <div class="order-info">
            <span class="order-id">${o.id}</span>
            <span class="order-date">${date} • <strong style="color:var(--text-dark);">${escapeHTML(o.customer_name)}</strong></span>
          </div>
          <div class="order-right">
            <div class="order-amount">₦${parseFloat(o.total_amount).toLocaleString()}</div>
            <div class="badge-status ${statusClass}">${o.status.replace('_', ' ')}</div>
          </div>
        </div>`;
    }).join('');
};
