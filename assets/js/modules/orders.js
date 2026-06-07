// ─── ORDER MANAGEMENT ─────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { escapeHTML } from '../utils.js';
import { FREE_RECEIPT_LIMIT } from '../constants.js';

// ── List ──────────────────────────────────────────────────────────────────────

window.loadOrders = async function () {
    const list = document.getElementById('orderList');
    if (!list) return;

    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', state.currentUser.id)
        .order('created_at', { ascending: false });

    const emptyState = document.getElementById('emptyState');

    if (!orders || orders.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        list.innerHTML = '';
        updateReceiptBanner();
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    updateReceiptBanner();

    list.innerHTML = orders.map(o => {
        const dateStr = new Date(o.created_at).toLocaleDateString('en-NG', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        let riderHtml = '';
        if (o.status === 'delivered') {
            riderHtml = `
            <div class="rider-info-modern" style="background: var(--green-soft); border-color: var(--green-bright);">
                <div class="rider-title"><i class="bi bi-check-circle-fill text-success"></i> Delivery Completed</div>
                <div class="rider-details">Delivered by: ${escapeHTML(o.rider_name) || 'N/A'} • <a href="tel:${escapeHTML(o.rider_phone) || ''}">${escapeHTML(o.rider_phone) || 'N/A'}</a></div>
            </div>`;
        } else if (o.rider_name) {
            riderHtml = `
            <div class="rider-info-modern">
                <div class="rider-title"><i class="bi bi-bicycle"></i> Dispatch Details</div>
                <div class="rider-details">${escapeHTML(o.rider_name)} • <a href="tel:${escapeHTML(o.rider_phone)}">${escapeHTML(o.rider_phone)}</a></div>
            </div>`;
        }

        let actionsHtml = '';
        if (o.status === 'cancelled') {
            actionsHtml = '';
        } else if (o.status === 'delivered') {
            actionsHtml = `
            <div class="order-actions-modern">
                <button class="btn-action-modern btn-track" onclick="copyTracking('${o.id}')"><i class="bi bi-link-45deg"></i> Copy Link</button>
                <button class="btn-action-modern" style="background: #fefaf5; border: 1px solid #d97706; color: #b45309;" onclick="generateReceipt('${o.id}', this)"><i class="bi bi-receipt"></i> Receipt</button>
            </div>`;
        } else {
            actionsHtml = `
            <div class="order-actions-modern">
                <button class="btn-action-modern btn-update" onclick="openStatusModal('${o.id}', '${o.status}')"><i class="bi bi-pencil-square"></i> Status</button>
                <button class="btn-action-modern" style="background: #fefaf5; border: 1px solid #d97706; color: #b45309;" onclick="generateReceipt('${o.id}', this)"><i class="bi bi-receipt"></i> Receipt</button>
                <button class="btn-action-modern btn-track" onclick="copyTracking('${o.id}')"><i class="bi bi-link-45deg"></i> Link</button>
            </div>`;
        }

        const statusClass = o.status === 'processing' ? 'status-processing'
            : o.status === 'shipped'   ? 'status-shipped'
            : o.status === 'delivered' ? 'status-delivered'
            : o.status === 'cancelled' ? 'status-cancelled'
            : 'status-new';

        return `
        <div class="order-card-modern" data-status="${o.status}">
            <div class="order-header-modern">
                <div>
                    <div class="order-id-modern">${o.id}</div>
                    <div class="order-date-modern">${dateStr}</div>
                </div>
                <div style="text-align: right;">
                    <div class="order-amount-modern">₦${parseFloat(o.total_amount).toLocaleString()}</div>
                    <span class="status-badge-modern ${statusClass}">${o.status.replace('_', ' ')}</span>
                </div>
            </div>
            <div class="customer-info-modern">
                <div class="customer-name-modern"><i class="bi bi-person-circle text-success" style="opacity: 0.8;"></i> ${escapeHTML(o.customer_name)}</div>
                <div class="item-summary-modern">${escapeHTML(o.items)}</div>
                ${(o.customer_phone || o.customer_address) ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.45rem;">
                    ${o.customer_phone ? `<a href="tel:${escapeHTML(o.customer_phone)}" style="display:inline-flex;align-items:center;gap:.3rem;font-size:.71rem;font-weight:700;color:var(--green-primary);text-decoration:none;background:var(--green-soft);padding:.22rem .6rem;border-radius:30px;border:1px solid var(--border-light);"><i class="bi bi-telephone-fill" style="font-size:.62rem;"></i>${escapeHTML(o.customer_phone)}</a>` : ''}
                    ${o.customer_address ? `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.71rem;color:var(--text-muted);background:var(--gray-bg);padding:.22rem .6rem;border-radius:30px;border:1px solid var(--border-light);"><i class="bi bi-geo-alt-fill" style="font-size:.62rem;color:var(--green-primary);"></i>${escapeHTML(o.customer_address)}</span>` : ''}
                </div>` : ''}
            </div>
            ${riderHtml}
            ${actionsHtml}
        </div>`;
    }).join('');
};

// ── Order search ──────────────────────────────────────────────────────────────
window.searchOrders = function (term) {
    const q = (term || '').toLowerCase().trim();
    document.querySelectorAll('.order-card-modern').forEach(card => {
        card.style.display = !q || card.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
};

// ── Receipt banner (monthly usage indicator) ──────────────────────────────────

async function updateReceiptBanner() {
    const banner = document.getElementById('receiptBanner');
    if (!banner) return;

    const isPremium = state.currentUser.tier === 'premium';

    if (isPremium) {
        banner.style.display = 'block';
        banner.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;color:var(--text-muted);font-weight:600;background:var(--card-white);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:0.55rem 1rem;"><i class="bi bi-star-fill" style="color:#f59e0b;font-size:0.7rem;"></i> Premium — unlimited branded receipts</div>`;
        return;
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', state.currentUser.id)
        .eq('event_type', 'receipt_generated')
        .gte('created_at', startOfMonth.toISOString());

    const used  = count || 0;
    const limit = FREE_RECEIPT_LIMIT;
    const pct   = Math.min((used / limit) * 100, 100);
    const color = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
    const warn  = pct >= 100
        ? `<p style="font-size:0.7rem;color:#ef4444;margin:0.4rem 0 0;font-weight:600;">⚠️ Monthly limit reached. Upgrade for unlimited receipts.</p>`
        : pct >= 70
        ? `<p style="font-size:0.7rem;color:#b45309;margin:0.4rem 0 0;font-weight:600;">💡 ${limit - used} receipt${limit - used === 1 ? '' : 's'} remaining this month.</p>`
        : '';

    banner.style.display = 'block';
    banner.innerHTML = `
    <div style="background:var(--card-white);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:0.7rem 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
            <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;"><i class="bi bi-receipt me-1"></i> Receipts This Month</span>
            <span style="font-size:0.78rem;font-weight:800;color:${color};">${used} / ${limit}</span>
        </div>
        <div style="background:#e9eee5;border-radius:100px;height:5px;overflow:hidden;">
            <div style="width:${pct}%;background:${color};height:100%;border-radius:100px;transition:width 0.4s ease;"></div>
        </div>
        ${warn}
    </div>`;
}

// ── Receipt ───────────────────────────────────────────────────────────────────

window.generateReceipt = async function (orderId, btnElement) {
    let originalHtml = '';
    if (btnElement) {
        originalHtml          = btnElement.innerHTML;
        btnElement.innerHTML  = '<span class="spinner-border spinner-border-sm"></span>';
        btnElement.disabled   = true;
    }

    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count, error } = await supabase
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('vendor_id', state.currentUser.id)
            .eq('event_type', 'receipt_generated')
            .gte('created_at', startOfMonth.toISOString());

        if (error) throw error;

        if (state.currentUser.tier !== 'premium' && count >= FREE_RECEIPT_LIMIT) {
            window.showPremiumModal(
                `You have reached your limit of ${FREE_RECEIPT_LIMIT} free receipts this month. Upgrade to generate unlimited branded receipts!`
            );
            if (btnElement) { btnElement.innerHTML = originalHtml; btnElement.disabled = false; }
            return;
        }

        await supabase.from('analytics_events').insert([{ vendor_id: state.currentUser.id, event_type: 'receipt_generated' }]);
        window.open(`/dashboard/receipt.html?id=${orderId}`, '_blank');

    } catch (err) {
        console.error(err);
        alert('Error generating receipt. Please try again.');
    } finally {
        if (btnElement) { btnElement.innerHTML = originalHtml; btnElement.disabled = false; }
    }
};

// ── Filter pills ──────────────────────────────────────────────────────────────

window.filterOrders = function (status, pillElement) {
    document.querySelectorAll('.filter-pill-modern').forEach(p => p.classList.remove('active'));
    if (pillElement) pillElement.classList.add('active');

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
        if (emptyState) emptyState.classList.remove('hidden');
    } else if (cards.length > 0) {
        if (emptyState) emptyState.classList.add('hidden');
    }
};

// ── Create order ──────────────────────────────────────────────────────────────

window.handleCreateOrder = async function (e) {
    e.preventDefault();
    const submitBtn  = document.querySelector('#createOrderForm button[type="submit"]');
    const origText   = submitBtn.innerHTML;
    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    try {
        const itemsValue = document.getElementById('newOrderItems').value.trim();
        if (!itemsValue) throw new Error('Please add items to the order.');

        const id = `MV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900) + 100}`;

        const { error } = await supabase.from('orders').insert([{
            id,
            vendor_id:        state.currentUser.id,
            customer_name:    document.getElementById('newCustomerName').value,
            customer_phone:   document.getElementById('newCustomerPhone')?.value?.trim() || null,
            customer_address: document.getElementById('newCustomerAddress')?.value?.trim() || null,
            items:            itemsValue,
            total_amount:     document.getElementById('newOrderTotal').value,
            status:           'new',
        }]);

        if (error) throw error;

        if (document.getElementById('createOrderModal')) {
            bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        }

        document.getElementById('createOrderForm').reset();
        window.loadOrders();
        navigator.clipboard.writeText(`https://${window.location.host}/track/?id=${id}`);

        // Fire-and-forget Telegram notification if vendor switched channel
        if (state.currentUser?.id) {
            fetch('/api/notify', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendorId:      state.currentUser.id,
                    customerName:  document.getElementById('newCustomerName').value,
                    customerPhone: document.getElementById('newCustomerPhone')?.value?.trim() || null,
                    total:         parseFloat(document.getElementById('newOrderTotal').value) || 0,
                    items:         document.getElementById('newOrderItems').value.trim(),
                }),
            }).catch(() => {});
        }

        const toast = document.getElementById('toastMsg');
        if (toast) {
            toast.innerText = 'Order Created & Tracking Link Copied!';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        } else {
            alert('Order Created & Link Copied!');
        }

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        submitBtn.disabled  = false;
        submitBtn.innerHTML = origText;
    }
};

