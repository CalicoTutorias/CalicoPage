import * as Sentry from '@sentry/nextjs';

// Runtime Node.js (API routes, Server Components, business services).
// Sin DSN el SDK queda inactivo, así que es seguro tenerlo antes de configurar prod.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Foco en errores: muestreo de trazas bajo en prod, completo en dev.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
});
