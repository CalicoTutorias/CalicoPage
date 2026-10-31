/**
 * Admin dashboard repaso earnings — renders the policy line, the held /
 * upcoming totals and, per repaso, its payment mode, confirmed count,
 * collected money, tutor payout (split per tutor, paid so far), Wompi fee,
 * Calico net and status. Every figure comes from the API.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import EventEarningsTable from '@/app/home/admin/_components/EventEarningsTable';

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  return {
    useI18n: () => ({
      t,
      locale: 'en',
      formatCurrency: (n) => `$${n}`,
      formatDate: (d) => `D(${new Date(d).toISOString().slice(0, 10)})`,
      formatDateTime: (d) => `DT(${new Date(d).toISOString().slice(11, 16)})`,
    }),
  };
});

const UPCOMING_MANUAL = {
  id: 'e1',
  slug: 'repaso-eda',
  title: 'Repaso Parcial 3 – EDA',
  startsAt: '2026-11-01T16:00:00.000Z',
  endsAt: '2026-11-01T19:00:00.000Z',
  course: { code: 'ISIS1225', name: 'EDA' },
  hours: 3,
  paymentMode: 'manual',
  upcoming: true,
  confirmed: 22,
  minConfirmed: 8,
  meetsMinimum: true,
  collected: 880000,
  tutorBase: 180000,
  tutorExtra: 392000,
  tutorPayout: 572000,
  wompiFees: 0,
  calicoNet: 308000,
  tutors: [
    { id: 't1', name: 'Ana Tutora', owed: 286000, paid: 100000 },
    { id: 't2', name: 'Luis Tutor', owed: 286000, paid: 0 },
  ],
  tutorPaid: 100000,
};

const HELD_WOMPI = {
  ...UPCOMING_MANUAL,
  id: 'e2',
  title: 'Repaso Cálculo',
  paymentMode: 'wompi',
  upcoming: false,
  confirmed: 9,
  collected: 360000,
  tutorBase: 240000,
  tutorExtra: 28000,
  tutorPayout: 268000,
  wompiFees: 18850,
  calicoNet: 73150,
  tutors: [{ id: 't3', name: 'Sol Tutora', owed: 268000, paid: 0 }],
  tutorPaid: 0,
};

const BELOW_MINIMUM = {
  ...HELD_WOMPI,
  id: 'e3',
  title: 'Repaso Prueba',
  confirmed: 1,
  meetsMinimum: false,
  collected: 3000,
  tutorBase: 0,
  tutorExtra: 0,
  tutorPayout: 0,
  wompiFees: 0,
  calicoNet: 0,
  tutors: [{ id: 't3', name: 'Sol Tutora', owed: 0, paid: 0 }],
};

const DATA = {
  items: [UPCOMING_MANUAL, HELD_WOMPI, BELOW_MINIMUM],
  totals: {
    held:     { events: 1, collected: 360000, tutorPayout: 268000, wompiFees: 18850, calicoNet: 73150 },
    upcoming: { events: 1, collected: 880000, tutorPayout: 572000, wompiFees: 0, calicoNet: 308000 },
  },
  policy: { tutorHourlyRate: 60000, minConfirmed: 8, extraStudentTutorShare: 0.7 },
};

const rowOf = (title) => screen.getByRole('link', { name: title }).closest('tr');

it('explains the policy from the served numbers and shows the held / upcoming totals', () => {
  render(<EventEarningsTable data={DATA} />);

  expect(screen.getByText(/\$60000\/h × session hours once 8 students are confirmed, plus 70 %/)).toBeInTheDocument();
  expect(screen.getByText('Held: $73150 for Calico (1)')).toBeInTheDocument();
  expect(screen.getByText('Upcoming (projection): $308000 for Calico (1)')).toBeInTheDocument();
});

it('renders a repaso with its money, split per tutor and the payouts already made', () => {
  render(<EventEarningsTable data={DATA} />);
  const row = within(rowOf('Repaso Parcial 3 – EDA'));

  expect(screen.getByRole('link', { name: 'Repaso Parcial 3 – EDA' })).toHaveAttribute('href', '/home/admin/eventos/e1');
  expect(row.getByText('Manual')).toBeInTheDocument();
  expect(row.getByText('22 / min. 8')).toBeInTheDocument();
  expect(row.getByText('$880000')).toBeInTheDocument();
  expect(row.getByText('$572000')).toBeInTheDocument();
  expect(row.getByText('Base $180000 + extras $392000')).toBeInTheDocument();
  expect(row.getByText('Ana Tutora: $286000')).toBeInTheDocument();
  expect(row.getByText('Luis Tutor: $286000')).toBeInTheDocument();
  expect(row.getByText('Paid $100000')).toBeInTheDocument();
  expect(row.getByText('—')).toBeInTheDocument(); // manual: no Wompi fee
  expect(row.getByText('$308000')).toBeInTheDocument();
  expect(row.getByText('Upcoming')).toBeInTheDocument();
});

it('shows the Wompi fee of a Wompi repaso and marks the ones below the minimum', () => {
  render(<EventEarningsTable data={DATA} />);

  const held = within(rowOf('Repaso Cálculo'));
  expect(held.getByText('Wompi')).toBeInTheDocument();
  expect(held.getByText('$18850')).toBeInTheDocument();
  expect(held.getByText('Held')).toBeInTheDocument();
  expect(held.queryByText(/Sol Tutora:/)).not.toBeInTheDocument(); // one tutor: no per-tutor lines

  const below = within(rowOf('Repaso Prueba'));
  expect(below.getByText('Below minimum')).toBeInTheDocument();
  expect(below.getByText('1 / min. 8')).toBeInTheDocument();
  expect(below.queryByText(/^Base /)).not.toBeInTheDocument();
});

it('renders the loading, error and empty states', () => {
  const { rerender, container } = render(<EventEarningsTable loading />);
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);

  rerender(<EventEarningsTable error />);
  expect(screen.getByText('Review-session breakdown failed')).toBeInTheDocument();

  rerender(<EventEarningsTable data={{ ...DATA, items: [] }} />);
  expect(screen.getByText('No published review sessions in the last 12 months.')).toBeInTheDocument();
});