// ── Tracking link ─────────────────────────────────────────────────────────────

window.copyTracking = function (id) {
    navigator.clipboard.writeText(`https://${window.location.host}/track/?id=${id}`);
    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = 'Tracking link copied!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
        alert('Tracking link copied!');
    }
};

// ── Status modal ──────────────────────────────────────────────────────────────

window.currentOrderId = null;

window.openStatusModal = function (id, status) {
    window.currentOrderId = id;
    const select = document.getElementById('statusSelect');
    Array.from(select.options).forEach(opt => (opt.disabled = false));

    if (status === 'processing') {
        select.querySelector('option[value="new"]').disabled = true;
    } else if (status === 'shipped') {
        select.querySelector('option[value="new"]').disabled        = true;
        select.querySelector('option[value="processing"]').disabled = true;
    }

    select.value = status;
    const riderGroup = document.getElementById('riderDetailsGroup');
    if (riderGroup) riderGroup.style.display = (status === 'shipped' || status === 'delivered') ? 'block' : 'none';
    new bootstrap.Modal(document.getElementById('statusModal')).show();
};

window.saveStatus = async function () {
    const status     = document.getElementById('statusSelect').value;
    const riderName  = document.getElementById('riderName')  ? document.getElementById('riderName').value  : null;
    const riderPhone = document.getElementById('riderPhone') ? document.getElementById('riderPhone').value : null;

    await supabase.from('orders').update({ status, rider_name: riderName, rider_phone: riderPhone }).eq('id', window.currentOrderId);
    bootstrap.Modal.getInstance(document.getElementById('statusModal')).hide();
    window.loadOrders();
};

// Wire up the status select dropdown visibility toggle
const statusSelect = document.getElementById('statusSelect');
if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
        const riderGroup = document.getElementById('riderDetailsGroup');
        if (riderGroup) {
            riderGroup.style.display = (e.target.value === 'shipped' || e.target.value === 'delivered') ? 'block' : 'none';
        }
    });
}
