/**
 * Admin dashboard revenue chart — the chart renders with sessions + repasos
 * rows, and its tooltip breaks a month down into the total, the sessions
 * part and (when there were any) the repasos part.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import RevenueChart, { RevenueTooltip } from '@/app/home/admin/_components/RevenueChart';

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  return { useI18n: () => ({ t, locale: 'en', formatCurrency: (n) => `$${n}` }) };
});

const LABELS = {
  gross: 'Gross processed', discount: 'Coupon discounts', calicoNet: 'Calico net', tutorPayout: 'Tutor payout',
  wompiFee: 'Wompi fee', payments: 'Payments', sessions: 'Sessions', events: 'Review sessions',
  totalNet: 'Total Calico net', eventCollected: 'Collected',
};
const money = (n) => `$${n}`;

const MONTH = {
  gross: 160000, discount: 0, calicoNet: 17716.8, tutorPayout: 136000, wompiFee: 6283.2,
  eventsCount: 1, eventCollected: 880000, eventTutorPayout: 572000, eventWompiFee: 0, eventNet: 308000,
  totalNet: 325716.8,
};

it('breaks a month into the total, sessions and repasos', () => {
  render(<RevenueTooltip active label="Nov 26" payload={[{ payload: MONTH }]} labels={LABELS} money={money} />);

  expect(screen.getByText('Nov 26')).toBeInTheDocument();
  expect(screen.getByText('$325716.8')).toBeInTheDocument();
  expect(screen.getByText('Sessions: $17716.8')).toBeInTheDocument();
  expect(screen.getByText('Wompi fee: $6283.2')).toBeInTheDocument();
  expect(screen.getByText('Review sessions (1): $308000')).toBeInTheDocument();
  expect(screen.getByText('Collected: $880000')).toBeInTheDocument();
  expect(screen.getByText('Tutor payout: $572000')).toBeInTheDocument();
});

it('omits the repasos block in a month without repasos, and renders nothing when inactive', () => {
  const { container, rerender } = render(
    <RevenueTooltip active label="Oct 26" payload={[{ payload: { ...MONTH, eventsCount: 0 } }]} labels={LABELS} money={money} />,
  );
  expect(screen.queryByText(/Review sessions/)).not.toBeInTheDocument();

  rerender(<RevenueTooltip active={false} payload={[]} labels={LABELS} money={money} />);
  expect(container).toBeEmptyDOMElement();
});

it('renders the chart card with sessions + repasos rows', () => {
  // ResponsiveContainer measures 0 px under jsdom and warns about it.
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  render(<RevenueChart series={[{ monthStart: '2026-11-01T00:00:00.000Z', ...MONTH, paymentsCount: 4 }]} />);
  expect(screen.getByText("Calico's net margin per month")).toBeInTheDocument();
  expect(screen.queryByText('No payments recorded in this range.')).not.toBeInTheDocument();
  warn.mockRestore();
});
