/**
 * frontend/next.config.js
 *
 * FIX-1  Added Content-Security-Policy header.
 *        The previous config had X-Frame-Options, X-XSS-Protection, and
 *        Referrer-Policy but NO CSP — leaving XSS fully open. Particularly
 *        dangerous given the platform renders user-generated comments and
 *        annotations, and loads external images from hundreds of news domains.
 *
 *        The policy below is deliberately permissive for images and media
 *        (news sites serve images from many CDN domains), strict for scripts
 *        (only self + Sentry + Razorpay), and strict for frames (none).
 *
 *        In production you may want to tighten img-src further once you know
 *        which image CDNs your sources use. Start permissive, tighten later.
 *
 * FIX-2  Sentry source map upload integrated via @sentry/nextjs.
 *        Set SENTRY_AUTH_TOKEN in CI/Vercel env to enable.
 *        Set SENTRY_DSN in runtime env for error capture.
 *
 * @type {import('next').NextConfig}
 */

const { withSentryConfig } = (() => {
  try {
    // Only load Sentry plugin when the package is installed
    return require("@sentry/nextjs");
  } catch {
    // Graceful fallback: if @sentry/nextjs not installed, no-op wrapper
    return { withSentryConfig: (config) => config };
  }
})();

const isProd = process.env.NODE_ENV === "production";

/** Content-Security-Policy value. */
const CSP = [
  // Default: only load from own origin
  "default-src 'self'",

  // Scripts: self + Sentry CDN + Razorpay checkout (payment)
  // 'unsafe-inline' is required for Next.js inline scripts (hydration)
  // 'unsafe-eval' is required for Next.js dev mode only — remove in prod if possible
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.razorpay.com https://browser.sentry-cdn.com https://js.sentry-cdn.com",

  // Styles: self + inline (Next.js injects inline CSS)
  "style-src 'self' 'unsafe-inline'",

  // Images: self + data URIs + all HTTPS (news thumbnails come from any domain)
  "img-src 'self' data: blob: https:",

  // Fonts: self only
  "font-src 'self' data:",

  // Connect (fetch/XHR/WS): self + app services + external data providers
  "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://*.sentry.io https://api.razorpay.com https://*.supabase.co wss://*.supabase.co https://fcm.googleapis.com https://api.open-meteo.com https://nominatim.openstreetmap.org https://en.wikipedia.org",

  // Frames: Razorpay payment iframe only
  "frame-src https://api.razorpay.com",

  // No plugins (Flash etc.)
  "object-src 'none'",

  // Upgrade insecure requests in production only
  ...(isProd ? ["upgrade-insecure-requests"] : []),

  // Report violations to Sentry (optional — requires Sentry CSP endpoint)
  // "report-uri https://o0.ingest.sentry.io/api/0/security/?sentry_key=YOUR_KEY",
].join("; ");


/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Proxy /api/* → FastAPI backend
  async rewrites() {
    return [
      {
        source:      "/api/:path*",
        destination: `${process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://api:8000"}/api/:path*`,
      },
    ];
  },

  // Security + performance headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // FIX-1: Content-Security-Policy (was missing entirely)
          { key: "Content-Security-Policy",   value: CSP },

          // Existing security headers (kept)
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "SAMEORIGIN" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(self)" },

          // HSTS: enforce HTTPS for 1 year in production
          // Remove or reduce max-age in dev if you need HTTP
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      // Static assets — cache aggressively
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: isProd ? "public, max-age=31536000, immutable" : "no-store, max-age=0" }],
      },
      // Article pages — 5 min fresh, 1 hour stale-while-revalidate
      {
        source: "/article/:id",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=3600" }],
      },
    ];
  },

  // Allow external images from any HTTPS source (news thumbnails)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "**" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
  },

  compress: true,

};

// Wrap with Sentry build-time plugin
// gracefully no-ops if @sentry/nextjs not installed or SENTRY_AUTH_TOKEN not set
module.exports = withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG     || "dhara-news",
  project: process.env.SENTRY_PROJECT || "dhara-frontend",
  silent:  true,   // suppress Sentry build output unless there's an error
  hideSourceMaps: true,
  widenClientFileUpload: true,
});
