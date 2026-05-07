import type { NextConfig } from 'next'

const r2PublicUrl = process.env.R2_PUBLIC_URL ?? ''

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.accounts.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${r2PublicUrl} https://*.r2.dev https://*.fal.run https://fal.run https://img.clerk.com https://*.clerk.com https://*.r2.cloudflarestorage.com`,
      "frame-src https://challenges.cloudflare.com https://*.clerk.accounts.dev",
      `connect-src 'self' https://api.anthropic.com https://api.openai.com https://fal.run https://*.fal.run https://*.upstash.io https://*.clerk.accounts.dev https://clerk.accounts.dev https://*.r2.cloudflarestorage.com ${r2PublicUrl}`,
      "worker-src blob:",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  headers: async () => [
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
  ],
  images: {
    remotePatterns: r2PublicUrl
      ? [{ protocol: 'https', hostname: new URL(r2PublicUrl).hostname }]
      : [],
  },
}

export default nextConfig
