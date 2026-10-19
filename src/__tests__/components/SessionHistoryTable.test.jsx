/**
 * Admin dashboard session history — renders each session's dates, people,
 * length, status and charge; filters and pages through the API; recovers
 * from a failed load with "Retry".
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SessionHistoryTable from '@/app/home/admin/_components/SessionHistoryTable';
import { AdminService } from '@/app/services/core/AdminService';

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
      formatDateTime: (d) => `DT(${new Date(d).toISOString().slice(0, 16)})`,
    }),
  };
});

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = { metricsSessionHistory: jest.fn() };
  return { __esModule: true, AdminService, default: AdminService };
});

const PAST_MANUAL = {
  id: 's1',
  status: 'Accepted',
  source: 'ManualAdmin',
  startTimestamp: '2026-09-17T21:00:00.000Z',
  endTimestamp: '2026-09-17T22:30:00.000Z',
  bookedAt: '2026-09-16T15:00:00.000Z',
  cancelledAt: null,
  durationMinutes: 90,
  course: { code: 'ISIS1221', name: 'Intro a la Programación' },
  tutor: { id: 't1', name: 'Andrés Tutor' },
  students: [{ id: 'u1', name: 'Ana Estudiante', external: true }],
  payment: { status: 'paid', charged: 35000, discount: 0, calicoNet: 3313, paidAt: '2026-09-16T15:01:00.000Z' },
};

const CANCELED = {
  ...PAST_MANUAL,
  id: 's2',
  status: 'Canceled',
  source: 'Platform',
  cancelledAt: '2026-09-17T10:00:00.000Z',
  durationMinutes: 60,
  students: [{ id: 'u2', name: 'Beto Estudiante', external: false }],
  payment: { status: 'none', charged: 0, discount: 0, calicoNet: 0, paidAt: null },
};

const page = (items, total = items.length) => ({ success: true, items, total, limit: 25, offset: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  AdminService.metricsSessionHistory.mockResolvedValue(page([PAST_MANUAL, CANCELED]));
});

it('renders when, who, how long, status and charge for every session', async () => {
  const { container } = render(<SessionHistoryTable />);

  const row = (await screen.findByText('Ana Estudiante')).closest('tr');
  expect(within(row).getByText('D(2026-09-17)')).toBeInTheDocument();          // when it ran
  expect(within(row).getByText('DT(2026-09-16T15:00)')).toBeInTheDocument();   // when it was booked
  expect(within(row).getByText('1 h 30 min')).toBeInTheDocument();
  expect(within(row).getByText('Andrés Tutor')).toBeInTheDocument();
  expect(within(row).getByText('Scheduled')).toBeInTheDocument();
  expect(within(row).getByText('Manual')).toBeInTheDocument();
  expect(within(row).getByText(/external/)).toBeInTheDocument();
  expect(within(row).getByText('Already happened, never marked as completed')).toBeInTheDocument();
  expect(within(row).getByText('$35000')).toBeInTheDocument();
  expect(within(row).getByText('Calico net $3313')).toBeInTheDocument();

  const canceled = screen.getByText('Beto Estudiante').closest('tr');
  expect(within(canceled).getByText('Canceled on DT(2026-09-17T10:00)')).toBeInTheDocument();
  expect(within(canceled).getByText('No payment')).toBeInTheDocument();

  expect(screen.getByText('2 sessions', { exact: false })).toBeInTheDocument();
  // Every label resolved — no raw i18n key leaked into the UI.
  expect(container.textContent).not.toMatch(/admin\.dashboard\.history\./);
});

it('requests the chosen filter from the first page', async () => {
  render(<SessionHistoryTable />);
  await screen.findByText('Ana Estudiante');

  fireEvent.click(screen.getByRole('button', { name: 'Canceled' }));

  expect(AdminService.metricsSessionHistory).toHaveBeenLastCalledWith({ filter: 'canceled', limit: 25, offset: 0 });
  expect(screen.getByRole('button', { name: 'Canceled' })).toHaveAttribute('aria-pressed', 'true');
});

it('pages forward by 25 when there are more sessions', async () => {
  AdminService.metricsSessionHistory.mockResolvedValue(page([PAST_MANUAL], 30));
  render(<SessionHistoryTable />);
  await screen.findByText('Ana Estudiante');

  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

  expect(AdminService.metricsSessionHistory).toHaveBeenLastCalledWith({ filter: 'all', limit: 25, offset: 25 });
});

it('shows an error with a working retry', async () => {
  AdminService.metricsSessionHistory.mockResolvedValueOnce({ success: false, error: 'boom' });
  render(<SessionHistoryTable />);

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

  expect(await screen.findByText('Ana Estudiante')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load the session history.")).toBeNull();
});
