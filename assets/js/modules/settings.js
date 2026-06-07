// ─── SETTINGS ─────────────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { TELEGRAM_BOT_USERNAME } from '../constants.js';
import { state } from '../state.js';
import { optimizeCloudinaryUrl } from '../utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _updateTelegramSection(channel) {
    const sec = document.getElementById('telegramSection');
    if (sec) sec.style.display = channel === 'telegram' ? 'block' : 'none';
}

// ── Load ──────────────────────────────────────────────────────────────────────

window.loadSettings = async function () {
    if (!state.currentUser) return;

    // Basic fields
    if (document.getElementById('setBizName'))  document.getElementById('setBizName').value  = state.currentUser.business_name || '';
    if (document.getElementById('setWaNumber')) document.getElementById('setWaNumber').value = state.currentUser.whatsapp_number || '';
    if (document.getElementById('setBio'))      document.getElementById('setBio').value      = state.currentUser.bio           || '';

    if (document.getElementById('setSlug')) {
        const slugInput = document.getElementById('setSlug');
        slugInput.value = state.currentUser.slug || '';
        slugInput.dispatchEvent(new Event('input'));
    }

    // Vacation mode
    const vacationToggle = document.getElementById('setVacationMode');
    if (vacationToggle) vacationToggle.checked = !!state.currentUser.vacation_mode;

    // Order template — premium only
    const templateEl   = document.getElementById('setOrderTemplate');
    const templateNote = document.getElementById('templateNote');
    const isPremium    = state.currentUser.tier === 'premium';
    if (templateEl) {
        templateEl.value    = state.currentUser.order_template || '';
        templateEl.disabled = !isPremium;
        if (templateNote) {
            templateNote.innerHTML = isPremium
                ? '<i class="bi bi-check-circle-fill text-success me-1"></i> Custom template active for your store.'
                : 'Free plan uses a standard template. <a href="#" onclick="showPremiumModal(\'Custom order message templates are a premium feature.\');return false;" style="color:var(--green-primary);font-weight:700;">Upgrade to Premium</a> to customise.';
        }
    }

    // Theme colour
    const themeColorEl = document.getElementById('setThemeColor');
    if (themeColorEl) themeColorEl.value = state.currentUser.theme_color || '#1f6e43';

    // Pre-populate image zones with existing saved images.
    // _settingsImg is initialised by the DOMContentLoaded inline script in settings.html.
    // We poll briefly in case the module runs before that script fires (rare but possible).
    const waitForImgHelper = () => new Promise(resolve => {
        if (window._settingsImg) { resolve(); return; }
        let tries = 0;
        const id = setInterval(() => {
            if (window._settingsImg || ++tries > 30) { clearInterval(id); resolve(); }
        }, 50);
    });

    await waitForImgHelper();

    if (window._settingsImg) {
        if (state.currentUser.logo_url)   window._settingsImg.showExistingLogo(state.currentUser.logo_url);
        if (state.currentUser.banner_url) window._settingsImg.showExistingBanner(state.currentUser.banner_url);
    }

    // Layout
    const layout   = state.currentUser.layout || 'grid';
    const layoutEl = document.getElementById(layout === 'list' ? 'layoutList' : 'layoutGrid');
    if (layoutEl) layoutEl.checked = true;

    // Notification channel
    const channel   = state.currentUser.notification_channel || 'whatsapp';
    const channelEl = document.getElementById(channel === 'telegram' ? 'channelTelegram' : 'channelWhatsapp');
    if (channelEl) channelEl.checked = true;
    _updateTelegramSection(channel);

    // Telegram link status
    const hasTgId    = !!(state.currentUser.telegram_chat_id);
    const linkedEl   = document.getElementById('tgLinkedStatus');
    const unlinkedEl = document.getElementById('tgUnlinkedStatus');
    if (linkedEl)   linkedEl.style.display   = hasTgId ? 'block' : 'none';
    if (unlinkedEl) unlinkedEl.style.display = hasTgId ? 'none'  : 'block';

    // Wire up channel radio change
    ['channelWhatsapp', 'channelTelegram'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => _updateTelegramSection(el.value));
    });
};

