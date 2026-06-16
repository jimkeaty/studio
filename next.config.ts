import type { NextConfig } from 'next';

// NOTE: We are NOT using next-pwa / Workbox auto-generation.
// The previous Workbox-generated sw.js had an opaqueredirect handler on '/'
// that intercepted the Google OAuth redirect on mobile Chrome and prevented
// Firebase Auth from processing the credential — causing an infinite login loop.
//
// Instead we ship a hand-written public/sw.js that:
//   - Clears all old Workbox caches on first install
//   - Never intercepts '/', '/__/auth/*', or '/api/*'
//   - Uses safe NetworkFirst for dashboard pages
//   - Does not modify redirect responses

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

export default nextConfig;
