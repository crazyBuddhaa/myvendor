import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Initialize Supabase
const SUPABASE_URL = 'https://sotdghhayztnpwnrzjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcOKwSDnoCGm_rt725Bi-g_rV6tjGlK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
const BASE_PRODUCT_LIMIT = 20;

async function initReferrals() {
    // 1. Authenticate
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    // 2. Fetch User Profile
    const { data: profile } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) {
        window.location.href = '/onboarding.html';
        return;
    }

    currentUser = profile;
    renderReferralUI();
}

function renderReferralUI() {
    // Generate their unique link
    const refLink = `https://${window.location.host}/onboarding.html?ref=${currentUser.id}`;
    
    // Populate the input box
    const linkInput = document.getElementById('referralLinkInput');
    if (linkInput) linkInput.value = refLink;

    // Set up the WhatsApp share button
    const waShareBtn = document.getElementById('waShareBtn');
    if (waShareBtn) {
        const shareText = encodeURIComponent(`Start your free online store in 2 minutes! I use myvendor to generate receipts and track my orders. Sign up here to get bonus product slots: ${refLink}`);
        waShareBtn.href = `https://wa.me/?text=${shareText}`;
    }

    // Update the Stats
    const totalLimitEl = document.getElementById('statTotalLimit');
    const bonusSlotsEl = document.getElementById('statBonusSlots');
    const bonus = currentUser.bonus_slots || 0;
    
    if (totalLimitEl) totalLimitEl.innerText = BASE_PRODUCT_LIMIT + bonus;
    if (bonusSlotsEl) bonusSlotsEl.innerText = bonus;
}

window.copyReferralLink = function() {
    const input = document.getElementById('referralLinkInput');
    if (!input) return;
    
    input.select();
    input.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(input.value);

    // Update button text temporarily visually
    const btn = document.getElementById('copyBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check2"></i>';
    btn.style.background = 'var(--green-primary)';
    btn.style.color = 'white';

    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.innerText = "Referral link copied!";
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = 'var(--green-soft)';
        btn.style.color = 'var(--green-dark)';
    }, 2000);
};

// Ignite!
initReferrals();