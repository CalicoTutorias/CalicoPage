/**
 * RegistrationsTab (admin event detail) — on an approval event: the summary,
 * approve (direct) and reject (behind a ConfirmDialog) per row, and the row
 * replaced with the API answer. Without approval nothing of that shows.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegistrationsTab from '@/app/home/admin/eventos/_components/RegistrationsTab';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { registrations: jest.fn(), reviewRegistration: jest.fn(), downloadRegistrationsCsv: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

const r = en.admin.events.registrations;
const row = (o) => ({
  phone: '3001234567', career: 'Ingeniería de Sistemas', source: 'afiche', earlyBird: false, finalAmount: 25000,
  surveyAnswered: false, registeredAt: '2026-10-20T15:00:00.000Z', refundMethod: null, refundMethodDetails: null, ...o,
});
const ROWS = [
  row({ id: 'r1', name: 'Ana', email: 'ana@x.co', status: 'PendingApproval' }),
  row({ id: 'r2', name: 'Bruno', email: 'bruno@x.co', status: 'Confirmed' }),
  row({ id: 'r3', name: 'Carla', email: 'carla@x.co', status: 'Rejected' }),
  row({ id: 'r4', name: 'Dario', email: 'dario@x.co', status: 'Canceled', refundMethod: 'nequi', refundMethodDetails: '3009998888' }),
];

beforeEach(() => {
  jest.clearAllMocks();
  AdminEventService.registrations.mockResolvedValue({ success: true, registrations: ROWS });
});

describe('RegistrationsTab', () => {
  it('approval event: summary counts and the actions each status allows', async () => {
    render(<RegistrationsTab eventId="ev-1" slug="repaso" requiresApproval canReview />);
    await screen.findByText('Ana');

    expect(screen.getByText('1 approved · 1 awaiting approval · 1 rejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Approve Ana's registration" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Reject Ana's registration" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Approve Bruno's registration" })).toBeNull();
    expect(screen.getByRole('button', { name: "Reject Bruno's registration" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Approve Carla's registration" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dario's registration/ })).toBeNull();
    expect(screen.getByText('Refund: Nequi · 3009998888')).toBeInTheDocument();
  });

  it('approve updates the row in place and says whether the email went out', async () => {
    AdminEventService.reviewRegistration.mockResolvedValue({
      success: true, emailSent: true, registration: { ...ROWS[0], status: 'Confirmed' },
    });
    render(<RegistrationsTab eventId="ev-1" slug="repaso" requiresApproval canReview />);
    fireEvent.click(await screen.findByRole('button', { name: "Approve Ana's registration" }));

    expect(await screen.findByText(r.approvedEmailSent.replace('{name}', 'Ana'))).toBeInTheDocument();
    expect(AdminEventService.reviewRegistration).toHaveBeenCalledWith('ev-1', 'r1', 'approve');
    expect(screen.queryByRole('button', { name: "Approve Ana's registration" })).toBeNull();
    expect(screen.getByText('2 approved · 0 awaiting approval · 1 rejected')).toBeInTheDocument();
  });

  it('reject asks first; going back sends nothing, confirming rejects', async () => {
    AdminEventService.reviewRegistration.mockResolvedValue({
      success: true, emailSent: false, registration: { ...ROWS[1], status: 'Rejected' },
    });
    render(<RegistrationsTab eventId="ev-1" slug="repaso" requiresApproval canReview />);
    fireEvent.click(await screen.findByRole('button', { name: "Reject Bruno's registration" }));

    expect(screen.getByText(r.rejectTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: r.rejectConfirm }));

    await waitFor(() => expect(AdminEventService.reviewRegistration).toHaveBeenCalledWith('ev-1', 'r2', 'reject'));
    expect(await screen.findByText(r.rejectedDone.replace('{name}', 'Bruno'))).toBeInTheDocument();
    expect(screen.queryByText(r.rejectTitle)).toBeNull();
  });

  it('a refused review shows the error', async () => {
    AdminEventService.reviewRegistration.mockResolvedValue({ success: false, code: 'INVALID_STATE', status: 409 });
    render(<RegistrationsTab eventId="ev-1" slug="repaso" requiresApproval canReview />);
    fireEvent.click(await screen.findByRole('button', { name: "Approve Ana's registration" }));

    expect(await screen.findByText(en.admin.events.errors.INVALID_STATE)).toBeInTheDocument();
  });

  it('without approval (or on a canceled event) there are no review actions nor summary', async () => {
    const { unmount } = render(<RegistrationsTab eventId="ev-1" slug="repaso" />);
    await screen.findByText('Ana');
    expect(screen.queryByRole('button', { name: /registration$/ })).toBeNull();
    expect(screen.queryByText(/awaiting approval ·/)).toBeNull();
    unmount();

    render(<RegistrationsTab eventId="ev-1" slug="repaso" requiresApproval canReview={false} />);
    await screen.findByText('Ana');
    expect(screen.queryByRole('button', { name: /registration$/ })).toBeNull();
  });
});
