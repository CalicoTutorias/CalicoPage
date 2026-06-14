import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },

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
