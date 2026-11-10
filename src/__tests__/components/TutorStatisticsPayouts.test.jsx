/**
 * Tutor statistics — the tutor sees what Calico already transferred and what it
 * still owes, payment by payment, from the state the server decides.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import TutorStatistics from '@/app/tutor/statistics/page';
import { useAuth } from '@/app/context/SecureAuthContext';
import { PaymentService } from '@/app/services/core/PaymentService';

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  const value = {
    t,
    locale: 'en',
    formatCurrency: (n) => `$${n}`,
    formatDate: (d) => `D(${new Date(d).toISOString().slice(0, 10)})`,
    formatDateTime: (d) => `DT(${new Date(d).toISOString().slice(0, 10)})`,
  };
  return { useI18n: () => value };
});
jest.mock('@/app/services/core/UserService', () => ({
  UserService: { getUserById: jest.fn(async () => ({ id: 'tutor-1' })) },
}));
jest.mock('@/app/services/core/PaymentService', () => ({
  PaymentService: { getTutorPayments: jest.fn() },
}));
jest.mock('@/app/services/utils/StatisticsCache', () => ({
  statisticsCache: { getCache: jest.fn(() => null), setCache: jest.fn() },
}));

const today = new Date().toISOString();

function payment(id, state, overrides = {}) {
  return {
    id,
    course: 'Estructuras de Datos',
    courseId: 'c1',
    studentName: 'Ana',
    amount: 100000,
    tutorPayoutBase: 100000,
    status: state === 'awaiting_student' ? 'pending' : 'paid',
    tutorPayoutState: state,
    tutorPayoutAt: null,
    createdAt: today,
    ...overrides,
  };
}

const card = (title) => screen.getByRole('heading', { name: title }).closest('.stat-card');

async function renderWith(payments) {
  PaymentService.getTutorPayments.mockResolvedValue(payments);
  render(<TutorStatistics />);
  await screen.findByRole('heading', { name: 'Next Payment' });
  await waitFor(() => expect(PaymentService.getTutorPayments).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/tutor/statistics');
  useAuth.mockReturnValue({ user: { isLoggedIn: true, isTutor: true, uid: 'tutor-1', email: 't@x.co' }, loading: false });
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('/reviews')
      ? { success: true, reviews: [], pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1, hasMore: false } }
      : { success: true, tutor: { numReview: 0 }, courses: [] }),
  }));
});

it('test_should_show_next_payment_only_for_what_is_owed', async () => {
  await renderWith([
    payment('owed', 'owed'),
    payment('paid', 'paid', { tutorPayoutAt: '2026-11-01T15:00:00.000Z', amount: 50000, tutorPayoutBase: 50000 }),
    payment('upcoming', 'upcoming', { amount: 70000, tutorPayoutBase: 70000 }),
    payment('waiting', 'awaiting_student', { amount: 80000, tutorPayoutBase: 80000 }),
    payment('canceled', 'canceled', { amount: 90000, tutorPayoutBase: 90000 }),
  ]);

  await waitFor(() => expect(within(card('Next Payment')).getByText('$85000')).toBeInTheDocument());
});

it('test_should_show_earnings_as_owed_plus_received_with_the_received_part', async () => {
  await renderWith([
    payment('owed', 'owed'),
    payment('paid', 'paid', { tutorPayoutAt: '2026-11-01T15:00:00.000Z', amount: 50000, tutorPayoutBase: 50000 }),
    payment('upcoming', 'upcoming', { amount: 70000, tutorPayoutBase: 70000 }),
  ]);

  await waitFor(() => expect(within(card('Total Earnings')).getByText('$127500')).toBeInTheDocument());
  expect(within(card('Total Earnings')).getByText('Already received: $42500')).toBeInTheDocument();
});

it('test_should_compute_on_the_payout_base_when_calico_absorbed_a_coupon', async () => {
  await renderWith([payment('free', 'owed', { amount: 0, tutorPayoutBase: 50000 })]);

  await waitFor(() => expect(within(card('Next Payment')).getByText('$42500')).toBeInTheDocument());
});

it('test_should_say_in_each_row_whether_it_was_transferred_and_when', async () => {
  await renderWith([payment('paid', 'paid', { tutorPayoutAt: '2026-11-01T15:00:00.000Z' })]);

  const badge = await screen.findByText('Paid');
  expect(badge).toHaveAttribute('title', 'Calico already transferred this payment to you.');
  expect(badge).toHaveClass('status-completed');
  expect(screen.getByText('D(2026-11-01)')).toBeInTheDocument();
});

it.each([
  ['owed', 'To be paid', 'status-pending'],
  ['upcoming', 'Upcoming', 'status-default'],
  ['awaiting_student', 'Not collected', 'status-pending'],
  ['canceled', 'Canceled', 'status-failed'],
  ['failed', 'Failed', 'status-failed'],
])('test_should_label_a_%s_payment_without_a_transfer_date', async (state, label, badgeClass) => {
  await renderWith([payment('p1', state)]);

  const badge = await screen.findByText(label);
  expect(badge).toHaveClass(badgeClass);
  expect(document.querySelector('.status-date')).toBeNull();
});

it('test_should_show_zero_owed_once_everything_was_transferred', async () => {
  await renderWith([payment('paid', 'paid', { tutorPayoutAt: '2026-11-01T15:00:00.000Z' })]);

  await waitFor(() => expect(within(card('Total Earnings')).getByText('$85000')).toBeInTheDocument());
  expect(within(card('Next Payment')).getByText('$0')).toBeInTheDocument();
});
