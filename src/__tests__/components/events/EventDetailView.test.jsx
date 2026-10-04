/**
 * EventDetailView — CTA state machine, anonymous "register" hand-off through
 * login, meeting link visibility, auto-open on ?inscribir=1, and the free and
 * paid registration flows.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventDetailView, { ctaState } from '@/app/eventos/[slug]/EventDetailView';
import { EventService } from '@/app/services/core/EventService';
import { savePendingBooking, clearPendingBooking } from '@/app/services/utils/pendingBooking';
import { loadWompiScript, createWompiWidget, openWompiCheckout } from '@/app/services/utils/wompiCheckout';
import { useAuth } from '@/app/context/SecureAuthContext';

const mockPush = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => mockSearch,
}));

jest.mock('@/app/services/core/EventService', () => {
  const EventService = {
    getBySlug: jest.fn(),
    register: jest.fn(),
    startCheckout: jest.fn(),
    confirmPayment: jest.fn(),
    cancelRegistration: jest.fn(),
    submitSurvey: jest.fn(),
  };
  return { __esModule: true, EventService, default: EventService };
});

jest.mock('@/app/services/utils/pendingBooking', () => ({
  savePendingBooking: jest.fn(),
  clearPendingBooking: jest.fn(),
}));

jest.mock('@/app/services/utils/wompiCheckout', () => ({
  loadWompiScript: jest.fn(),
  createWompiWidget: jest.fn(),
  openWompiCheckout: jest.fn(),
}));

const SLUG = 'repaso-calculo-ab12';

const baseEvent = {
  id: 'e1',
  slug: SLUG,
  title: 'Repaso de Cálculo',
  description: 'Línea 1\nLínea 2',
  coverImageUrl: null,
  startsAt: '2026-10-10T23:00:00.000Z',
  endsAt: '2026-10-11T01:00:00.000Z',
  modality: 'Virtual',
  location: null,
  price: 0,
  earlyBird: null,
  status: 'Published',
  isListed: true,
  registrationOpen: true,
  hasEnded: false,
  course: { id: 'c1', name: 'Cálculo Diferencial', code: 'MATE1203' },
  tutors: [{ id: 't1', name: 'Ana Pérez', profilePictureUrl: null, rating: 4.8, numReview: 12 }],
};

const confirmedRegistration = {
  status: 'Confirmed',
  earlyBird: false,
  finalAmount: 0,
  confirmedAt: '2026-10-01T00:00:00.000Z',
  canCancel: true,
  refundable: false,
  surveyStatus: 'none',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
};

function mockEvent(event = baseEvent, myRegistration = null) {
  EventService.getBySlug.mockResolvedValue({ success: true, event, myRegistration });
}

function loggedIn(isLoggedIn) {
  useAuth.mockReturnValue({ user: { isLoggedIn, name: 'Test', email: 't@example.com' }, loading: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = new URLSearchParams();
  loggedIn(true);
  window.WidgetCheckout = function WidgetCheckout() {};
});

describe('ctaState', () => {
  const ev = (o = {}) => ({ status: 'Published', registrationOpen: true, hasEnded: false, ...o });
  const reg = (o = {}) => ({ status: 'Confirmed', surveyStatus: 'none', ...o });

  it.each([
    ['canceled', ev({ status: 'Canceled', registrationOpen: false }), reg(), true],
    ['canceled', ev({ status: 'Canceled', registrationOpen: false, hasEnded: true }), reg({ surveyStatus: 'pending' }), true],
    ['surveyPending', ev({ hasEnded: true, registrationOpen: false }), reg({ surveyStatus: 'pending' }), true],
    ['ended', ev({ hasEnded: true, registrationOpen: false }), null, false],
    ['ended', ev({ hasEnded: true, registrationOpen: false }), reg({ surveyStatus: 'submitted' }), true],
    ['registered', ev(), reg(), true],
    ['registered', ev({ registrationOpen: false }), reg(), true],
    ['closed', ev({ registrationOpen: false }), null, false],
    ['closed', ev({ registrationOpen: false }), reg({ status: 'Canceled' }), true],
    ['register', ev(), null, false],
    ['register', ev(), null, true],
    ['paymentPending', ev(), reg({ status: 'PendingPayment' }), true],
    ['paymentPending', ev({ registrationOpen: false }), reg({ status: 'PendingPayment' }), true],
    ['ended', ev({ hasEnded: true, registrationOpen: false }), reg({ status: 'PendingPayment' }), true],
    ['register', ev(), reg({ status: 'PendingPayment' }), false],
    ['register', ev(), reg({ status: 'Canceled' }), true],
  ])('returns %s', (expected, event, myRegistration, isLoggedIn) => {
    expect(ctaState(event, myRegistration, isLoggedIn)).toBe(expected);
  });
});

describe('EventDetailView', () => {
  it('renders the public content with the description line breaks preserved', async () => {
    mockEvent();
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByRole('heading', { name: 'Repaso de Cálculo' })).toBeInTheDocument();
    expect(screen.getByText(/Línea 1/).textContent).toBe('Línea 1\nLínea 2');
    expect(screen.getByText('Cálculo Diferencial')).toBeInTheDocument();
    const tutorLink = screen.getByRole('link', { name: /Ana Pérez/ });
    expect(tutorLink).toHaveAttribute('href', '/home/buscar-tutores/tutor/t1');
    expect(tutorLink).toHaveTextContent('★ 4.8 (12)');
    expect(EventService.getBySlug).toHaveBeenCalledWith(SLUG);
  });

  it('shows the not-found state for an unknown slug', async () => {
    EventService.getBySlug.mockResolvedValue({ success: false, error: 'EVENT_NOT_FOUND', status: 404 });
    render(<EventDetailView slug="does-not-exist" />);
    expect(await screen.findByText("We couldn't find this event")).toBeInTheDocument();
  });

  it('anonymous "Sign me up" saves the pending URL and sends the person to login', async () => {
    loggedIn(false);
    mockEvent();
    render(<EventDetailView slug={SLUG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign me up' }));

    const target = `/eventos/${SLUG}?inscribir=1`;
    expect(savePendingBooking).toHaveBeenCalledWith(target);
    expect(mockPush).toHaveBeenCalledWith(`/auth/login?returnTo=${encodeURIComponent(target)}`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a valid ?ref= source through the login hand-off and drops an invalid one', async () => {
    loggedIn(false);
    mockEvent();
    mockSearch = new URLSearchParams('ref=Instagram');
    const { unmount } = render(<EventDetailView slug={SLUG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign me up' }));
    expect(savePendingBooking).toHaveBeenLastCalledWith(`/eventos/${SLUG}?inscribir=1&ref=instagram`);
    unmount();

    mockSearch = new URLSearchParams('ref=<script>');
    render(<EventDetailView slug={SLUG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign me up' }));
    expect(savePendingBooking).toHaveBeenLastCalledWith(`/eventos/${SLUG}?inscribir=1`);
  });

  it('renders the meeting link only in the registered state', async () => {
    mockEvent(baseEvent, confirmedRegistration);
    const { unmount } = render(<EventDetailView slug={SLUG} />);
    const join = await screen.findByRole('link', { name: /Join the session/ });
    expect(join).toHaveAttribute('href', confirmedRegistration.meetingUrl);
    expect(join).toHaveAttribute('target', '_blank');
    expect(join).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText("You're registered")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel registration' })).toBeInTheDocument();
    unmount();

    // Same data once the event is over: state "ended" → no meeting link.
    mockEvent(
      { ...baseEvent, hasEnded: true, registrationOpen: false },
      { ...confirmedRegistration, canCancel: false, surveyStatus: 'submitted' },
    );
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText('This event has ended')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Join the session/ })).toBeNull();
    expect(document.querySelector(`a[href="${confirmedRegistration.meetingUrl}"]`)).toBeNull();
  });

  it('a Confirmed registrant sees the amount they paid, not the list price or the early-bird offer', async () => {
    // Paid the early-bird price; the last slot is now theirs, so the offer reads "0 left".
    mockEvent(
      { ...baseEvent, price: 20000, earlyBird: { slots: 1, percent: 10, remaining: 0, discountedPrice: 18000 } },
      { ...confirmedRegistration, earlyBird: true, finalAmount: 18000 },
    );
    const { unmount } = render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.getByText(/18\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/20\.000/)).toBeNull();
    unmount();

    // Paid the list price while discounted spots are still on offer: no "spots left" line.
    mockEvent(
      { ...baseEvent, price: 20000, earlyBird: { slots: 10, percent: 20, remaining: 3, discountedPrice: 16000 } },
      { ...confirmedRegistration, finalAmount: 20000 },
    );
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.getByText(/20\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/16\.000/)).toBeNull();
    expect(screen.queryByText(/spots left/)).toBeNull();
  });

  it('a canceled event shows the banner and no longer advertises early-bird spots', async () => {
    mockEvent({
      ...baseEvent,
      status: 'Canceled',
      registrationOpen: false,
      price: 20000,
      earlyBird: { slots: 10, percent: 20, remaining: 3, discountedPrice: 16000 },
    });
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText('This event was canceled')).toBeInTheDocument();
    expect(screen.queryByText(/spots left/)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign up/i })).toBeNull();
  });

  it('PendingPayment: shows the in-progress notice and a secondary "Retry payment" that opens the confirmation', async () => {
    mockEvent({ ...baseEvent, price: 20000 }, { status: 'PendingPayment', surveyStatus: 'none', meetingUrl: null });
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText('You have a payment in progress')).toBeInTheDocument();
    expect(screen.getByText(/If you didn't finish the payment, you can try again\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay and sign up/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry payment' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm your registration' })).toBeInTheDocument();
  });

  it('PendingPayment once registration has closed: notice without the retry', async () => {
    mockEvent(
      { ...baseEvent, price: 20000, registrationOpen: false },
      { status: 'PendingPayment', surveyStatus: 'none', meetingUrl: null },
    );
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText('You have a payment in progress')).toBeInTheDocument();
    expect(screen.getByText("If you already paid, wait a few minutes: we'll let you know by email."))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry payment' })).toBeNull();
    expect(screen.queryByText('Registration closed')).toBeNull();
  });

  it('shows the location instead of a link for an in-person registration', async () => {
    mockEvent(
      { ...baseEvent, modality: 'InPerson', location: 'Edificio ML, salón 515' },
      { ...confirmedRegistration, meetingUrl: null },
    );
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.getAllByText('Edificio ML, salón 515').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Join the session/ })).toBeNull();
  });

  it('auto-opens the confirmation once on ?inscribir=1 and clears the pending booking', async () => {
    mockEvent();
    mockSearch = new URLSearchParams('inscribir=1');
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm your registration' })).toBeInTheDocument();
    expect(clearPendingBooking).toHaveBeenCalledTimes(1);
    // The marketing opt-in is unchecked by default.
    expect(
      screen.getByRole('checkbox', { name: 'I want to hear from Calico about upcoming reviews and events.' }),
    ).not.toBeChecked();
  });

  it('?encuesta=1 while anonymous sends the person to login and back to the survey', async () => {
    loggedIn(false);
    mockEvent({ ...baseEvent, hasEnded: true, registrationOpen: false });
    mockSearch = new URLSearchParams('encuesta=1');
    render(<EventDetailView slug={SLUG} />);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        `/auth/login?returnTo=${encodeURIComponent(`/eventos/${SLUG}?encuesta=1`)}`,
      ),
    );
  });

  it('?encuesta=1 with a pending survey opens the survey modal', async () => {
    mockEvent(
      { ...baseEvent, hasEnded: true, registrationOpen: false },
      { ...confirmedRegistration, canCancel: false, surveyStatus: 'pending' },
    );
    mockSearch = new URLSearchParams('encuesta=1');
    render(<EventDetailView slug={SLUG} />);
    expect(await screen.findByText('Did you attend Repaso de Cálculo?')).toBeInTheDocument();
  });

  it('free registration: confirm → register → success state → refresh', async () => {
    mockEvent();
    EventService.register.mockResolvedValue({ success: true, registration: { id: 'r1', status: 'Confirmed' } });
    render(<EventDetailView slug={SLUG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign me up' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm registration' }));

    expect(await screen.findByText("All set! You're registered")).toBeInTheDocument();
    expect(EventService.register).toHaveBeenCalledWith(SLUG, { source: undefined, marketingOptIn: true });
    await waitFor(() => expect(EventService.getBySlug).toHaveBeenCalledTimes(2));
  });

  it('ALREADY_REGISTERED refreshes instead of showing an error', async () => {
    mockEvent();
    EventService.register.mockResolvedValue({ success: false, error: 'ALREADY_REGISTERED', status: 409 });
    render(<EventDetailView slug={SLUG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign me up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm registration' }));
    await waitFor(() => expect(EventService.getBySlug).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('maps EVENT_NOT_OPEN to its message', async () => {
    mockEvent();
    EventService.register.mockResolvedValue({ success: false, error: 'EVENT_NOT_OPEN', status: 409 });
    render(<EventDetailView slug={SLUG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign me up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm registration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Registration for this event is no longer open.');
  });

  describe('paid registration', () => {
    const paidEvent = {
      ...baseEvent,
      price: 20000,
      earlyBird: { slots: 10, percent: 20, remaining: 3, discountedPrice: 16000 },
    };
    const checkout = {
      reference: 'EVT-1',
      amountInCents: 1600000,
      currency: 'COP',
      publicKey: 'pub_test_x',
      signature: 'sig',
      quote: { listPrice: 20000, discountAmount: 4000, finalAmount: 16000, earlyBird: true },
      customer: { email: 't@example.com', fullName: 'Test', phoneNumber: '3000000000' },
    };

    async function openAndPay(result) {
      mockEvent(paidEvent);
      EventService.startCheckout.mockResolvedValue({ success: true, checkout });
      createWompiWidget.mockReturnValue({ widget: true });
      openWompiCheckout.mockImplementation((_widget, onResult) => onResult(result));
      const view = render(<EventDetailView slug={SLUG} />);
      fireEvent.click(await screen.findByRole('button', { name: /Pay and sign up/ }));
      // The modal's confirm ("Pay $ 16.000") — the page CTA reads "Pay and sign up …".
      fireEvent.click(screen.getByRole('button', { name: /^Pay \$/ }));
      return view;
    }

    it('APPROVED → confirm-payment → success', async () => {
      EventService.confirmPayment.mockResolvedValue({ success: true, result: {} });
      await openAndPay({ transaction: { id: 'tx-1', status: 'APPROVED' } });

      expect(await screen.findByText("All set! You're registered")).toBeInTheDocument();
      expect(EventService.startCheckout).toHaveBeenCalledWith(SLUG, { source: undefined, marketingOptIn: false });
      expect(loadWompiScript).toHaveBeenCalled();
      expect(createWompiWidget).toHaveBeenCalledWith(expect.objectContaining({
        amountInCents: 1600000, reference: 'EVT-1', publicKey: 'pub_test_x', signature: 'sig',
        customer: checkout.customer,
      }));
      expect(EventService.confirmPayment).toHaveBeenCalledWith({ reference: 'EVT-1', transactionId: 'tx-1' });
    });

    it('widget closed without a result → paymentClosed', async () => {
      await openAndPay(null);
      expect(await screen.findByText('You closed the payment without finishing it. You can try again.'))
        .toBeInTheDocument();
    });

    it('DECLINED → paymentDeclined', async () => {
      await openAndPay({ transaction: { id: 'tx-2', status: 'DECLINED' } });
      expect(await screen.findByText('Your payment was declined. Try another payment method.'))
        .toBeInTheDocument();
    });

    it('any other status → paymentError', async () => {
      await openAndPay({ transaction: { id: 'tx-3', status: 'ERROR' } });
      expect(await screen.findByText('Something went wrong with the payment. Please try again.'))
        .toBeInTheDocument();
    });

    it('PENDING (PSE / Nequi) → no confirm-payment, "don\'t pay again" message, then polls until Confirmed', async () => {
      await openAndPay({ transaction: { id: 'tx-5', status: 'PENDING' } });
      expect(
        await screen.findByText("Your payment is being processed. We'll confirm by email once it's approved; don't pay again."),
      ).toBeInTheDocument();
      expect(EventService.confirmPayment).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Something went wrong with the payment. Please try again.')).toBeNull();

      EventService.getBySlug.mockResolvedValue({
        success: true, event: paidEvent, myRegistration: { ...confirmedRegistration, finalAmount: 16000 },
      });
      expect(await screen.findByText("All set! You're registered", {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('is not dismissible while confirming (Escape, overlay click, "Not now")', async () => {
      EventService.confirmPayment.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR', status: 500 });
      const { unmount } = await openAndPay({ transaction: { id: 'tx-6', status: 'APPROVED' } });
      await screen.findByText("Your payment was approved; we're confirming your registration…");

      fireEvent.keyDown(document, { key: 'Escape' });
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.parentElement);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      unmount();
    });

    it('APPROVED but confirm-payment fails → processing message, then polls until Confirmed', async () => {
      EventService.confirmPayment.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR', status: 500 });
      await openAndPay({ transaction: { id: 'tx-4', status: 'APPROVED' } });
      expect(await screen.findByText("Your payment was approved; we're confirming your registration…"))
        .toBeInTheDocument();

      EventService.getBySlug.mockResolvedValue({
        success: true, event: paidEvent, myRegistration: { ...confirmedRegistration, finalAmount: 16000 },
      });
      expect(await screen.findByText("All set! You're registered", {}, { timeout: 5000 })).toBeInTheDocument();
    });
  });
});
