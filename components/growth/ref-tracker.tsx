'use client';

/**
 * RefTracker — invisible client component that fires a growth visit signal
 * when the page loads with a ?ref= or foldera_ref cookie.
 *
 * Mount this on public pages: /, /try, /start, /pricing
 * It reads the cookie set by middleware.ts and POSTs to /api/growth/visit.
 */

import { useEffect } from 'react';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function RefTracker() {
  useEffect(() => {
    const ref = getCookie('foldera_ref');
    if (!ref) return;

    // Only fire once per session
    const key = `foldera_ref_logged_${ref}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;

    fetch('/api/growth/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, path: window.location.pathname }),
    }).catch(() => { /* non-critical */ });

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, '1');
    }
  }, []);

  return null;
}
