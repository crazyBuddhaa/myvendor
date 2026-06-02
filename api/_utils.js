// ─── SHARED SERVER-SIDE UTILITIES ─────────────────────────────────────────────
// Used by: api/product.js, api/store.js
// These run in Node.js (Vercel serverless functions), not in the browser.

/**
 * Escapes user-supplied strings before injecting them into server-rendered HTML.
 * Prevents reflected XSS in OG-tag pages served to crawlers and bots.
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;');
}

/**
 * Strips all characters except alphanumerics, hyphens, and underscores from a
 * product ID so it is safe to embed in a JavaScript string literal.
 */
export function sanitizeId(str) {
    if (!str) return '';
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Strips all characters except alphanumerics, hyphens, and underscores from a
 * vendor slug so it is safe to embed in a JavaScript string literal.
 */
export function sanitizeSlug(str) {
    if (!str) return '';
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '');
}
