import { supabase, checkAuth } from '/assets/js/supabase.js';
import { BASE_PRODUCT_LIMIT } from '/assets/js/constants.js';

let currentUser = null;

async function initReferrals() {
    const user = await checkAuth();
    if (!user) return;

    const { data: profile } = await supabase
        .from('vendor_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) {
        window.location.href = '/dashboard/index.html';
        return;
    }

    currentUser = profile;
    renderReferralUI();
}

function renderReferralUI() {
    const refLink = `https://${window.location.host}/dashboard/index.html?ref=${currentUser.id}`;

    const linkInput = document.getElementById('referralLinkInput');
    if (linkInput) linkInput.value = refLink;

    const waShareBtn = document.getElementById('waShareBtn');
    if (waShareBtn) {
        const shareText = encodeURIComponent(
            `Start your free online store in 2 minutes! I use myvendor to generate receipts and track my orders. Sign up here to get bonus product slots: ${refLink}`
        );
        waShareBtn.href = `https://wa.me/?text=${shareText}`;
    }

    const bonus = currentUser.bonus_slots || 0;
    const referralCount = Math.floor(bonus / 3);

    const totalLimitEl      = document.getElementById('statTotalLimit');
    const bonusSlotsEl      = document.getElementById('statBonusSlots');
    const referralCountEl   = document.getElementById('statReferralCount');
    if (totalLimitEl)    totalLimitEl.innerText    = BASE_PRODUCT_LIMIT + bonus;
    if (bonusSlotsEl)    bonusSlotsEl.innerText    = bonus;
    if (referralCountEl) referralCountEl.innerText = referralCount;
}

window.copyReferralLink = function () {
    const input = document.getElementById('referralLinkInput');
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value);

    const btn          = document.getElementById('copyBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML      = '<i class="bi bi-check2"></i> Copied';
    btn.style.background   = 'var(--green-soft)';
    btn.style.color        = 'var(--green-dark)';
    btn.style.borderColor  = 'var(--green-bright)';

    const toast = document.getElementById('toastMsg');
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    setTimeout(() => {
        btn.innerHTML     = originalText;
        btn.style.background  = 'white';
        btn.style.color       = 'var(--green-dark)';
        btn.style.borderColor = 'var(--border-light)';
    }, 2000);
};

initReferrals();
