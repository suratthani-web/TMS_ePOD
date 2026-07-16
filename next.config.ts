import type { NextConfig } from "next";
import path from "path";

type PrecacheManifestEntry = {
  url: string;
  revision?: string | null;
  integrity?: string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextPWA = require("@ducanh2912/next-pwa");
const withPWA = nextPWA.default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  workboxOptions: {
    importScripts: ["/sw-push.js"],
    runtimeCaching: [
      {
        urlPattern: /\/_next\/static\/.*\.js$/i,
        handler: "NetworkOnly",
        options: {
          cacheName: "next-static-js-network-only",
        },
      },
      ...nextPWA.runtimeCaching.filter((entry: { options?: { cacheName?: string } }) => (
        entry.options?.cacheName !== "next-static-js-assets" &&
        entry.options?.cacheName !== "static-js-assets"
      )),
    ],
    // Exclude app chunks from precache. They embed Server Action IDs and must
    // stay in sync with the current server deployment.
    exclude: [
      /\/_next\/static\/chunks\/app\/.*\.js$/i,
      /\/_next\/static\/chunks\/(?:main|main-app|webpack|framework).*\.js$/i,
      /static\/chunks\/app\/.*\.js$/i,
      /static\/chunks\/(?:main|main-app|webpack|framework).*\.js$/i,
      /chat/,
      /planning/,
      /billing/,
      /drivers/,
      /dashboard/,
      /monitoring/,
    ],
    manifestTransforms: [
      async (entries: PrecacheManifestEntry[]) => ({
        manifest: entries.filter((entry) => !/^\/?_next\/static\/chunks\/.*\.js$/i.test(entry.url)),
        warnings: [],
      }),
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname),
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
        {
            protocol: 'https',
            hostname: 'jhksvhujsrbkeyzpvpog.supabase.co',
        },
        {
            protocol: 'https',
            hostname: 'uotofvfmlimkdmkcfsbr.supabase.co',
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
