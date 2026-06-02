// ─── SETTINGS ─────────────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { state } from '../state.js';

window.loadSettings = async function () {
    if (!state.currentUser) return;

    if (document.getElementById('setBizName'))  document.getElementById('setBizName').value  = state.currentUser.business_name || '';
    if (document.getElementById('setWaNumber')) document.getElementById('setWaNumber').value = state.currentUser.wa_number     || '';
    if (document.getElementById('setBio'))      document.getElementById('setBio').value      = state.currentUser.bio           || '';

    if (document.getElementById('setSlug')) {
        const slugInput = document.getElementById('setSlug');
        slugInput.value = state.currentUser.slug || '';
        slugInput.dispatchEvent(new Event('input'));
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

    const updatedData = {
        business_name: document.getElementById('setBizName').value.trim(),
        slug:          newSlug,
        wa_number:     document.getElementById('setWaNumber').value.trim(),
        bio:           document.getElementById('setBio').value.trim(),
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
