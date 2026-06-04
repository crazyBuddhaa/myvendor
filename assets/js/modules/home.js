// ─── HOME DASHBOARD ───────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { escapeHTML } from '../utils.js';

window.loadHomeDashboard = async function () {
    if (!document.getElementById('recentOrdersList')) return;

    const firstName = state.currentUser.business_name.split(' ')[0] || 'Vendor';
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.innerHTML = `Welcome back, ${escapeHTML(firstName)} 👋`;

    const tierBadge = document.getElementById('tierBadge');
    if (tierBadge) {
        const isPremium = state.currentUser.tier === 'premium';
        if (isPremium) {
            tierBadge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:0.3rem;background:#fef3c7;color:#92400e;font-size:0.65rem;font-weight:700;padding:0.22rem 0.65rem;border-radius:30px;letter-spacing:0.4px;border:1px solid #fcd34d;"><i class="bi bi-star-fill" style="color:#f59e0b;font-size:0.6rem;"></i> PREMIUM</span>`;
        } else {
            tierBadge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:0.3rem;background:#f3f4f6;color:#6b7280;font-size:0.65rem;font-weight:700;padding:0.22rem 0.65rem;border-radius:30px;letter-spacing:0.4px;border:1px solid #e5e7eb;">FREE PLAN</span><a href="/dashboard/subscription.html" style="display:inline-flex;align-items:center;font-size:0.65rem;font-weight:700;color:var(--green-primary);text-decoration:none;background:var(--green-soft);padding:0.22rem 0.65rem;border-radius:30px;border:1px solid var(--green-bright);">Upgrade →</a>`;
        }
    }

    // ── Plan card ──────────────────────────────────────────────────────────────
    const planCard = document.getElementById('planCard');
    if (planCard) {
        const isPremium  = state.currentUser.tier === 'premium';
        const since      = isPremium
            ? (state.currentUser.premium_since || state.currentUser.created_at)
            : state.currentUser.created_at;
        const sinceDate  = since ? new Date(since) : null;
        const sinceLabel = sinceDate
            ? sinceDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
            : '—';

        // Human-readable duration
        function timeAgo(date) {
            if (!date) return '—';
            const diff  = Date.now() - new Date(date).getTime();
            const days  = Math.floor(diff / 86400000);
            if (days < 1)   return 'Today';
            if (days === 1) return '1 day';
            if (days < 30)  return `${days} days`;
            const months = Math.floor(days / 30);
            if (months < 12) return months === 1 ? '1 month' : `${months} months`;
            const years = Math.floor(months / 12);
            return years === 1 ? '1 year' : `${years} years`;
        }

        if (isPremium) {
            planCard.innerHTML = `
            <div class="plan-status-card plan-status-premium">
              <div class="plan-status-left">
                <div class="plan-status-badge plan-badge-premium">
                  <i class="bi bi-star-fill"></i> PREMIUM
                </div>
                <div class="plan-status-meta">
                  <div class="plan-meta-row">
                    <i class="bi bi-calendar-check"></i>
                    <span>Active since <strong>${sinceLabel}</strong></span>
                  </div>
                  <div class="plan-meta-row">
                    <i class="bi bi-clock"></i>
                    <span>On premium for <strong>${timeAgo(since)}</strong></span>
                  </div>
                  <div class="plan-meta-row">
                    <i class="bi bi-credit-card"></i>
                    <span>₦900 / month</span>
                  </div>
                </div>
              </div>
              <a href="/dashboard/subscription.html" class="plan-status-action plan-action-manage">
                Manage <i class="bi bi-arrow-right"></i>
              </a>
            </div>`;
        } else {
            planCard.innerHTML = `
            <div class="plan-status-card plan-status-free">
              <div class="plan-status-left">
                <div class="plan-status-badge plan-badge-free">FREE</div>
                <div class="plan-status-meta">
                  <div class="plan-meta-row">
                    <i class="bi bi-calendar3"></i>
                    <span>Member since <strong>${sinceLabel}</strong></span>
                  </div>
                  <div class="plan-meta-row">
                    <i class="bi bi-clock"></i>
                    <span>Active for <strong>${timeAgo(since)}</strong></span>
                  </div>
                  <div class="plan-meta-row">
                    <i class="bi bi-box-seam"></i>
                    <span>Up to 20 products · 10 receipts/mo</span>
                  </div>
                </div>
              </div>
              <a href="/dashboard/subscription.html" class="plan-status-action plan-action-upgrade">
                <i class="bi bi-star-fill"></i> Upgrade — ₦900/mo
              </a>
            </div>`;
        }
    }

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
