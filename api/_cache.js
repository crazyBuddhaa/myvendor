// ─── SERVER-SIDE IN-MEMORY CACHE ──────────────────────────────────────────────
//
// Auto-activates when the platform reaches CACHE_THRESHOLD vendors.
// Uses a module-level Map so the cache persists across warm Vercel invocations
// (same Lambda container). On cold starts the cache is empty — acceptable.
//
// TTLs:
//   Vendor-count check : 10 min  (so the threshold re-check is almost free)
//   Store / product HTML: 5 min  (stale-while-revalidate handled by CDN headers)
//
// Cache-Control headers sent to Vercel's edge:
//   public, s-maxage=300, stale-while-revalidate=600
//   → Vercel edge caches for 5 min; serves stale for 10 more min while revalidating.
//   → When below threshold these headers are omitted so every request is fresh.

const CACHE_THRESHOLD      = 100;           // activate at this many vendors
const DEFAULT_TTL_MS       = 5 * 60 * 1000; // 5 min for store / product HTML
const VENDOR_COUNT_TTL_MS  = 10 * 60 * 1000;// 10 min for the vendor-count value

/** @type {Map<string, { value: any, expiresAt: number }>} */
const _store = new Map();

// ── Core primitives ────────────────────────────────────────────────────────────

/**
 * Returns the cached value for `key`, or null if missing / expired.
 */
export function cacheGet(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        _store.delete(key);
        return null;
    }
    return entry.value;
}

/**
 * Stores `value` under `key` with an optional TTL (default 5 min).
 */
export function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
    _store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Removes a single key (call on data mutations to bust the cache immediately).
 */
export function cacheDel(key) {
    _store.delete(key);
}

/**
 * Returns total number of entries currently in cache (for diagnostics).
 */
export function cacheSize() {
    return _store.size;
}

// ── Threshold gate ─────────────────────────────────────────────────────────────

/**
 * Returns true if the vendor count is >= CACHE_THRESHOLD.
 *
 * Uses the Supabase REST `Prefer: count=exact` trick to get the row count
 * in a single cheap HEAD-like request (fetches 0 rows, just reads the header).
 * The result is itself cached for VENDOR_COUNT_TTL_MS so this costs almost
 * nothing on warm invocations.
 */
export async function cacheIsActive(supabaseUrl, supabaseKey) {
    const COUNT_KEY = '__vendor_count__';

    const cached = cacheGet(COUNT_KEY);
    if (cached !== null) {
        return cached >= CACHE_THRESHOLD;
    }

    try {
        const res = await fetch(
            `${supabaseUrl}/rest/v1/vendor_profiles?select=id`,
            {
                method: 'GET',
                headers: {
                    apikey:        supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`,
                    'Prefer':      'count=exact',
                    'Range-Unit':  'items',
                    'Range':       '0-0',   // fetch 0 rows — we only need the count header
                },
            }
        );

        // Supabase returns Content-Range: 0-0/<total>
        const contentRange = res.headers.get('content-range') || '';
        const total = parseInt(contentRange.split('/')[1] || '0', 10);

        cacheSet(COUNT_KEY, total, VENDOR_COUNT_TTL_MS);
        return total >= CACHE_THRESHOLD;
    } catch {
        // If the count check fails, don't enable caching — be conservative.
        return false;
    }
}

// ── HTTP Cache-Control helper ──────────────────────────────────────────────────

/**
 * Sets Cache-Control headers that instruct Vercel's edge CDN to cache the
 * response for 5 min, and serve stale for 10 more min while it revalidates.
 * Only called when cacheIsActive() returns true.
 */
export function setCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
}
