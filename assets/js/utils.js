// ─── SHARED BROWSER UTILITIES ─────────────────────────────────────────────────
// Used by: dashboard modules, storefront.js

/**
 * Escapes user-supplied strings before injecting them into HTML.
 * Prevents XSS by converting the five dangerous characters to HTML entities.
 */
export const escapeHTML = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * Injects Cloudinary compression parameters into an image URL if not already present.
 * Saves bandwidth by requesting web-optimised sizes instead of originals.
 */
export const optimizeCloudinaryUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    if (url.includes('/upload/w_') || url.includes('/upload/q_')) return url;
    return url.replace('/upload/', '/upload/w_600,q_auto,f_auto/');
};
