// ─── CORE: AUTH, INIT & PREMIUM GATE ─────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { BASE_PRODUCT_LIMIT } from '../constants.js';

// ── Premium upgrade modal ─────────────────────────────────────────────────────

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
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Multiple Gallery Images</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Branded Web Receipts</li>
                <li style="margin-bottom: 0.5rem;"><i class="bi bi-check-circle-fill text-success me-2"></i> Remove 'myvendor' Watermark</li>
            </ul>
            <button class="w-100" id="premiumUpgradeBtn" style="background: #0f6e3f; color: white; padding: 0.9rem; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;" onclick="window.location.href='/dashboard/subscription.html'">
                Upgrade Now — ₦900/mo
            </button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Show the premium upgrade modal with an optional reason message.
 * Exposed on window so inline HTML onclick handlers can call it.
 */
window.showPremiumModal = function (reasonText) {
    document.getElementById('premiumLockReason').innerText = reasonText;
    const modalEl = document.getElementById('premiumModal');
    if (modalEl) {
        const instance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        instance.show();
    } else {
        alert(reasonText + '\n\nUpgrade to Premium to unlock this feature.');
    }
};

// ── Dashboard initialisation ──────────────────────────────────────────────────

export async function initDashboard() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/dashboard/index.html';
        return;
    }

    const { data: profile } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) {
        window.location.href = '/dashboard/onboarding.html';
        return;
    }

    // Populate shared state
    state.currentUser     = profile;
    state.vendorSlug      = profile.slug;
    state.freeProductLimit = BASE_PRODUCT_LIMIT + (profile.bonus_slots || 0);

    // Keep window assignments for inline scripts that reference window.currentUser
    window.currentUser = state.currentUser;
    window.vendorSlug  = state.vendorSlug;

    injectUpgradeModal();

    if (document.getElementById('recentOrdersList')) await window.loadHomeDashboard();
    if (document.getElementById('productGrid'))      await window.loadProducts();
    if (document.getElementById('orderList'))        await window.loadOrders();
    if (document.getElementById('totalRevenue'))     await window.loadAnalytics();
    if (document.getElementById('settingsForm'))     await window.loadSettings();

    const urlParams = new URLSearchParams(window.location.search);
    if (document.getElementById('editProductForm') && urlParams.has('id')) {
        await window.loadEditProduct(urlParams.get('id'));
    }
}

// ── Logout ────────────────────────────────────────────────────────────────────

window.logout = async function () {
    await supabase.auth.signOut();
    window.location.href = '/dashboard/index.html';
};
