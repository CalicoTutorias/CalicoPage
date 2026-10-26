/**
 * BookingForm — what the student sees after Wompi approves the charge but the
 * session cannot be registered. The rule: never the technical error, always
 * "we received your payment, write to us on WhatsApp" with the reference, and
 * the form stays locked so they cannot pay twice.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingForm from '@/app/home/agendar/BookingForm';
import { PaymentService } from '@/app/services/core/PaymentService';
import { openWompiCheckout } from '@/app/services/utils/wompiCheckout';
import { CouponService } from '@/app/services/core/CouponService';

jest.mock('@/app/services/core/PaymentService', () => {
  const PaymentService = { createWompiPayment: jest.fn(), confirmWompiPayment: jest.fn() };
  return { __esModule: true, PaymentService, default: PaymentService };
});
jest.mock('@/app/services/core/CouponService', () => {
  const CouponService = { validateForBooking: jest.fn() };
  return { __esModule: true, CouponService, default: CouponService };
});
jest.mock('@/app/services/utils/wompiCheckout', () => ({
  loadWompiScript: jest.fn(),
  createWompiWidget: jest.fn(() => ({})),
  openWompiCheckout: jest.fn(),
}));
jest.mock('@/app/hooks/useFileUpload', () => ({
  useFileUpload: () => ({
    files: [{ id: 'f1', status: 'success' }],
    uploadedFiles: [{ s3Key: 'k', fileName: 'a.png', fileSize: 1, mimeType: 'image/png' }],
    uploadFiles: jest.fn(),
    retryFile: jest.fn(),
    removeFile: jest.fn(),
    addFiles: jest.fn(),
  }),
}));
jest.mock('@/app/components/FileUploader/FileUploader', () => ({ __esModule: true, default: () => null }));

const SESSION = {
  tutorId: 'tutor-1',
  studentId: 'student-1',
  courseId: 'course-1',
  scheduledDateTime: '2026-10-12T15:00:00.000Z',
  endDateTime: '2026-10-12T16:00:00.000Z',
  price: 45000,
  studentEmail: 'paula@example.com',
  studentName: 'Paula',
  course: 'Cálculo Vectorial',
};
const INTENT = { reference: 'TXN-1', publicKey: 'pub', signature: 'sig', amountInCents: 4500000, metadata: {} };

async function payWithWidgetApproved() {
  fireEvent.change(screen.getByLabelText(/qué temas quieres repasar/i), { target: { value: 'Integrales dobles' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar con wompi/i }));
  await waitFor(() => expect(openWompiCheckout).toHaveBeenCalled());
  const [, onResult] = openWompiCheckout.mock.calls[0];
  onResult({ transaction: { id: 'wompi-1', status: 'APPROVED', reference: 'TXN-1' } });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  PaymentService.createWompiPayment.mockResolvedValue(INTENT);
});
afterEach(() => console.error.mockRestore());

it('books the session when the server confirms the approved charge', async () => {
  PaymentService.confirmWompiPayment.mockResolvedValue({ session: { id: 'sess-1' } });
  const onSuccess = jest.fn();
  render(<BookingForm session={SESSION} onSuccess={onSuccess} />);

  await payWithWidgetApproved();

  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ reference: 'TXN-1', session: { id: 'sess-1' } })));
  expect(PaymentService.confirmWompiPayment).toHaveBeenCalledWith({ reference: 'TXN-1', transactionId: 'wompi-1' });
  expect(screen.queryByTestId('unregistered-payment')).not.toBeInTheDocument();
});

it.each([
  ['Wompi unreachable (retryable 503)', { code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: true, message: 'No se pudo verificar la transacción con el proveedor de pagos' }],
  ['slot refused (409)', { code: 'INTENT_CONSUMED', status: 409, retryable: false, message: 'El pago fue recibido pero no se pudo registrar la sesión.' }],
  ['server error (500)', { code: 'Internal server error', status: 500, retryable: false, message: 'Internal server error' }],
])('%s: shows the WhatsApp support box with the reference and keeps the form locked', async (_label, failure) => {
  PaymentService.confirmWompiPayment.mockRejectedValue(Object.assign(new Error(failure.message), failure));
  const onSuccess = jest.fn();
  render(<BookingForm session={SESSION} onSuccess={onSuccess} />);

  await payWithWidgetApproved();

  const box = await screen.findByTestId('unregistered-payment');
  expect(box).toHaveTextContent(/recibimos tu pago|we received your payment/i);
  expect(box).toHaveTextContent('TXN-1');
  // Never the technical reason.
  expect(screen.queryByText(failure.message)).not.toBeInTheDocument();
  expect(screen.queryByText(failure.code)).not.toBeInTheDocument();

  const link = screen.getByRole('link', { name: /whatsapp/i });
  expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/573102906071\?text=/));
  expect(decodeURIComponent(link.getAttribute('href'))).toContain('TXN-1');

  // Locked: no second payment possible, and the booking is not reported as done.
  expect(screen.getByRole('button', { name: /pago recibido|payment received/i })).toBeDisabled();
  expect(onSuccess).not.toHaveBeenCalled();
});

it('a declined charge (no money taken) unlocks the form instead of the support box', async () => {
  render(<BookingForm session={SESSION} onSuccess={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/qué temas quieres repasar/i), { target: { value: 'Integrales dobles' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar con wompi/i }));
  await waitFor(() => expect(openWompiCheckout).toHaveBeenCalled());
  openWompiCheckout.mock.calls[0][1]({ transaction: { id: 'wompi-2', status: 'DECLINED' } });

  expect(await screen.findByText(/pago rechazado/i)).toBeInTheDocument();
  expect(screen.queryByTestId('unregistered-payment')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /pagar con wompi/i })).not.toBeDisabled();
  expect(PaymentService.confirmWompiPayment).not.toHaveBeenCalled();
});

describe('charge pending at the bank (PSE / Nequi)', () => {
  async function payWithWidgetPending() {
    fireEvent.change(screen.getByLabelText(/qué temas quieres repasar/i), { target: { value: 'Integrales dobles' } });
    fireEvent.click(screen.getByRole('button', { name: /pagar con wompi/i }));
    await waitFor(() => expect(openWompiCheckout).toHaveBeenCalled());
    openWompiCheckout.mock.calls[0][1]({ transaction: { id: 'wompi-3', status: 'PENDING', reference: 'TXN-1' } });
  }

  it('books the session when the bank approves it while the form polls', async () => {
    PaymentService.confirmWompiPayment.mockResolvedValue({ session: { id: 'sess-3' } });
    const onSuccess = jest.fn();
    render(<BookingForm session={SESSION} onSuccess={onSuccess} />);

    await payWithWidgetPending();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ reference: 'TXN-1', session: { id: 'sess-3' } })));
    expect(PaymentService.confirmWompiPayment).toHaveBeenCalledWith(
      { reference: 'TXN-1', transactionId: 'wompi-3' },
      expect.objectContaining({ attempts: expect.any(Number), retryDelayMs: expect.any(Number) }),
    );
  });

  it('still pending after polling: "in progress" with the reference, never an error, and the form stays locked', async () => {
    PaymentService.confirmWompiPayment.mockRejectedValue(
      Object.assign(new Error('El pago está pendiente de aprobación del banco'), { code: 'PAYMENT_PENDING', status: 202, retryable: true }),
    );
    const onSuccess = jest.fn();
    render(<BookingForm session={SESSION} onSuccess={onSuccess} />);

    await payWithWidgetPending();

    const box = await screen.findByTestId('unregistered-payment');
    expect(box).toHaveTextContent(/en proceso con tu banco|being processed by your bank/i);
    expect(box).toHaveTextContent('TXN-1');
    expect(screen.queryByText(/error procesando el pago/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pago en proceso|payment in progress/i })).toBeDisabled();
    expect(screen.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('100 % courtesy coupon', () => {
  it('books without opening the Wompi widget and reports success', async () => {
    CouponService.validateForBooking.mockResolvedValue({
      ok: true, valid: true,
      coupon: { code: 'CORTESIA' },
      pricing: { originalAmount: 45000, discountAmount: 45000, amount: 0, capped: false },
    });
    PaymentService.createWompiPayment.mockResolvedValue({
      free: true, reference: 'TXN-FREE', session: { id: 'sess-free' }, pricing: { amount: 0 },
    });
    const onSuccess = jest.fn();
    render(<BookingForm session={SESSION} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText(/escribe tu código|enter your code/i), { target: { value: 'cortesia' } });
    fireEvent.click(screen.getByRole('button', { name: /^aplicar$|^apply$/i }));
    const cta = await screen.findByRole('button', { name: /reservar sin pago|book without paying/i });

    fireEvent.change(screen.getByLabelText(/qué temas quieres repasar/i), { target: { value: 'Integrales dobles' } });
    fireEvent.click(cta);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ reference: 'TXN-FREE', session: { id: 'sess-free' } })));
    expect(PaymentService.createWompiPayment).toHaveBeenCalledWith(expect.objectContaining({ couponCode: 'CORTESIA' }));
    expect(openWompiCheckout).not.toHaveBeenCalled();
    expect(PaymentService.confirmWompiPayment).not.toHaveBeenCalled();
    expect(screen.queryByTestId('unregistered-payment')).not.toBeInTheDocument();
  });
});
