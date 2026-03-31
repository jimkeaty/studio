import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Type checking is handled by `tsc --noEmit` in the prebuild script.
    // We disable Next.js's own duplicate type check to avoid version mismatches
    // between local and Firebase's build environment.
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
