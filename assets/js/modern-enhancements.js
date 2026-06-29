/**
 * myvendor — Modern UI Enhancements
 * Reactive micro-interactions, scroll reveals, and animation helpers.
 * Drop this script at the bottom of every dashboard page.
 */
(function () {
  'use strict';

  /* ── Utility: show toast ─────────────────────────────────── */
  window.showToast = function (msg, duration = 2500) {
    let el = document.querySelector('.toast-vendor') || document.querySelector('.toast-modern');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast-vendor';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), duration);
  };

  /* ── Ripple effect on buttons ────────────────────────────── */
  document.addEventListener('pointerdown', function (e) {
    const btn = e.target.closest('button,a,.action-modern-card,.filter-pill-modern');
    if (!btn || btn.closest('.bottom-nav') || btn.hasAttribute('data-no-ripple')) return;
    const r = document.createElement('span');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5;
    r.style.cssText = `
      position:absolute;width:${size}px;height:${size}px;
      left:${e.clientX - rect.left - size / 2}px;
      top:${e.clientY - rect.top - size / 2}px;
      border-radius:50%;background:rgba(34,197,94,.18);
      pointer-events:none;transform:scale(0);
      animation:_ripple .55s cubic-bezier(.4,0,.2,1) forwards;
    `;
    if (!document.querySelector('#_rippleKF')) {
      const s = document.createElement('style');
      s.id = '_rippleKF';
      s.textContent = '@keyframes _ripple{to{transform:scale(1);opacity:0}}';
      document.head.appendChild(s);
    }
    const prev = window.getComputedStyle(btn).position;
    if (prev === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(r);
    setTimeout(() => r.remove(), 600);
  });

  /* ── Intersection Observer: fade-up on scroll ───────────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(
    '.stat-fresh-card,.order-card-modern,.product-card,.action-modern-card,.orders-panel,.share-card'
  ).forEach((el, i) => {
    el.style.animationPlayState = 'paused';
    el.style.animationDelay = (i * 0.06) + 's';
    io.observe(el);
  });

  /* ── Number counter animation ────────────────────────────── */
  window.animateCount = function (el, end, prefix = '', suffix = '', duration = 900) {
    const start = 0;
    const startTime = performance.now();
    const fmt = n => prefix + n.toLocaleString('en-NG') + suffix;
    const step = (t) => {
      const progress = Math.min((t - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = fmt(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ── Auto-animate stat values ────────────────────────────── */
  document.querySelectorAll('[data-count]').forEach(el => {
    const val = parseFloat(el.dataset.count.replace(/[^0-9.]/g, ''));
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    window.animateCount(el, val, prefix, suffix);
  });

  /* ── Pull-to-refresh indicator (mobile) ─────────────────── */
  let startY = 0;
  let ptr = null;
  document.addEventListener('touchstart', e => { startY = e.touches[0].pageY; }, { passive: true });
  document.addEventListener('touchmove', e => {
    const delta = e.touches[0].pageY - startY;
    if (window.scrollY === 0 && delta > 60) {
      if (!ptr) {
        ptr = document.createElement('div');
        ptr.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);background:var(--green-primary);color:white;padding:.45rem 1.2rem;border-radius:0 0 30px 30px;font-size:.72rem;font-weight:700;z-index:9999;opacity:.92;';
        ptr.textContent = '↓ Pull to refresh';
        document.body.appendChild(ptr);
      }
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (ptr) { ptr.remove(); ptr = null; }
  });

  /* ── Active nav item highlight ───────────────────────────── */
  const path = window.location.pathname;
  document.querySelectorAll('.bottom-nav-item').forEach(a => {
    const href = a.getAttribute('href');
    if (href && path.endsWith(href.split('/').pop())) {
      a.classList.add('active');
    }
  });

  /* ── Smooth back navigation ──────────────────────────────── */
  document.querySelectorAll('.btn-back-modern[href="#"]').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); history.back(); });
  });

  /* ── Form input: floating focus label ────────────────────── */
  document.querySelectorAll('.form-control-modern').forEach(inp => {
    inp.addEventListener('focus', () => {
      inp.closest('.input-icon-wrapper')?.querySelector('.input-icon')?.style.setProperty('color', 'var(--green-primary)');
    });
    inp.addEventListener('blur', () => {
      inp.closest('.input-icon-wrapper')?.querySelector('.input-icon')?.style.removeProperty('color');
    });
  });

  /* ── Long-press context on product cards ─────────────────── */
  document.querySelectorAll('.product-card').forEach(card => {
    let timer;
    card.addEventListener('pointerdown', () => {
      timer = setTimeout(() => card.classList.toggle('bulk-selected'), 500);
    });
    card.addEventListener('pointerup',    () => clearTimeout(timer));
    card.addEventListener('pointerleave', () => clearTimeout(timer));
  });

  /* ── Skeleton auto-replace ───────────────────────────────── */
  window.hideSkeleton = function (wrapperSelector) {
    const el = document.querySelector(wrapperSelector);
    if (el) { el.style.display = 'none'; }
  };

  /* ── Copy text helper ─────────────────────────────────────── */
  window.copyText = async function (text, feedbackEl) {
    try {
      await navigator.clipboard.writeText(text);
      if (feedbackEl) {
        const orig = feedbackEl.textContent;
        feedbackEl.textContent = '✓ Copied!';
        setTimeout(() => { feedbackEl.textContent = orig; }, 1800);
      }
      showToast('✓ Copied to clipboard');
    } catch {
      showToast('Could not copy — please copy manually');
    }
  };

})();
