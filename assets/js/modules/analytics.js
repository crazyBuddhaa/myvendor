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
