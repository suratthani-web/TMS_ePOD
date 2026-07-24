import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DRouteMind Driver',
    short_name: 'DRouteMind',
    description: 'DRouteMind — แอปคนขับ ระบบขนส่งอัจฉริยะ (DD Transport)',
    start_url: '/mobile/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#17265f',
    theme_color: '#17265f',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
