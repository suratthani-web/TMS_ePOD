import type { NextConfig } from "next";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  workboxOptions: {
    importScripts: ["/sw-push.js"],
    // Exclude dynamic pages from Service Worker caching to prevent no-response errors
    exclude: [
      /chat/,
      /planning/,
      /billing/,
      /drivers/,
      /dashboard/,
      /monitoring/,
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname),
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
        {
            protocol: 'https',
            hostname: 'jhksvhujsrbkeyzpvpog.supabase.co',
        },
        {
            protocol: 'https',
            hostname: 'drive.google.com',
        },
        {
            protocol: 'https',
            hostname: 'lh3.googleusercontent.com',
        }
    ]
  },
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
