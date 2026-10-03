/**
 * PaymentsTab (admin event detail) — money totals, anomaly badges per flag and
 * the "mark refunded" action behind a ConfirmDialog.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PaymentsTab from '@/app/home/admin/eventos/_components/PaymentsTab';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { payments: jest.fn(), markRefunded: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

const p = en.admin.events.payments;
// Same formatter as the i18n mock in setupTests; the DOM text is matched with
// its whitespace (the formatter's non-breaking space) normalised.
const cop = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(n).replace(/\s/g, ' ');

const base = {
  wompiId: 'w-1', reference: 'ref-1', originalAmount: 20000, discountAmount: 0,
  refundedAt: null, createdAt: '2026-10-10T15:00:00.000Z', refundMethod: null, refundMethodDetails: null,
};
const PAYMENTS = [
  { ...base, id: 'p1', amount: 18000, originalAmount: 20000, discountAmount: 2000, flag: null, refundStatus: 'None', user: { name: 'Ana', email: 'ana@x.co' } },
  { ...base, id: 'p2', wompiId: 'w-2', amount: 20000, flag: 'DUPLICATE', refundStatus: 'Pending', refundMethod: 'nequi', refundMethodDetails: '3001234567', user: { name: 'Bruno', email: 'bruno@x.co' } },
  { ...base, id: 'p3', wompiId: 'w-3', amount: 20000, flag: 'EVENT_CANCELED', refundStatus: 'Refunded', refundedAt: '2026-10-12T15:00:00.000Z', user: { name: 'Carla', email: 'carla@x.co' } },
  { ...base, id: 'p4', wompiId: 'w-4', amount: 20000, flag: 'REGISTRATION_CANCELED', refundStatus: 'None', user: { name: 'Dario', email: 'dario@x.co' } },
  { ...base, id: 'p5', wompiId: 'w-5', amount: 18000, flag: 'EARLY_BIRD_OVERRUN', refundStatus: 'None', user: { name: 'Eva', email: 'eva@x.co' } },
];
// Every total is distinct, so two swapped cards would fail.
const TOTALS = { gross: 56000, wompiFees: 7200, refundsPending: 21000, refunded: 19000, tutorPayouts: 30000, net: 18800 };

beforeEach(() => {
  jest.clearAllMocks();
  AdminEventService.payments.mockResolvedValue({ success: true, payments: PAYMENTS, totals: TOTALS });
  AdminEventService.markRefunded.mockResolvedValue({ success: true, payment: { ...PAYMENTS[1], refundStatus: 'Refunded' } });
});

const totalCard = (label) => screen.getByText(label, { selector: 'dt' }).parentElement;

describe('PaymentsTab', () => {
  it('renders the totals', async () => {
    render(<PaymentsTab eventId="ev-1" />);
    await screen.findByText('Bruno');

    expect(within(totalCard(p.totals.gross)).getByText(cop(56000))).toBeInTheDocument();
    expect(within(totalCard(p.totals.wompiFees)).getByText(cop(7200))).toBeInTheDocument();
    expect(within(totalCard(p.totals.tutorPayouts)).getByText(cop(30000))).toBeInTheDocument();
    expect(within(totalCard(p.totals.net)).getByText(cop(18800))).toBeInTheDocument();
    expect(within(totalCard(p.totals.refundsPending)).getByText(cop(21000))).toBeInTheDocument();
    expect(within(totalCard(p.totals.refunded)).getByText(cop(19000))).toBeInTheDocument();
  });

  it('maps each flag to its anomaly badge', async () => {
    render(<PaymentsTab eventId="ev-1" />);
    await screen.findByText('Bruno');

    const rowOf = (name) => screen.getByText(name).closest('tr');
    expect(within(rowOf('Bruno')).getByText(p.flags.DUPLICATE)).toBeInTheDocument();
    expect(within(rowOf('Carla')).getByText(p.flags.EVENT_CANCELED)).toBeInTheDocument();
    expect(within(rowOf('Dario')).getByText(p.flags.REGISTRATION_CANCELED)).toBeInTheDocument();
    expect(within(rowOf('Eva')).getByText(p.flags.EARLY_BIRD_OVERRUN)).toBeInTheDocument();
    expect(within(rowOf('Ana')).queryByText(p.flags.DUPLICATE)).toBeNull();
  });

  it('shows the refund method only for pending refunds, and "Mark refunded" asks for confirmation first', async () => {
    render(<PaymentsTab eventId="ev-1" />);
    await screen.findByText('Bruno');

    const row = screen.getByText('Bruno').closest('tr');
    expect(within(row).getByText('3001234567')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: p.markRefunded })).toHaveLength(1);

    fireEvent.click(within(row).getByRole('button', { name: p.markRefunded }));
    const dialog = screen.getByRole('alertdialog');
    expect(AdminEventService.markRefunded).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: p.confirmRefund.confirm }));

    await waitFor(() => expect(AdminEventService.markRefunded).toHaveBeenCalledWith('ev-1', 'p2'));
    await waitFor(() => expect(AdminEventService.payments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('Escape closes the confirmation without marking anything', async () => {
    render(<PaymentsTab eventId="ev-1" />);
    await screen.findByText('Bruno');

    fireEvent.click(screen.getByRole('button', { name: p.markRefunded }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(AdminEventService.markRefunded).not.toHaveBeenCalled();
  });
});
