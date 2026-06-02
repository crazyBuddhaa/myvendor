// ─── DASHBOARD ENTRY POINT ────────────────────────────────────────────────────
// This file is intentionally thin. All logic lives in assets/js/modules/.
//
// Module map:
//   core.js      — auth, initDashboard, premium modal, logout
//   home.js      — loadHomeDashboard
//   products.js  — product CRUD (load, save, edit, delete, copy link)
//   orders.js    — order management, receipts, status modal
//   analytics.js — analytics view
//   settings.js  — store settings
//
// Shared utilities:
//   utils.js     — escapeHTML, optimizeCloudinaryUrl
//   constants.js — BASE_PRODUCT_LIMIT, FREE_RECEIPT_LIMIT
//   state.js     — mutable dashboard state (currentUser, vendorSlug, freeProductLimit)

import { initDashboard } from './modules/core.js';
import './modules/home.js';
import './modules/products.js';
import './modules/orders.js';
import './modules/analytics.js';
import './modules/settings.js';

initDashboard();
