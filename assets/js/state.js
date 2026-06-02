// ─── DASHBOARD SHARED STATE ───────────────────────────────────────────────────
// A single mutable object shared across all dashboard modules.
// Populated by core.js during initDashboard(); read by every other module.
//
// Why an object instead of named exports?
// ES module bindings are live for imported *bindings*, but reassigning a local
// variable in one module does not update the binding seen by other modules.
// Mutating properties on a shared object is the standard pattern for mutable
// cross-module state without a framework.

import { BASE_PRODUCT_LIMIT } from './constants.js';

export const state = {
    /** Full vendor_profiles row for the authenticated user. */
    currentUser: null,

    /** The vendor's unique store slug (e.g. "ade-fabrics"). */
    vendorSlug: null,

    /** Base limit + any referral bonus slots earned by this vendor. */
    freeProductLimit: BASE_PRODUCT_LIMIT,
};
