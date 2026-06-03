// ─── ANALYTICS ────────────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { escapeHTML } from '../utils.js';

window.loadAnalytics = async function () {
    const revEl = document.getElementById('totalRevenue');
    if (!revEl) return;

    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', state.currentUser.id);

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
                    productSales[cleanName].count++;
                    productSales[cleanName].revenue += (orderTotal / itemsArr.length);
                });
            }
            if (o.status === 'new' || o.status === 'processing') pendingOrd++;
        });
    }

    document.getElementById('totalRevenue').innerText  = `₦${totalRev.toLocaleString()}`;
    document.getElementById('totalOrders').innerText   = totalOrd;
    document.getElementById('pendingOrders').innerText = pendingOrd;

    const [storeViewsRes, prodViewsRes, waClicksRes] = await Promise.all([
        supabase
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('vendor_id', state.currentUser.id)
            .eq('event_type', 'store_view'),
        supabase
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('vendor_id', state.currentUser.id)
            .eq('event_type', 'product_view'),
        supabase
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('vendor_id', state.currentUser.id)
            .eq('event_type', 'whatsapp_click'),
    ]);

    const storeViews = storeViewsRes.count || 0;
    const prodViews  = prodViewsRes.count  || 0;
    const waClicks   = waClicksRes.count   || 0;

    document.getElementById('statStoreViews').innerText   = storeViews;
    document.getElementById('statProductViews').innerText = prodViews;
    document.getElementById('statWaClicks').innerText     = waClicks;

    // ── Conversion funnel ─────────────────────────────────────────────────────
    const funnelView = document.getElementById('funnelView');
    if (funnelView) {
        const steps = [
            { label: 'Store visits',    count: storeViews, icon: 'bi-eye',               color: 'var(--green-primary)' },
            { label: 'Product views',   count: prodViews,  icon: 'bi-grid-3x3-gap-fill', color: '#0891b2' },
            { label: 'WhatsApp taps',   count: waClicks,   icon: 'bi-whatsapp',           color: '#25D366' },
        ];
        const maxCount = storeViews || 1;
        funnelView.innerHTML = steps.map((step, i) => {
            const barPct  = Math.round((step.count / maxCount) * 100);
            const ratePct = i === 0
                ? 100
                : steps[i - 1].count > 0
                    ? Math.round((step.count / steps[i - 1].count) * 100)
                    : 0;
            return `
            <div style="margin-bottom:${i < steps.length - 1 ? '1.1rem' : '.2rem'};">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">
                    <span style="font-size:.78rem;font-weight:600;color:var(--text-dark);display:flex;align-items:center;gap:.35rem;">
                        <i class="bi ${step.icon}" style="color:${step.color};font-size:.85rem;"></i> ${step.label}
                    </span>
                    <span style="font-size:.78rem;font-weight:800;color:${step.color};">
                        ${step.count.toLocaleString()}
                        ${i > 0 ? `<span style="font-size:.65rem;font-weight:600;opacity:.65;margin-left:.2rem;">(${ratePct}% of prev)</span>` : ''}
                    </span>
                </div>
                <div style="background:#e9eee5;border-radius:100px;height:8px;overflow:hidden;">
                    <div style="width:${barPct}%;background:${step.color};height:100%;border-radius:100px;transition:width .6s ease;"></div>
                </div>
                ${i < steps.length - 1 ? `<div style="text-align:center;font-size:.65rem;color:var(--text-muted);margin-top:.3rem;letter-spacing:.3px;">▼</div>` : ''}
            </div>`;
        }).join('');
    }

    // ── Top products ──────────────────────────────────────────────────────────
    const topProductsList = document.getElementById('topProductsList');
    const sortedProducts  = Object.entries(productSales)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5);

    if (sortedProducts.length === 0) {
        topProductsList.innerHTML = `<div class="empty-state"><i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i><br>No delivered orders yet.</div>`;
    } else {
        topProductsList.innerHTML = sortedProducts.map((prod, index) => `
            <div class="top-product-item">
                <div class="product-rank">${index + 1}</div>
                <div class="product-info">
                    <div class="product-name">${escapeHTML(prod[0])}</div>
                    <div class="product-sales">${prod[1].count} order${prod[1].count !== 1 ? 's' : ''}</div>
                </div>
                <div class="product-revenue">₦${prod[1].revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            </div>
        `).join('');
    }
};
