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

    const updatedData = {
        business_name:    document.getElementById('setBizName').value.trim(),
        slug:             newSlug,
        whatsapp_number:  document.getElementById('setWaNumber').value.trim(),
        bio:            document.getElementById('setBio').value.trim(),
        vacation_mode:  vacationEl  ? vacationEl.checked  : false,
        order_template: (isPremium && templateEl) ? templateEl.value.trim() || null : state.currentUser.order_template || null,
        logo_url:       document.getElementById('setLogoUrl') ? document.getElementById('setLogoUrl').value.trim() || null : state.currentUser.logo_url || null,
    };

    const { error } = await supabase.from('vendor_profiles').update(updatedData).eq('id', state.currentUser.id);

    if (error) {
        alert('Error saving settings: ' + error.message);
        btn.innerHTML = originalText; btn.disabled = false;
    } else {
        state.currentUser  = { ...state.currentUser, ...updatedData };
        state.vendorSlug   = updatedData.slug;
        window.currentUser = state.currentUser;
        window.vendorSlug  = state.vendorSlug;

        btn.innerHTML = '<i class="bi bi-check-lg"></i> Saved Successfully!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    }
};
