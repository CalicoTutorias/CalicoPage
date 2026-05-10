/**
 * Shared test render helpers for booking-flow component tests.
 *
 * - `renderWithProviders` wraps any component in the global providers it needs
 *   (i18n today; add SecureAuthContext mock here when a test needs it).
 * - `mockI18n` is a Jest factory you can pass to `jest.mock('@/lib/i18n', ...)`
 *   when the component imports `useI18n()` directly (more common pattern).
 *
 * Pick whichever fits the component:
 *   • Real provider (`renderWithProviders`) → integration-style; exercises the
 *     actual translation lookup against `src/lib/i18n/locales/es.json`.
 *   • Mocked hook (`mockI18n`) → fastest; pins the strings the test asserts.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';

export function renderWithProviders(ui, { locale = 'es', ...options } = {}) {
  function Wrapper({ children }) {
    return <I18nProvider initialLocale={locale}>{children}</I18nProvider>;
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Returns a minimal i18n hook mock that echoes keys (or substitutes overrides).
 * Pass to `jest.mock('@/lib/i18n', () => mockI18n({ 'foo.bar': 'Hi' }))`.
 */
export function mockI18n(overrides = {}) {
  return {
    useI18n: () => ({
      t: (key, params) => {
        if (overrides[key]) {
          let out = overrides[key];
          if (params) {
            for (const [k, v] of Object.entries(params)) {
              out = out.replace(new RegExp(`{${k}}`, 'g'), String(v));
            }
          }
          return out;
        }
        return key;
      },
      locale: 'es',
      setLocale: () => {},
      formatCurrency: (n) => String(n ?? 0),
      formatDate: (d) => String(d ?? ''),
      formatDateTime: (d) => String(d ?? ''),
    }),
    I18nProvider: ({ children }) => children,
  };
}
