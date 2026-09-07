'use client';

declare global {
  interface Window {
    L?: any;
    __smartBrokerLeafletLoader?: Promise<any>;
  }
}

const LEAFLET_CSS_ID = 'smartbroker-leaflet-css';
const LEAFLET_SCRIPT_ID = 'smartbroker-leaflet-script';

/**
 * Loads the small browser-only map library only when a map dialog is opened.
 * It is intentionally not a bundled application dependency: Firebase App
 * Hosting's constrained builder previously terminated while processing it.
 */
export async function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('Map is available only in the browser.');
  if (window.L) return window.L;

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const css = document.createElement('link');
    css.id = LEAFLET_CSS_ID;
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
  }

  if (!window.__smartBrokerLeafletLoader) {
    window.__smartBrokerLeafletLoader = new Promise((resolve, reject) => {
      const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Map library loaded without a usable map engine.')), { once: true });
        existing.addEventListener('error', () => reject(new Error('Map library could not load.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = LEAFLET_SCRIPT_ID;
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Map library loaded without a usable map engine.'));
      script.onerror = () => reject(new Error('Map library could not load.'));
      document.head.appendChild(script);
    });
  }

  return window.__smartBrokerLeafletLoader;
}
