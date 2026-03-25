import { supabase, checkAuth } from './supabase.js';

// ─── 1. AUTH PROTECTION ──────────────────────────────────────────
// Runs automatically when this file loads
let currentUser = null;

async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return; // checkAuth will redirect them

    // If we are on the home page, load the vendor's name
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
        const { data } = await supabase.from('vendor_profiles').select('*').eq('id', currentUser.id).single();
        if (data) {
            welcomeName.innerText = `Welcome, ${data.business_name} 👋`;
            document.getElementById('storeLink').innerText = `myvendor.ng/${data.slug}`;
            const waMsg = encodeURIComponent(`Shop my latest collection here: https://myvendor.ng/${data.slug}`);
            document.getElementById('waShareBtn').href = `https://wa.me/?text=${waMsg}`;
        }
    }
}

// ─── 2. SAVE PRODUCT LOGIC ───────────────────────────────────────
// We expose this to the window so the HTML form's onsubmit can find it
window.saveProduct = async function(event) {
    event.preventDefault();
    if (!currentUser) return;

    // Show loading state
    const btnSave = document.getElementById('btnSave');
    const spinner = document.getElementById('saveSpinner');
    const icon = document.getElementById('saveIcon');
    const label = document.getElementById('saveLabel');
    
    btnSave.disabled = true;
    spinner.style.display = 'block';
    icon.style.display = 'none';
    label.innerText = 'Uploading...';

    try {
        // 1. Get Form Values
        const title = document.getElementById('prodTitle').value;
        const price = document.getElementById('prodPrice').value;
        const category = document.getElementById('prodCategory').value;
        const desc = document.getElementById('prodDesc').value;
        const inStock = document.getElementById('stockSwitch').checked;
        
        // 2. Handle Variants
        let variantsJson = [];
        if(document.getElementById('variantSwitch').checked) {
            const sizes = document.getElementById('varSizes').value.split(',').map(s => s.trim()).filter(Boolean);
            const colors = document.getElementById('varColors').value.split(',').map(c => c.trim()).filter(Boolean);
            if(sizes.length > 0) variantsJson.push({ name: "Size", options: sizes });
            if(colors.length > 0) variantsJson.push({ name: "Color", options: colors });
        }

        // 3. Handle Image Upload
        const fileInput = document.getElementById('fileInput');
        let finalImageUrl = null;

        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            // Create a unique file name so images don't overwrite each other
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentUser.id}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to Supabase Storage
            const { error: uploadError, data: uploadData } = await supabase.storage
                .from('product-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get the public URL for the image
            const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
            finalImageUrl = publicUrlData.publicUrl;
        }

        // 4. Save to Database
        label.innerText = 'Saving...';
        const { error: dbError } = await supabase.from('products').insert([
            {
                vendor_id: currentUser.id,
                title: title,
                price: price,
                category: category,
                description: desc,
                in_stock: inStock,
                variants: variantsJson.length > 0 ? variantsJson : null,
                image_url: finalImageUrl
            }
        ]);

        if (dbError) throw dbError;

        // Success! Redirect back to inventory
        window.location.href = '/dashboard/products.html';

    } catch (error) {
        console.error("Error saving product:", error);
        alert("Failed to save product: " + error.message);
        
        // Reset button
        btnSave.disabled = false;
        spinner.style.display = 'none';
        icon.style.display = 'inline';
        label.innerText = 'Save Product';
    }
};

// Initialize dashboard logic when the script loads
initDashboard();

// Initialize dashboard logic when the script loads
initDashboard();

// ─── 3. ADD PRODUCT UI LOGIC ───────────────────────────────────────

// Make Image Preview Work Again
window.previewImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
            document.getElementById('removeImgBtn').style.display = 'flex';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// Make Remove Image Work Again
window.clearImage = function(event) {
    event.preventDefault();
    document.getElementById('fileInput').value = '';
    document.getElementById('imagePreview').src = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('removeImgBtn').style.display = 'none';
}

// Make Variant Toggle Work Again
window.toggleVariants = function() {
    const isChecked = document.getElementById('variantSwitch').checked;
    const box = document.getElementById('variantsBox');
    if(isChecked) {
        box.classList.remove('hidden');
    } else {
        box.classList.add('hidden');
        document.getElementById('varSizes').value = '';
        document.getElementById('varColors').value = '';
    }
}