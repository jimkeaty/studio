'use client';

declare global {
  interface Window {
    L?: any;
    __smartBrokerLeafletLoader?: Promise<any>;
  }
}

const LEAFLET_CSS_ID = 'smartbroker-leaflet-css';
const LEAFLET_SCRIPT_ID = 'smartbroker-leaflet-script';
const LEAFLET_LOAD_TIMEOUT_MS = 15_000;

function ensureLeafletCss() {
  if (document.getElementById(LEAFLET_CSS_ID)) return;
  const css = document.createElement('link');
  css.id = LEAFLET_CSS_ID;
  css.rel = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);
}

function loadLeafletScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    const staleScript = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
    if (staleScript) staleScript.remove();

    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('Map library timed out while loading. Please retry.'));
    }, LEAFLET_LOAD_TIMEOUT_MS);

    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      callback();
    };

    script.id = LEAFLET_SCRIPT_ID;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => finish(() => window.L
      ? resolve(window.L)
      : reject(new Error('Map library loaded without a usable map engine.')),
    );
    script.onerror = () => finish(() => reject(new Error('Map library could not load. Please retry.')));
    document.head.appendChild(script);
  });
}

/**
 * Loads the small browser-only map library only when a map dialog is opened.
 * It is intentionally not a bundled application dependency: Firebase App
 * Hosting's constrained builder previously terminated while processing it.
 */
export async function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('Map is available only in the browser.');
  if (window.L) return window.L;

  ensureLeafletCss();

  if (!window.__smartBrokerLeafletLoader) {
    window.__smartBrokerLeafletLoader = loadLeafletScript().catch((error) => {
      // Do not permanently cache a transient CDN/ad-blocker/network error.
      // The next open can retry the map library normally.
      window.__smartBrokerLeafletLoader = undefined;
      document.getElementById(LEAFLET_SCRIPT_ID)?.remove();
      throw error;
    });
  }

  return window.__smartBrokerLeafletLoader;
}
