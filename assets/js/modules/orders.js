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
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

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
            </div>
            ${riderHtml}
            ${actionsHtml}
        </div>`;
    }).join('');
};

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
            vendor_id:     state.currentUser.id,
            customer_name: document.getElementById('newCustomerName').value,
            items:         itemsValue,
            total_amount:  document.getElementById('newOrderTotal').value,
            status:        'new',
        }]);

        if (error) throw error;

        if (document.getElementById('createOrderModal')) {
            bootstrap.Modal.getInstance(document.getElementById('createOrderModal')).hide();
        }

        document.getElementById('createOrderForm').reset();
        window.loadOrders();
        navigator.clipboard.writeText(`https://${window.location.host}/track/?id=${id}`);

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
