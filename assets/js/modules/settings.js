// ─── SETTINGS ─────────────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';
import { TELEGRAM_BOT_USERNAME } from '../constants.js';
import { state } from '../state.js';

// Track newly-uploaded image URLs so updateSettings can use them.
// null  = no new upload yet — fall back to the existing stored URL.
let _logoUrl   = null;
let _bannerUrl = null;

// ── Image upload helpers ───────────────────────────────────────────────────────

/**
 * Upload a File to Supabase Storage and return its public URL.
 * Bucket name: 'store-images'  (create this bucket in your Supabase dashboard
 * under Storage → New bucket → name "store-images", set to Public).
 */
async function _uploadToStorage(file, vendorId, prefix) {
  const ext      = file.name.split('.').pop().toLowerCase() || 'jpg';
  const filePath = `${vendorId}/${prefix}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('store-images')
    .upload(filePath, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data } = supabase.storage.from('store-images').getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Wire up a file-picker upload zone.
 *
 * @param {object} opts
 *   zoneId         - id of the clickable zone div
 *   pickerId       - id of the hidden <input type="file">
 *   placeholderId  - id of the "tap to upload" placeholder
 *   uploadingId    - id of the uploading spinner state
 *   previewWrapId  - id of the preview state container
 *   previewImgId   - id of the <img> preview
 *   fileNameId     - id of the filename label
 *   errorId        - id of the error state container
 *   errorMsgId     - id of the error message span
 *   maxBytes       - maximum allowed file size in bytes
 *   storagePrefix  - prefix string used in the Supabase Storage path
 *   onSuccess      - callback(publicUrl) called after successful upload
 */
function _setupImagePicker(opts) {
  const zone        = document.getElementById(opts.zoneId);
  const picker      = document.getElementById(opts.pickerId);
  const placeholder = document.getElementById(opts.placeholderId);
  const uploading   = document.getElementById(opts.uploadingId);
  const previewWrap = document.getElementById(opts.previewWrapId);
  const previewImg  = document.getElementById(opts.previewImgId);
  const fileNameEl  = document.getElementById(opts.fileNameId);
  const errorState  = document.getElementById(opts.errorId);
  const errorMsg    = document.getElementById(opts.errorMsgId);

  if (!zone || !picker) return;

  const show = (el) => {
    [placeholder, uploading, previewWrap, errorState].forEach(e => {
      if (e) e.style.display = 'none';
    });
    if (el) el.style.display = '';
  };

  // Click on zone → open file picker
  zone.addEventListener('click', () => picker.click());

  // Prevent double-fire when clicking children inside zone
  picker.addEventListener('click', e => e.stopPropagation());

  // Drag-and-drop support
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) _handleFile(file);
  });

  // File selected via picker
  picker.addEventListener('change', () => {
    if (picker.files[0]) _handleFile(picker.files[0]);
    picker.value = ''; // allow re-selecting the same file
  });

  async function _handleFile(file) {
    // Validate type
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      if (errorMsg) errorMsg.textContent = 'Unsupported file type. Use PNG, JPG, or WebP.';
      show(errorState);
      return;
    }
    // Validate size
    if (file.size > opts.maxBytes) {
      const mb = (opts.maxBytes / 1024 / 1024).toFixed(0);
      if (errorMsg) errorMsg.textContent = `File is too large. Maximum size is ${mb} MB.`;
      show(errorState);
      return;
    }

    // Show local preview immediately for fast feedback
    const localUrl = URL.createObjectURL(file);
    if (previewImg) previewImg.src = localUrl;
    if (fileNameEl) fileNameEl.textContent = file.name;
    show(uploading);

    try {
      const vendorId = state.currentUser?.id;
      if (!vendorId) throw new Error('Not logged in');

      const publicUrl = await _uploadToStorage(file, vendorId, opts.storagePrefix);
      opts.onSuccess(publicUrl);

      // Keep the local blob as preview (saves an extra network round-trip)
      if (previewImg) previewImg.src = localUrl;
      show(previewWrap);
    } catch (err) {
      console.error('Image upload failed:', err);
      if (errorMsg) errorMsg.textContent = (err.message || 'Upload failed') + ' — tap to try again';
      show(errorState);
    }
  }
}

// ── Exported dashboard functions ───────────────────────────────────────────────

window.loadSettings = async function () {
  if (!state.currentUser) return;

  // Reset pending upload URLs each time the settings are loaded
  _logoUrl   = null;
  _bannerUrl = null;

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

  // Appearance — theme colour
  const themeColorEl = document.getElementById('setThemeColor');
  if (themeColorEl) themeColorEl.value = state.currentUser.theme_color || '#1f6e43';

  // Logo — show existing preview if there's already a logo stored
  if (state.currentUser.logo_url) {
    const previewImg = document.getElementById('logoPreview');
    const previewWrap = document.getElementById('logoPreviewWrap');
    const placeholder = document.getElementById('logoPlaceholder');
    const fileNameEl  = document.getElementById('logoFileName');
    if (previewImg)  previewImg.src = state.currentUser.logo_url;
    if (fileNameEl)  fileNameEl.textContent = 'Current logo';
    if (placeholder) placeholder.style.display = 'none';
    if (previewWrap) previewWrap.style.display = '';
    // Indicate this is the saved (not newly uploaded) image
    const badge = previewWrap && previewWrap.querySelector('.img-upload-success-badge');
    if (badge) badge.innerHTML = '<i class="bi bi-cloud-check-fill"></i> Saved';
  }

  // Banner — show existing preview if there's already a banner stored
  if (state.currentUser.banner_url) {
    const previewImg  = document.getElementById('bannerPreview');
    const previewWrap = document.getElementById('bannerPreviewWrap');
    const placeholder = document.getElementById('bannerPlaceholder');
    const fileNameEl  = document.getElementById('bannerFileName');
    if (previewImg)  previewImg.src = state.currentUser.banner_url;
    if (fileNameEl)  fileNameEl.textContent = 'Current banner';
    if (placeholder) placeholder.style.display = 'none';
    if (previewWrap) previewWrap.style.display = '';
    const badge = previewWrap && previewWrap.querySelector('.img-upload-success-badge');
    if (badge) badge.innerHTML = '<i class="bi bi-cloud-check-fill"></i> Saved';
  }

  // Wire up image pickers
  _setupImagePicker({
    zoneId:        'logoUploadZone',
    pickerId:      'logoFilePicker',
    placeholderId: 'logoPlaceholder',
    uploadingId:   'logoUploadingState',
    previewWrapId: 'logoPreviewWrap',
    previewImgId:  'logoPreview',
    fileNameId:    'logoFileName',
    errorId:       'logoErrorState',
    errorMsgId:    'logoErrorMsg',
    maxBytes:      2 * 1024 * 1024,   // 2 MB
    storagePrefix: 'logo',
    onSuccess: (url) => { _logoUrl = url; },
  });

  _setupImagePicker({
    zoneId:        'bannerUploadZone',
    pickerId:      'bannerFilePicker',
    placeholderId: 'bannerPlaceholder',
    uploadingId:   'bannerUploadingState',
    previewWrapId: 'bannerPreviewWrap',
    previewImgId:  'bannerPreview',
    fileNameId:    'bannerFileName',
    errorId:       'bannerErrorState',
    errorMsgId:    'bannerErrorMsg',
    maxBytes:      5 * 1024 * 1024,   // 5 MB
    storagePrefix: 'banner',
    onSuccess: (url) => { _bannerUrl = url; },
  });

  // Layout
  const layout   = state.currentUser.layout || 'grid';
  const layoutEl = document.getElementById(layout === 'list' ? 'layoutList' : 'layoutGrid');
  if (layoutEl) layoutEl.checked = true;

  // Notification channel
  const channel   = state.currentUser.notification_channel || 'whatsapp';
  const channelEl = document.getElementById(channel === 'telegram' ? 'channelTelegram' : 'channelWhatsapp');
  if (channelEl) channelEl.checked = true;
  _updateTelegramSection(channel);

  // Telegram linked/unlinked status
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

function _updateTelegramSection(channel) {
  const sec = document.getElementById('telegramSection');
  if (sec) sec.style.display = channel === 'telegram' ? 'block' : 'none';
}

window.openTelegramLink = function () {
  const botUsername = TELEGRAM_BOT_USERNAME;
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
  const themeColorEl = document.getElementById('setThemeColor');
  const layoutRadio  = document.querySelector('input[name="storeLayout"]:checked');
  const notifRadio   = document.querySelector('input[name="notifChannel"]:checked');

  const updatedData = {
    business_name:        document.getElementById('setBizName').value.trim(),
    slug:                 newSlug,
    whatsapp_number:      document.getElementById('setWaNumber').value.trim(),
    bio:                  document.getElementById('setBio').value.trim(),
    vacation_mode:        vacationEl  ? vacationEl.checked : false,
    order_template:       (isPremium && templateEl) ? templateEl.value.trim() || null : state.currentUser.order_template || null,
    // Use the newly-uploaded URL if available, otherwise keep the existing one
    logo_url:             _logoUrl   ?? state.currentUser.logo_url   ?? null,
    banner_url:           _bannerUrl ?? state.currentUser.banner_url ?? null,
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

    // Clear pending upload references now that they're saved
    _logoUrl   = null;
    _bannerUrl = null;

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

    btn.innerHTML = '<i class="bi bi-check-lg"></i> Saved!';
    setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
  }
};
