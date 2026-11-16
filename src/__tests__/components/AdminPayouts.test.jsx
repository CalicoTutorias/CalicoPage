/**
 * Admin payouts page: the digest shows how each tutor's payments were charged,
 * and the detail shows the payment type and whether the tutor was already paid.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminPayoutsPage from '@/app/home/admin/payouts/page';
import { AdminService } from '@/app/services/core/AdminService';

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

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = { listPayouts: jest.fn(), bulkMarkPayoutsPaid: jest.fn() };
  return { __esModule: true, AdminService, default: AdminService };
});

const GROUP = {
  tutor: { id: 't1', name: 'Laura Tutora', email: 'laura@x.co' },
  llave: 'laura@nequi',
  totalGross: 125000,
  tutorOwed: 106250,
  paymentsCount: 2,
  typeCounts: { wompi: 1, manual: 1, courtesy: 0 },
  sessions: [
    { paymentId: 'p1', startTimestamp: '2026-10-20T15:00:00.000Z', course: { code: 'ISIS1225', name: 'Estructuras de Datos' } },
    { paymentId: 'p2', startTimestamp: '2026-10-27T15:00:00.000Z', course: { code: 'MATE1203', name: 'Cálculo' } },
  ],
  paymentIds: ['p1', 'p2'],
};

function item(overrides = {}) {
  return {
    id: 'p1',
    gross: 50000,
    tutorOwed: 42500,
    paymentType: 'wompi',
    tutorPayoutStatus: 'pending',
    tutorPayoutAt: null,
    tutorPayoutNote: null,
    tutor: { id: 't1', name: 'Laura Tutora', email: 'laura@x.co' },
    llave: 'laura@nequi',
    session: {
      id: 's1',
      startTimestamp: '2026-10-20T15:00:00.000Z',
      course: { id: 'c1', code: 'ISIS1225', name: 'Estructuras de Datos' },
    },
    ...overrides,
  };
}

function mockLists(items = [item(), item({ id: 'p2', paymentType: 'manual', gross: 75000, tutorOwed: 63750 })]) {
  AdminService.listPayouts.mockImplementation(async ({ view }) => (view === 'flat'
    ? { success: true, items, total: items.length }
    : { success: true, groups: [GROUP], totals: { tutorOwed: 106250, tutorsCount: 1, paymentsCount: 2 } }));
}

const openDetail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Payment detail' }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLists();
  AdminService.bulkMarkPayoutsPaid.mockResolvedValue({ success: true, count: 1 });
});

describe('by tutor', () => {
  it('test_should_show_how_many_payments_of_each_type', async () => {
    render(<AdminPayoutsPage />);

    expect(await screen.findByText('Wompi: 1')).toBeInTheDocument();
    expect(screen.getByText('Manual: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Courtesy: /)).toBeNull();
  });

  it('test_should_show_the_date_of_each_tutoring_session', async () => {
    render(<AdminPayoutsPage />);

    expect(await screen.findByRole('columnheader', { name: 'Session dates' })).toBeInTheDocument();
    const dates = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(dates).toEqual(['D(2026-10-20) · ISIS1225', 'D(2026-10-27) · MATE1203']);
  });

  it('test_should_fold_a_long_list_of_sessions_and_unfold_it_on_demand', async () => {
    const sessions = Array.from({ length: 7 }, (_, i) => ({
      paymentId: `p${i}`,
      startTimestamp: `2026-10-0${i + 1}T15:00:00.000Z`,
      course: { code: 'ISIS1225', name: 'Estructuras de Datos' },
    }));
    AdminService.listPayouts.mockResolvedValue({ success: true, groups: [{ ...GROUP, sessions }], totals: {} });
    render(<AdminPayoutsPage />);

    const more = await screen.findByRole('button', { name: 'Show 2 more' });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText(/D\(2026-10-07\)/)).toBeNull();

    fireEvent.click(more);

    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByText(/D\(2026-10-07\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('test_should_not_offer_to_unfold_a_short_list', async () => {
    render(<AdminPayoutsPage />);

    await screen.findByText(/D\(2026-10-20\)/);
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
  });

  it('test_should_mark_the_whole_batch_of_the_tutor', async () => {
    render(<AdminPayoutsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Mark all/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));

    await waitFor(() => expect(AdminService.bulkMarkPayoutsPaid).toHaveBeenCalledWith(['p1', 'p2'], undefined));
  });
});

describe('payment detail', () => {
  it('test_should_show_the_type_and_whether_the_tutor_was_paid', async () => {
    mockLists([
      item(),
      item({ id: 'p2', paymentType: 'manual' }),
      item({ id: 'p3', paymentType: 'courtesy', tutorPayoutStatus: 'paid', tutorPayoutAt: '2026-10-25T15:00:00.000Z', tutorPayoutNote: 'Nequi 123' }),
    ]);
    render(<AdminPayoutsPage />);
    await openDetail();

    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(within(rows[0]).getByText('Wompi')).toBeInTheDocument();
    expect(within(rows[0]).getByText('To pay')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Manual')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Courtesy')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Paid')).toBeInTheDocument();
    expect(within(rows[2]).getByText('DT(2026-10-25)')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Nequi 123')).toBeInTheDocument();
  });

  it('test_should_show_the_date_and_time_of_the_tutoring_session', async () => {
    render(<AdminPayoutsPage />);
    await openDetail();

    expect(await screen.findByRole('columnheader', { name: 'Session date' })).toBeInTheDocument();
    const [row] = (await screen.findAllByRole('row')).slice(1);
    expect(within(row).getByText('D(2026-10-20)')).toBeInTheDocument();
    expect(within(row).getByText('DT(2026-10-20)')).toBeInTheDocument();
  });

  it('test_should_start_on_what_is_owed', async () => {
    render(<AdminPayoutsPage />);
    await openDetail();

    await waitFor(() => expect(AdminService.listPayouts).toHaveBeenCalledWith({
      view: 'flat', payout: 'pending', type: 'all', limit: 25, offset: 0,
    }));
  });

  it('test_should_filter_by_payout_state_and_by_type', async () => {
    render(<AdminPayoutsPage />);
    await openDetail();
    await screen.findAllByRole('row');

    fireEvent.click(within(screen.getByRole('group', { name: 'Tutor payout' })).getByRole('button', { name: 'Paid' }));
    await waitFor(() => expect(AdminService.listPayouts).toHaveBeenCalledWith(expect.objectContaining({ view: 'flat', payout: 'paid' })));

    await screen.findAllByRole('row');
    fireEvent.click(within(screen.getByRole('group', { name: 'Payment type' })).getByRole('button', { name: 'Manual' }));
    await waitFor(() => expect(AdminService.listPayouts).toHaveBeenCalledWith(expect.objectContaining({ view: 'flat', payout: 'paid', type: 'manual' })));
    expect(within(screen.getByRole('group', { name: 'Payment type' })).getByRole('button', { name: 'Manual' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('test_should_offer_marking_only_what_is_still_owed', async () => {
    mockLists([item({ tutorPayoutStatus: 'paid', tutorPayoutAt: '2026-10-25T15:00:00.000Z' })]);
    render(<AdminPayoutsPage />);
    await openDetail();

    await screen.findAllByRole('row');
    expect(screen.queryByRole('button', { name: /Mark Laura Tutora as paid/ })).toBeNull();
  });

  it('test_should_mark_one_payment_after_confirming_and_reload', async () => {
    render(<AdminPayoutsPage />);
    await openDetail();

    const [first] = await screen.findAllByRole('button', { name: 'Mark Laura Tutora as paid for Estructuras de Datos' });
    fireEvent.click(first);
    fireEvent.change(screen.getByPlaceholderText(/Nequi/), { target: { value: 'Nequi 123' } });
    const flatCalls = () => AdminService.listPayouts.mock.calls.filter(([o]) => o.view === 'flat').length;
    const before = flatCalls();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));

    await waitFor(() => expect(AdminService.bulkMarkPayoutsPaid).toHaveBeenCalledWith(['p1'], 'Nequi 123'));
    await waitFor(() => expect(flatCalls()).toBeGreaterThan(before));
  });

  it('test_should_say_so_when_nothing_matches_the_filters', async () => {
    mockLists([]);
    render(<AdminPayoutsPage />);
    await openDetail();

    expect(await screen.findByText('No payments match these filters.')).toBeInTheDocument();
  });

  it('test_should_offer_a_retry_when_the_detail_fails_to_load', async () => {
    AdminService.listPayouts.mockImplementation(async ({ view }) => (view === 'flat'
      ? { success: false, status: 500 }
      : { success: true, groups: [GROUP], totals: {} }));
    render(<AdminPayoutsPage />);
    await openDetail();

    expect(await screen.findByText('Failed to load pending payouts')).toBeInTheDocument();
    mockLists();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect((await screen.findAllByRole('row')).length).toBeGreaterThan(1);
  });
});
