import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    // IMPORTANT: The root login page ('/') and any Google OAuth callback routes
    // must NOT be cached by the service worker. If the SW intercepts the Google
    // redirect result, Firebase Auth cannot process the credential and the user
    // gets stuck in a login → Google → login loop on Chrome mobile.
    // We use navigateFallbackDenylist to exclude these routes from the SW shell.
    navigateFallbackDenylist: [
      // Root login page — must always hit the network so getRedirectResult works
      /^\/$/,
      // Firebase / Google OAuth callback paths
      /^\/__\/auth\/.*/,
    ],
    // Cache strategies for different route types
    runtimeCaching: [
      // Cache Google Fonts
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // Cache static assets
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets-cache',
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // Network-first for API routes (always fresh data)
      {
        urlPattern: /^\/api\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 5 },
          networkTimeoutSeconds: 10,
        },
      },
      // Network-first for the login page — never serve from cache so that
      // the Google OAuth redirect result can always be processed correctly.
      {
        urlPattern: /^\/$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'login-page-cache',
          networkTimeoutSeconds: 5,
        },
      },
      // Stale-while-revalidate for dashboard pages
      {
        urlPattern: /^\/dashboard\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'dashboard-pages-cache',
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - valid Next.js config option
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  devIndicators: {},
  allowedDevOrigins: [
    'https://6000-firebase-studio-1769876482166.cluster-ocv3ypmyqfbqysslgd7zlhmxek.cloudworkstations.dev',
  ],
};

export default withPWA(nextConfig);
