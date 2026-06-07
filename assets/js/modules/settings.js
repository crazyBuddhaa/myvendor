// ─── SETTINGS ─────────────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';

window.loadSettings = async function () {
    if (!state.currentUser) return;

    if (document.getElementById('setBizName'))  document.getElementById('setBizName').value  = state.currentUser.business_name || '';
    if (document.getElementById('setWaNumber')) document.getElementById('setWaNumber').value = state.currentUser.whatsapp_number || '';
    if (document.getElementById('setBio'))      document.getElementById('setBio').value      = state.currentUser.bio           || '';
    if (document.getElementById('setLogoUrl')) {
        document.getElementById('setLogoUrl').value = state.currentUser.logo_url || '';
        if (state.currentUser.logo_url) {
            const wrap = document.getElementById('logoPreviewWrap');
            const img  = document.getElementById('logoPreview');
            if (wrap) wrap.style.display = 'block';
            if (img)  img.src = state.currentUser.logo_url;
        }
    }

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

    // ── Appearance ────────────────────────────────────────────────────────────
    const themeColorEl = document.getElementById('setThemeColor');
    if (themeColorEl) themeColorEl.value = state.currentUser.theme_color || '#1f6e43';

    const bannerUrlEl = document.getElementById('setBannerUrl');
    if (bannerUrlEl) {
        bannerUrlEl.value = state.currentUser.banner_url || '';
        if (state.currentUser.banner_url) {
            const wrap = document.getElementById('bannerPreviewWrap');
            const img  = document.getElementById('bannerPreview');
            if (wrap) wrap.style.display = 'block';
            if (img)  img.src = state.currentUser.banner_url;
        }
    }

    const layout = state.currentUser.layout || 'grid';
    const layoutEl = document.getElementById(layout === 'list' ? 'layoutList' : 'layoutGrid');
    if (layoutEl) layoutEl.checked = true;

    // ── Notification Bot ──────────────────────────────────────────────────────
    const channel   = state.currentUser.notification_channel || 'whatsapp';
    const channelEl = document.getElementById(channel === 'telegram' ? 'channelTelegram' : 'channelWhatsapp');
    if (channelEl) channelEl.checked = true;

    // Show/hide telegram section based on selected channel
    _updateTelegramSection(channel);

    // Show linked/unlinked status
    const hasTgId = !!(state.currentUser.telegram_chat_id);
    const linkedEl   = document.getElementById('tgLinkedStatus');
    const unlinkedEl = document.getElementById('tgUnlinkedStatus');
    if (linkedEl)   linkedEl.style.display   = hasTgId ? 'block' : 'none';
    if (unlinkedEl) unlinkedEl.style.display = hasTgId ? 'none'  : 'block';

    // Wire up channel radio change
    ['channelWhatsapp', 'channelTelegram'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => _updateTelegramSection(el.value));
    });

    // Wire up banner URL live preview
    if (bannerUrlEl) {
        bannerUrlEl.addEventListener('input', () => {
            const url  = bannerUrlEl.value.trim();
            const wrap = document.getElementById('bannerPreviewWrap');
            const img  = document.getElementById('bannerPreview');
            if (url) { if (img) img.src = url; if (wrap) wrap.style.display = 'block'; }
            else     { if (wrap) wrap.style.display = 'none'; }
        });
    }
};

function _updateTelegramSection(channel) {
    const sec = document.getElementById('telegramSection');
    if (sec) sec.style.display = channel === 'telegram' ? 'block' : 'none';
}

window.openTelegramLink = function () {
    const botUsername = 'myvendorsbot'; // update with your actual bot username
    const vendorId    = state.currentUser?.id;
    if (!vendorId) return;
    const url = `https://t.me/${botUsername}?start=link_${vendorId}`;
    window.open(url, '_blank');
};

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

    const isPremium   = state.currentUser.tier === 'premium';
    const templateEl  = document.getElementById('setOrderTemplate');
    const vacationEl  = document.getElementById('setVacationMode');

    // Appearance
    const themeColorEl = document.getElementById('setThemeColor');
    const bannerUrlEl  = document.getElementById('setBannerUrl');
    const layoutRadio  = document.querySelector('input[name="storeLayout"]:checked');
    const notifRadio   = document.querySelector('input[name="notifChannel"]:checked');

    const updatedData = {
        business_name:        document.getElementById('setBizName').value.trim(),
        slug:                 newSlug,
        whatsapp_number:      document.getElementById('setWaNumber').value.trim(),
        bio:                  document.getElementById('setBio').value.trim(),
        vacation_mode:        vacationEl  ? vacationEl.checked  : false,
        order_template:       (isPremium && templateEl) ? templateEl.value.trim() || null : state.currentUser.order_template || null,
        logo_url:             document.getElementById('setLogoUrl') ? document.getElementById('setLogoUrl').value.trim() || null : state.currentUser.logo_url || null,
        theme_color:          themeColorEl ? themeColorEl.value || null : state.currentUser.theme_color || null,
        banner_url:           bannerUrlEl  ? bannerUrlEl.value.trim() || null  : state.currentUser.banner_url  || null,
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

        // Bust the server-side cache so the updated store page is served immediately
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

        btn.innerHTML = '<i class="bi bi-check-lg"></i> Saved Successfully!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    }
};
