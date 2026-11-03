/**
 * /payments/confirm — the page Wompi sends the student back to ("Volver al
 * comercio") with `?id=<transactionId>`. It confirms the checkout remembered
 * in this browser and never invites a second payment.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import PaymentConfirmPage from '@/app/payments/confirm/page';
import { PaymentService } from '@/app/services/core/PaymentService';
import en from '@/lib/i18n/locales/en.json';
import es from '@/lib/i18n/locales/es.json';

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock('@/app/services/core/PaymentService', () => {
  const PaymentService = { confirmWompiPayment: jest.fn() };
  return {
    __esModule: true,
    PaymentService,
    default: PaymentService,
    PENDING_CONFIRM_POLLING: { attempts: 8, retryDelayMs: 5000 },
  };
});

const copy = en.payments.return;
const STORAGE_KEY = 'calico_last_wompi_checkout';

function rememberCheckout(checkout = { reference: 'TXN-1', returnTo: '/eventos/repaso-calculo' }) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...checkout, savedAt: Date.now() }));
}

function failWith(code, status) {
  return Object.assign(new Error(code), { code, status });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockSearchParams = new URLSearchParams('id=wompi-1&env=test');
});

it('test_should_have_the_return_copy_in_both_locales', () => {
  expect(Object.keys(es.payments.return).sort()).toEqual(Object.keys(copy).sort());
});

it('test_should_confirm_the_remembered_checkout_and_link_back_to_returnTo', async () => {
  let resolveConfirm;
  PaymentService.confirmWompiPayment.mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve; }));
  rememberCheckout();

  render(<PaymentConfirmPage />);

  expect(screen.getByText(copy.confirming)).toBeInTheDocument();
  await waitFor(() => expect(PaymentService.confirmWompiPayment).toHaveBeenCalledWith(
    { reference: 'TXN-1', transactionId: 'wompi-1' },
    expect.objectContaining({ attempts: expect.any(Number), retryDelayMs: expect.any(Number) }),
  ));
  // Still waiting on the server: not reported as confirmed, checkout kept.
  expect(screen.queryByText(copy.confirmedTitle)).not.toBeInTheDocument();
  expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

  await act(async () => resolveConfirm({ session: { id: 'sess-1' } }));

  expect(await screen.findByText(copy.confirmedTitle)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: copy.continue })).toHaveAttribute('href', '/eventos/repaso-calculo');
  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it('test_should_show_in_progress_when_the_bank_has_not_approved_yet', async () => {
  PaymentService.confirmWompiPayment.mockRejectedValue(failWith('PAYMENT_PENDING', 202));
  rememberCheckout({ reference: 'TXN-1', returnTo: '/home/history' });

  render(<PaymentConfirmPage />);

  expect(await screen.findByText(copy.pendingTitle)).toBeInTheDocument();
  expect(screen.getByText(copy.pendingBody)).toBeInTheDocument();
  expect(screen.queryByText(copy.confirmedTitle)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: copy.continue })).toHaveAttribute('href', '/home/history');
});

it.each([
  ['not logged in (401)', 'Unauthorized', 401],
  ['charge refused (400)', 'Pago rechazado (fondos insuficientes u otro motivo)', 400],
  ['paid but not booked (409)', 'INTENT_CONSUMED', 409],
])('test_should_show_payment_received_when_confirmation_fails: %s', async (_label, code, status) => {
  PaymentService.confirmWompiPayment.mockRejectedValue(failWith(code, status));
  rememberCheckout();

  render(<PaymentConfirmPage />);

  expect(await screen.findByText(copy.receivedTitle)).toBeInTheDocument();
  expect(screen.getByText(copy.receivedBody)).toBeInTheDocument();
  expect(screen.queryByText(copy.confirmedTitle)).not.toBeInTheDocument();
  expect(screen.queryByText(code)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: copy.continue })).toHaveAttribute('href', '/eventos/repaso-calculo');
});

it('test_should_not_call_the_api_when_wompi_sent_no_transaction_id', async () => {
  mockSearchParams = new URLSearchParams();
  rememberCheckout();

  render(<PaymentConfirmPage />);

  expect(await screen.findByText(copy.receivedTitle)).toBeInTheDocument();
  expect(PaymentService.confirmWompiPayment).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: copy.continue })).toHaveAttribute('href', '/home/history');
});

it('test_should_not_call_the_api_when_this_browser_has_no_remembered_checkout', async () => {
  render(<PaymentConfirmPage />);

  expect(await screen.findByText(copy.receivedTitle)).toBeInTheDocument();
  expect(PaymentService.confirmWompiPayment).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: copy.continue })).toHaveAttribute('href', '/home/history');
});