// ── Telegram ──────────────────────────────────────────────────────────────────

window.openTelegramLink = function () {
    const botUsername = TELEGRAM_BOT_USERNAME;
    const vendorId    = state.currentUser?.id;
    if (!vendorId) return;
    window.open(`https://t.me/${botUsername}?start=link_${vendorId}`, '_blank');
};

// ── Save ──────────────────────────────────────────────────────────────────────

window.updateSettings = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveSettings');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    btn.disabled  = true;

    let newSlug = document.getElementById('setSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!newSlug) {
        alert('Store Link cannot be empty.');
        btn.innerHTML = originalText; btn.disabled = false; return;
    }

    if (newSlug !== state.currentUser.slug) {
        const { data: existingVendor } = await supabase
            .from('vendor_profiles')
            .select('id')
            .eq('slug', newSlug)
            .single();
        if (existingVendor) {
            alert('This Store Link is already taken. Please choose another one.');
            btn.innerHTML = originalText; btn.disabled = false; return;
        }
    }

    const isPremium    = state.currentUser.tier === 'premium';
    const templateEl   = document.getElementById('setOrderTemplate');
    const vacationEl   = document.getElementById('setVacationMode');
    const themeColorEl = document.getElementById('setThemeColor');
    const layoutRadio  = document.querySelector('input[name="storeLayout"]:checked');
    const notifRadio   = document.querySelector('input[name="notifChannel"]:checked');

    // Use newly-uploaded Cloudinary URL if available; otherwise keep the stored one.
    const pendingLogo   = window._settingsImg?.logoUrl   ?? null;
    const pendingBanner = window._settingsImg?.bannerUrl ?? null;

    const updatedData = {
        business_name:        document.getElementById('setBizName').value.trim(),
        slug:                 newSlug,
        whatsapp_number:      document.getElementById('setWaNumber').value.trim(),
        bio:                  document.getElementById('setBio').value.trim(),
        vacation_mode:        vacationEl  ? vacationEl.checked  : false,
        order_template:       (isPremium && templateEl) ? templateEl.value.trim() || null : state.currentUser.order_template || null,
        logo_url:             optimizeCloudinaryUrl(pendingLogo   ?? state.currentUser.logo_url   ?? null),
        banner_url:           optimizeCloudinaryUrl(pendingBanner ?? state.currentUser.banner_url ?? null),
        theme_color:          themeColorEl ? themeColorEl.value || null : state.currentUser.theme_color || null,
        layout:               layoutRadio  ? layoutRadio.value  : state.currentUser.layout  || 'grid',
        notification_channel: notifRadio   ? notifRadio.value   : state.currentUser.notification_channel || 'whatsapp',
    };

    const { error } = await supabase.from('vendor_profiles').update(updatedData).eq('id', state.currentUser.id);

    if (error) {
        alert('Error saving settings: ' + error.message);
        btn.innerHTML = originalText; btn.disabled = false;
    } else {
        const oldSlug = state.currentUser.slug;
        state.currentUser  = { ...state.currentUser, ...updatedData };
        state.vendorSlug   = updatedData.slug;
        window.currentUser = state.currentUser;
        window.vendorSlug  = state.vendorSlug;

        // Clear pending upload references — they're now persisted
        if (window._settingsImg) {
            window._settingsImg.logoUrl   = null;
            window._settingsImg.bannerUrl = null;
        }

        // Bust server-side cache
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                fetch('/api/auth?action=cache-bust', {
                    method:  'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ slug: updatedData.slug, oldSlug }),
                }).catch(() => {});
            }
        } catch {}

        btn.innerHTML = '<i class="bi bi-check-lg"></i> Saved!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    }
};
