// ── Option C redirect endpoint ────────────────────────────────────────────────
// The Supabase confirmation email template wraps the confirmation URL like:
//   https://myvendor.qzz.io/r?to={{ .ConfirmationURL | urlquery }}
//
// This means Gmail only sees myvendor.qzz.io in the button href, not the
// Supabase project subdomain that triggers spam filters.
//
// Security: only Supabase auth URLs are allowed through — everything else
// is silently dropped and the visitor lands on the homepage.

export default async function handler(req, res) {
  const { to } = req.query;

  if (!to) return res.redirect(302, '/');

  let target;
  try {
    target = new URL(decodeURIComponent(to));
  } catch {
    return res.redirect(302, '/');
  }

  // Allowlist: only redirect to Supabase-hosted auth URLs
  const allowed =
    target.hostname.endsWith('.supabase.co') ||
    target.hostname.endsWith('.supabase.net');

  if (!allowed) return res.redirect(302, '/');

  return res.redirect(302, target.toString());
}
