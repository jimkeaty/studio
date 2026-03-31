import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
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
