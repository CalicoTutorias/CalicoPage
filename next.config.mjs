import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

<<<<<<< HEAD
const isDev = process.env.NODE_ENV !== 'production';

// Kept as an array so each directive is easy to read and diff.
const cspDirectives = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline' for its hydration scripts.
  // 'unsafe-eval' is needed in dev for hot-reload; stripped in production.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://checkout.wompi.co https://accounts.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // data: for base64 avatars; blob: for object URLs; *.amazonaws.com for S3
  "img-src 'self' data: blob: https://*.amazonaws.com https://lh3.googleusercontent.com https://storage.googleapis.com",
  // API and OAuth endpoints the browser needs to reach directly
  "connect-src 'self' https://api.wompi.co https://production.wompi.co https://sandbox.wompi.co https://accounts.google.com",
  // Wompi renders its checkout in an iframe
  "frame-src https://checkout.wompi.co",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Upgrade insecure requests in production
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: cspDirectives,
  },
  {
    // Prevents clickjacking; redundant with frame-ancestors but kept for
    // older browsers that don't support CSP level 2.
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // 2-year HSTS with preload — tells browsers to ALWAYS use HTTPS.
    // Only effective in production; safe to send in dev too.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Prevents MIME-type sniffing attacks.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Send full URL only for same-origin requests; strip to origin for
    // cross-origin navigations (no path leakage to third-party servers).
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Deny access to sensitive browser APIs not used by the app.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.wompi.co")',
  },
=======
// Baseline security headers applied to every response. Intentionally does NOT
// include a strict Content-Security-Policy: enforcing CSP on a Next.js app that
// also loads the Wompi widget + Google OAuth needs a dedicated test pass (inline
// hydration scripts, styled-jsx, third-party origins) and is tracked separately.
// X-Frame-Options already blocks the main clickjacking vector here.
const securityHeaders = [
  // Force HTTPS for 2 years incl. subdomains. Browsers ignore this on localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Stop MIME-type sniffing (defends against content-type confusion attacks).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Disallow the site being framed by other origins → clickjacking protection.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Don't leak full URLs (incl. tokens in query strings) to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Drop powerful features the app never uses in its own origin.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
>>>>>>> 0348cd27a30dbd23e6bc56fd1dc2dbf9133af26d
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
<<<<<<< HEAD
        // Apply to all routes
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },

=======
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
>>>>>>> 0348cd27a30dbd23e6bc56fd1dc2dbf9133af26d
  async redirects() {
    return [
      {
        source: '/tutor/courses',
        destination: '/tutor/materias',
        permanent: false,
      },
    ];
  },

  serverExternalPackages: ['@prisma/client', '@prisma/engines', 'bcrypt'],

  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;
