/**
 * CancelRegistrationModal — refundable (method + details), paid but late (no
 * refund warning), free (simple confirm).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CancelRegistrationModal from '@/app/components/Events/CancelRegistrationModal';
import { EventService } from '@/app/services/core/EventService';

jest.mock('@/app/services/core/EventService', () => {
  const EventService = { cancelRegistration: jest.fn() };
  return { __esModule: true, EventService, default: EventService };
});

const event = { slug: 'repaso-x', title: 'Repaso X', price: 20000 };
const paidRegistration = {
  status: 'Confirmed', finalAmount: 20000, canCancel: true, refundable: true, surveyStatus: 'none',
};

function setup(myRegistration, ev = event) {
  const onClose = jest.fn();
  const onCanceled = jest.fn();
  render(
    <CancelRegistrationModal
      event={ev}
      myRegistration={myRegistration}
      onClose={onClose}
      onCanceled={onCanceled}
    />,
  );
  return { onClose, onCanceled };
}

beforeEach(() => {
  jest.clearAllMocks();
  EventService.cancelRegistration.mockResolvedValue({ success: true, refundable: true });
});

describe('CancelRegistrationModal', () => {
  it('refundable: confirm stays disabled until method and details are filled', async () => {
    const { onCanceled } = setup(paidRegistration);
    const confirm = screen.getByRole('button', { name: 'Cancel registration' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Refund method'), { target: { value: 'nequi' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Refund details'), { target: { value: ' 3001234567 ' } });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onCanceled).toHaveBeenCalledWith({ refundable: true }));
    expect(EventService.cancelRegistration).toHaveBeenCalledWith('repaso-x', {
      refundMethod: 'nequi',
      refundMethodDetails: '3001234567',
    });
  });

  it('offers the same refund methods as the tutoring cancellation', () => {
    setup(paidRegistration);
    const values = Array.from(screen.getByLabelText('Refund method').querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(values).toEqual(['llave', 'nequi', 'use_future_session']);
  });

  it('paid but not refundable: shows the no-refund warning and no refund fields', () => {
    setup({ ...paidRegistration, refundable: false });
    expect(
      screen.getByText('Less than 6 hours to go: you can cancel, but there is no automatic refund.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Refund method')).toBeNull();
    expect(screen.queryByLabelText('Refund details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel registration' })).toBeEnabled();
  });

  it('free: a simple confirm that sends no refund fields', async () => {
    EventService.cancelRegistration.mockResolvedValue({ success: true, refundable: false });
    const { onCanceled } = setup(
      { ...paidRegistration, finalAmount: 0, refundable: false },
      { ...event, price: 0 },
    );
    expect(screen.queryByLabelText('Refund method')).toBeNull();
    expect(screen.queryByText(/no automatic refund/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));
    await waitFor(() => expect(onCanceled).toHaveBeenCalledWith({ refundable: false }));
    expect(EventService.cancelRegistration).toHaveBeenCalledWith('repaso-x', {});
  });

  it('shows an error when the API rejects the cancellation', async () => {
    EventService.cancelRegistration.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR', status: 500 });
    const { onCanceled } = setup({ ...paidRegistration, refundable: false });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onCanceled).not.toHaveBeenCalled();
  });

  it('"Keep my spot" closes without cancelling', () => {
    const { onClose } = setup(paidRegistration);
    fireEvent.click(screen.getByRole('button', { name: 'Keep my spot' }));
    expect(onClose).toHaveBeenCalled();
    expect(EventService.cancelRegistration).not.toHaveBeenCalled();
  });
});
