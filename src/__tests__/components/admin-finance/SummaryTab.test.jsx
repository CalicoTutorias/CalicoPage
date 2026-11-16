/**
 * Finance summary tab: renders cash, what is owed and the profit table from
 * the summary endpoint (regression: KpiCard needs an icon).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import SummaryTab from '@/app/home/admin/finanzas/_components/SummaryTab';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  const value = {
    t,
    locale: 'en',
    formatCurrency: (n) => `$${n}`,
    formatDate: (d) => `D(${new Date(d).toISOString().slice(0, 10)})`,
  };
  return { useI18n: () => value };
});

jest.mock('@/app/services/core/AdminFinanceService', () => {
  const AdminFinanceService = { getSummary: jest.fn() };
  return { __esModule: true, AdminFinanceService, default: AdminFinanceService };
});

const PERIOD = {
  sessions: { count: 2, gross: 80000, net: 7811 },
  events: { count: 1, collected: 380000, net: 140000 },
  gmf: 400, expenses: 100000, otherIncome: 0, adjustments: 0, total: 47411,
  expensesByCategory: [{ name: 'Pauta', amount: 100000 }],
};

const SUMMARY = {
  cutoffDate: '2026-11-01T05:00:00.000Z',
  accounts: [
    { id: 'a1', name: 'Banco', type: 'BANK', isActive: true, balance: 1200000 },
    { id: 'a2', name: 'Wompi', type: 'WOMPI', isActive: true, balance: 37906 },
  ],
  cash: 1237906,
  owed: { sessions: 34000, events: 240000, total: 274000, upcomingSessions: 17000, pendingRefunds: 0 },
  available: 946906,
  profit: { period: PERIOD, sinceCutoff: PERIOD },
};

const CONFIG = { settings: { cutoffDate: SUMMARY.cutoffDate } };

it('renders the KPIs, the accounts and the profit of the month', async () => {
  AdminFinanceService.getSummary.mockResolvedValue({ success: true, summary: SUMMARY });
  render(<SummaryTab config={CONFIG} />);

  expect(await screen.findByText('$1237906', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByText('$274000')).toBeInTheDocument();
  expect(screen.getByText('$946906')).toBeInTheDocument();

  const banco = screen.getByText('Banco').closest('tr');
  expect(within(banco).getByText('$1200000')).toBeInTheDocument();
  expect(screen.getByText('Pauta: $100000')).toBeInTheDocument();

  // "Por pagar a tutores" opens the payouts page.
  expect(screen.getByText('$274000').closest('a')).toHaveAttribute('href', '/home/admin/payouts');
});

it('shows the error of a failed load', async () => {
  AdminFinanceService.getSummary.mockResolvedValue({ success: false, error: 'boom' });
  render(<SummaryTab config={CONFIG} />);
  expect(await screen.findByText('boom')).toBeInTheDocument();
});
