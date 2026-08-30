import * as Sentry from '@sentry/nextjs';

// Runtime Node.js (API routes, Server Components, business services).
// Sin DSN el SDK queda inactivo, así que es seguro tenerlo antes de configurar prod.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Tracing inteligente para optimizar las 10,000 transacciones mensuales
  tracesSampler: (samplingContext) => {
    if (process.env.NODE_ENV !== 'production') return 1.0;

    const name = samplingContext.name || '';

    // Rutas críticas de dinero y reservas: Monitorear al 100%
    if (name.includes('/api/payments') || name.includes('/api/sessions/book')) {
      return 1.0;
    }

    // Healthchecks de Neon/Postgres: 0% (ahorro total de transacciones)
    if (name.includes('/api/health')) {
      return 0.0;
    }

    // Resto de la aplicación: 5%
    return 0.05;
  },

  // Filtrar errores esperados de navegación interna de Next.js
  beforeSend(event, hint) {
    const error = hint.originalException as Error | undefined;
    if (error?.message?.includes('NEXT_REDIRECT') || error?.message?.includes('NEXT_NOT_FOUND')) {
      return null;
    }
    return event;
  },
});
