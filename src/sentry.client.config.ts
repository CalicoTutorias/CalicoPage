import * as Sentry from '@sentry/nextjs';

// Runtime del navegador. Next.js y @sentry/nextjs cargan automáticamente este archivo.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.05,
  // 0% de sesiones normales para cuidar la cuota gratuita, 10% de sesiones con error en producción
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],
  // Filtro de errores comunes de extensiones y navegadores para no consumir la cuota de 5,000 eventos
  ignoreErrors: [
    'ResizeObserver loop completed with undelivered notifications',
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    'Load failed',
    'Failed to fetch',
    'AbortError',
    'Non-Error promise rejection captured',
  ],
});

// Exponer Sentry en el objeto window para permitir pruebas desde la consola del navegador
if (typeof window !== 'undefined') {
  (window as any).Sentry = Sentry;
}

// Instrumenta las navegaciones del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
