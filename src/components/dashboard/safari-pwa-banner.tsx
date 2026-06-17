'use client';
/**
 * SafariPwaBanner
 *
 * Shown on the dashboard when the user is in regular Safari (not the home
 * screen PWA). Guides them to use the app directly from Safari rather than
 * trying to sign in from the home screen icon, which cannot share the session.
 *
 * Only shown on iOS Safari (not desktop, not Chrome, not the PWA itself).
 * Dismissed permanently via localStorage.
 */
import { useEffect, useState } from 'react';
import { X, Share } from 'lucide-react';

export function SafariPwaBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show on iOS Safari — not in the PWA, not on desktop
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone === true;
    const dismissed = localStorage.getItem('safari_pwa_banner_dismissed') === '1';

    if (isIOS && !isStandalone && !dismissed) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem('safari_pwa_banner_dismissed', '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="sticky top-0 z-50 flex items-start justify-between gap-3 bg-blue-600 px-4 py-3 text-white shadow-md">
      <div className="flex items-start gap-2 text-sm">
        <Share className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Tip: Save to your home screen</p>
          <p className="text-blue-100 text-xs mt-0.5">
            Tap the Share button{' '}
            <span className="inline-block align-middle">
              <Share className="h-3 w-3 inline" />
            </span>{' '}
            then &ldquo;Add to Home Screen&rdquo; to open this dashboard with one tap — you&apos;ll stay signed in automatically.
          </p>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 hover:bg-blue-500"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
