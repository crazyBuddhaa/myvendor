import { supabase, checkAuth } from './supabase.js';

// ─── 1. AUTH & INIT ──────────────────────────────────────────────
let currentUser = null;

async function initDashboard() {
    currentUser = await checkAuth();
    if (!currentUser) return; // checkAuth will redirect them to login

    // HOME PAGE LOGIC
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
        const { data } = await supabase.from('vendor_profiles').select('*').eq('id', currentUser.id).single();
        if (data) {
            welcomeName.innerText = `Welcome, ${data.business_name} 👋`;
            document.getElementById('storeLink').innerText = `myvendor.qzz.io/${data.slug}`;
            const waMsg = encodeURIComponent(`Shop my latest collection here: https://myvendor.qzz.io/${data.slug}`);
            document.getElementById('waShareBtn').href = `https://wa.me/?text=${waMsg}`;
            
            // Save slug globally so we can use it to generate product links later
            window.vendorSlug = data.slug;
        }
    }

    // INVENTORY PAGE LOGIC
    const productList = document.getElementById('productList');
    if (productList) {
        // Fetch slug for the copy link function if they refresh straight to the inventory page
        const { data } = await supabase.from('vendor_profiles').select('slug').eq('id', currentUser.id).single();
        if (data) window.vendorSlug = data.slug;
        
        await window.loadProducts();
    }
}

// ─── 2. SAVE PRODUCT LOGIC (Add Product Page) ────────────────────
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
        // Get Form Values
        const title = document.getElementById('prodTitle').value;
        const price = document.getElementById('prodPrice').value;
        const category = document.getElementById('prodCategory').value;
        const desc = document.getElementById('prodDesc').value;
        const inStock = document.getElementById('stockSwitch').checked;
        
        // Handle Variants
        let variantsJson = [];
        if(document.getElementById('variantSwitch') && document.getElementById('variantSwitch').checked) {
            const sizes = document.getElementById('varSizes').value.split(',').map(s => s.trim()).filter(Boolean);
            const colors = document.getElementById('varColors').value.split(',').map(c => c.trim()).filter(Boolean);
            if(sizes.length > 0) variantsJson.push({ name: "Size", options: sizes });
            if(colors.length > 0) variantsJson.push({ name: "Color", options: colors });
        }

        // Handle Image Upload
        const fileInput = document.getElementById('fileInput');
        let finalImageUrl = null;

        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentUser.id}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to Supabase Bucket
            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get the public URL for the image so buyers can see it
            const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
            finalImageUrl = publicUrlData.publicUrl;
        }

        // Save to Database
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

        // Redirect back to inventory upon success
        window.location.href = '/dashboard/products.html';

    } catch (error) {
        console.error("Error saving product:", error);
        alert("Failed to save product: " + error.message);
        
        // Reset button if error occurs
        btnSave.disabled = false;
        spinner.style.display = 'none';
        icon.style.display = 'inline';
        label.innerText = 'Save Product';
    }
};

// ─── 3. ADD PRODUCT UI LOGIC ───────────────────────────────────────
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

window.clearImage = function(event) {
    event.preventDefault();
    document.getElementById('fileInput').value = '';
    document.getElementById('imagePreview').src = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('removeImgBtn').style.display = 'none';
}

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

// ─── 4. INVENTORY LOGIC (Products Page) ──────────────────────────
window.loadProducts = async function() {
    const productList = document.getElementById('productList');
    const emptyState = document.getElementById('emptyState');

    if (!productList) return;

    productList.innerHTML = '<div class="text-center py-4 text-muted">Loading your products...</div>';

    // Fetch from Supabase
    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching products:', error);
        productList.innerHTML = '<div class="text-center text-danger py-4">Failed to load products.</div>';
        return;
    }

    if (!products || products.length === 0) {
        productList.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    
    // Build the HTML
    let html = '';
    products.forEach(p => {
        const stockBadge = p.in_stock 
            ? '<span class="stock-badge stock-in">In Stock</span>' 
            : '<span class="stock-badge stock-out">Out of Stock</span>';
        
        const imgHtml = p.image_url 
            ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`
            : `<span style="font-size:2rem;">📦</span>`;

        html += `
        <div class="product-card" data-category="${p.category || 'other'}">
            <div class="prod-img" style="background:#f1f5f9; overflow:hidden;">
                ${imgHtml}
            </div>
            <div class="prod-details">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="prod-title">${p.title}</div>
                    ${stockBadge}
                </div>
                <div class="prod-price">₦${parseFloat(p.price).toLocaleString()}</div>
                <div class="prod-meta">Category: ${p.category || 'N/A'}</div>
                
                <div class="prod-actions">
                    <button class="btn-action copy" onclick="copyProductLink('${p.id}')">
                        <i class="bi bi-link-45deg"></i> Link
                    </button>
                    <button class="btn-action delete" onclick="deleteProduct('${p.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });

    productList.innerHTML = html;
}

window.deleteProduct = async function(productId) {
    if(confirm('Are you sure you want to delete this product?')) {
        const { error } = await supabase.from('products').delete().eq('id', productId);
        if (error) {
            alert("Failed to delete: " + error.message);
        } else {
            window.loadProducts(); // Instantly refresh the list
        }
    }
}

window.copyProductLink = function(productId) {
    const slug = window.vendorSlug || 'store';
    const linkText = `myvendor.qzz.io/product/?vendor=${slug}&id=${productId}`;
    
    navigator.clipboard.writeText(`https://${linkText}`).then(() => {
        const toast = document.getElementById('toastMsg');
        if (toast) {
            toast.innerText = 'Product link copied!';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        } else {
            alert('Link copied: ' + linkText);
        }
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// ─── 5. INVENTORY SEARCH (Client Side) ───────────────────────────
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('keyup', function(e) {
        const term = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.product-card');
        let visibleCount = 0;
        
        cards.forEach(card => {
            const title = card.querySelector('.prod-title').innerText.toLowerCase();
            if(title.includes(term)) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            if(visibleCount === 0 && cards.length > 0) {
                emptyState.classList.remove('hidden');
                emptyState.querySelector('.empty-title').innerText = "No products found";
                emptyState.querySelector('p').innerText = "Try a different search term.";
                const btnAdd = emptyState.querySelector('.btn-add');
                if (btnAdd) btnAdd.classList.add('hidden');
            } else if (cards.length > 0) {
                emptyState.classList.add('hidden');
            }
        }
    });
}

// Initialize everything on load
initDashboard();