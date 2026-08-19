// Flat config nativo. `eslint-config-next` v16 ya exporta un array de flat
// config, así que no hace falta el puente FlatCompat de @eslint/eslintrc
// (que además rompe con eslint 9: "Converting circular structure to JSON").
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'src/generated/**',   // cliente de Prisma, generado
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
