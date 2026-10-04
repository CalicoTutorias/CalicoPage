/**
 * Event registration: free sign-up, paid checkout with early-bird holds,
 * Wompi fulfilment and user cancellation.
 *
 * Concurrency: every state decision runs in a transaction that first locks
 * the event row (eventRegRepo.lockEvent). Checkouts, fulfilments and
 * cancellations of the same event therefore never interleave, and the
 * early-bird count read after the lock is final. A payment Wompi approved
 * is never refused: anomalies are recorded as EventPayment.flag for admin.
 */

import * as Sentry from '@sentry/nextjs';
import { waitUntil } from '@vercel/functions';
import prisma from '../prisma';
import * as eventRepo from '../repositories/event.repository';
import * as eventRegRepo from '../repositories/event-registration.repository';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import * as userRepo from '../repositories/user.repository';
import * as WompiService from './wompi.service';
import { sendRegistrationConfirmed } from './event-email.service';
import { quoteEvent, isRefundableAt, EVENT_HOLD_MINUTES } from '../payments/event-pricing';

export const EVENT_ERROR = Object.freeze({
  NOT_FOUND: 'EVENT_NOT_FOUND',
  NOT_OPEN: 'EVENT_NOT_OPEN',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  NOT_REGISTERED: 'NOT_REGISTERED',
  IS_FREE: 'EVENT_IS_FREE',
  IS_PAID: 'EVENT_IS_PAID',
  REFUND_DETAILS_REQUIRED: 'REFUND_DETAILS_REQUIRED',
  REGISTRATION_MISSING: 'EVENT_REGISTRATION_MISSING',
  TUTOR: 'EVENT_TUTOR',
});

function eventError(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function loadOpenableEvent(slug) {
  const event = await eventRepo.findBySlug(slug);
  if (!event || event.status === 'Draft') throw eventError(EVENT_ERROR.NOT_FOUND);
  return event;
}

/** An event's own tutors cannot register: they would end up rating themselves. */
function assertNotTutor(event, userId) {
  if (event.tutors?.some((t) => t.tutor.id === userId)) throw eventError(EVENT_ERROR.TUTOR);
}

function assertOpen(locked, now) {
  if (!locked || locked.status !== 'Published' || now >= new Date(locked.starts_at)) {
    throw eventError(EVENT_ERROR.NOT_OPEN);
  }
}

/**
 * Fire-and-forget confirmation email, after the commit. `event` may be a
 * promise (fulfilment reloads it): a failed lookup or send is only logged,
 * never surfaced to the payment caller. waitUntil keeps the send alive after
 * the response on Vercel (no-op elsewhere).
 */
function fireConfirmation(event, registration, userId) {
  waitUntil(
    Promise.all([event, userRepo.findById(userId)])
      .then(([ev, user]) => (ev && user ? sendRegistrationConfirmed({ event: ev, registration, user }) : null))
      .catch((err) => console.error(`[event-checkout] confirmation email failed for ${registration.id}:`, err?.message)),
  );
}

async function setOptIn(tx, userId, marketingOptIn, now) {
  if (!marketingOptIn) return;
  await tx.user.updateMany({ where: { id: userId, marketingOptInAt: null }, data: { marketingOptInAt: now } });
}

export async function registerFree({ slug, userId, source = null, marketingOptIn = false, now = new Date() }) {
  const event = await loadOpenableEvent(slug);
  assertNotTutor(event, userId);

  const { registration, created } = await prisma.$transaction(async (tx) => {
    const locked = await eventRegRepo.lockEvent(tx, event.id);
    assertOpen(locked, now);
    if (Number(locked.price) > 0) throw eventError(EVENT_ERROR.IS_PAID);

    const existing = await eventRegRepo.findRegistration(tx, event.id, userId);
    if (existing?.status === 'Confirmed') return { registration: existing, created: false };

    const data = {
      status: 'Confirmed', earlyBird: false, reservedAt: null,
      listPrice: 0, discountAmount: 0, finalAmount: 0, intentReference: null,
      confirmedAt: now, canceledAt: null, canceledBy: null, refundMethod: null, refundMethodDetails: null,
    };
    const row = existing
      ? await tx.eventRegistration.update({ where: { id: existing.id }, data })
      : await tx.eventRegistration.create({ data: { ...data, eventId: event.id, userId, source } });
    await setOptIn(tx, userId, marketingOptIn, now);
    return { registration: row, created: true };
  });

  if (created) fireConfirmation(event, registration, userId);
  return registration;
}

export async function startCheckout({ slug, userId, source = null, marketingOptIn = false, now = new Date() }) {
  const event = await loadOpenableEvent(slug);
  assertNotTutor(event, userId);
  const user = await userRepo.findById(userId);
  const reference = WompiService.generateEventReference();

  const { quote } = await prisma.$transaction(async (tx) => {
    const locked = await eventRegRepo.lockEvent(tx, event.id);
    assertOpen(locked, now);
    if (Number(locked.price) <= 0) throw eventError(EVENT_ERROR.IS_FREE);

    const existing = await eventRegRepo.findRegistration(tx, event.id, userId);
    if (existing?.status === 'Confirmed') throw eventError(EVENT_ERROR.ALREADY_REGISTERED);

    let earlyBird = false;
    if (locked.early_bird_slots) {
      const usage = await eventRegRepo.countEarlyBirdUsage(tx, {
        eventId: event.id, excludeUserId: userId, holdMinutes: EVENT_HOLD_MINUTES,
      });
      earlyBird = usage < locked.early_bird_slots;
    }
    const q = quoteEvent({ price: locked.price, earlyBirdPercent: locked.early_bird_percent }, { earlyBird });

    const data = {
      status: 'PendingPayment', earlyBird: q.earlyBird, reservedAt: now,
      listPrice: q.listPrice, discountAmount: q.discountAmount, finalAmount: q.finalAmount,
      intentReference: reference, canceledAt: null, canceledBy: null,
    };
    const registration = existing
      ? await tx.eventRegistration.update({ where: { id: existing.id }, data })
      : await tx.eventRegistration.create({ data: { ...data, eventId: event.id, userId, source } });

    await paymentIntentRepo.create({
      reference,
      kind: 'event',
      metadata: {
        kind: 'event',
        registrationId: registration.id,
        eventId: event.id,
        studentId: userId,
        listPrice: String(q.listPrice),
        discountAmount: String(q.discountAmount),
        finalAmount: String(q.finalAmount),
        earlyBird: q.earlyBird,
      },
    }, tx);
    await setOptIn(tx, userId, marketingOptIn, now);
    return { quote: q };
  });

  const widget = WompiService.signWidgetIntent({ reference, amount: quote.finalAmount });
  return {
    ...widget,
    quote,
    customer: {
      email: user?.email ?? null,
      fullName: user?.name ?? '',
      phoneNumber: String(user?.phoneNumber ?? '').replace(/\D/g, '') || '3000000000',
    },
  };
}

function isUniqueViolation(err) {
  return err?.code === 'P2002';
}

export async function fulfilPaidRegistration(transaction, stored, now = new Date()) {
  const { id: wompiId, reference, amount_in_cents } = transaction;
  const m = stored.metadata;
  const paid = Math.round(Number(amount_in_cents)) / 100;

  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      if (await eventRegRepo.findPaymentByWompiId(tx, wompiId)) return { alreadyProcessed: true };

      const locked = await eventRegRepo.lockEvent(tx, m.eventId);
      const registration = await eventRegRepo.lockRegistration(tx, m.registrationId);
      // Paid, but there is no row to attach the payment to (e.g. the user was deleted).
      if (!registration) throw eventError(EVENT_ERROR.REGISTRATION_MISSING, `Registration ${m.registrationId} not found`);
      // The twin delivery (webhook vs confirm-payment) may have committed while we waited.
      if (await eventRegRepo.findPaymentByWompiId(tx, wompiId)) return { alreadyProcessed: true };

      let flag = null;
      let refundStatus = 'None';
      let newlyConfirmed = false;
      let current = registration;

      if (locked?.status === 'Canceled') {
        flag = 'EVENT_CANCELED'; refundStatus = 'Pending';
      } else if (registration.status === 'Confirmed') {
        flag = 'DUPLICATE'; refundStatus = 'Pending';
      } else if (registration.status === 'Canceled') {
        flag = 'REGISTRATION_CANCELED'; refundStatus = 'Pending';
      } else {
        const intentEarlyBird = m.earlyBird === true;
        if (intentEarlyBird) {
          const holdFresh =
            registration.intentReference === reference &&
            registration.reservedAt &&
            now.getTime() - new Date(registration.reservedAt).getTime() <= EVENT_HOLD_MINUTES * 60_000;
          if (!holdFresh && locked?.early_bird_slots) {
            const usage = await eventRegRepo.countEarlyBirdUsage(tx, {
              eventId: m.eventId, excludeUserId: registration.userId, holdMinutes: EVENT_HOLD_MINUTES,
            });
            if (usage >= locked.early_bird_slots) flag = 'EARLY_BIRD_OVERRUN';
          }
        }
        current = await tx.eventRegistration.update({
          where: { id: registration.id },
          data: {
            status: 'Confirmed',
            earlyBird: intentEarlyBird,
            listPrice: Number(m.listPrice),
            discountAmount: Number(m.discountAmount),
            finalAmount: Number(m.finalAmount),
            intentReference: reference,
            reservedAt: null,
            confirmedAt: now,
          },
        });
        newlyConfirmed = true;
      }

      const payment = await tx.eventPayment.create({
        data: {
          registrationId: registration.id,
          wompiId,
          reference,
          amount: paid,
          originalAmount: Number(m.listPrice),
          discountAmount: Number(m.discountAmount),
          flag,
          refundStatus,
        },
      });
      await tx.paymentIntent.update({ where: { reference }, data: { consumedAt: now } });
      return { registration: current, payment, flag, newlyConfirmed };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { alreadyProcessed: true };
    if (err.code === EVENT_ERROR.REGISTRATION_MISSING) {
      // Wompi charged and nothing was recorded: support must find and refund it.
      Sentry.withScope((scope) => {
        scope.setTag('service', 'events');
        scope.setTag('issue_type', 'event_payment_registration_missing');
        scope.setLevel('fatal');
        scope.setContext('event_payment', { wompiId, reference, registrationId: m.registrationId });
        Sentry.captureException(err);
      });
    }
    throw err;
  }

  if (outcome.alreadyProcessed) return outcome;

  if (outcome.flag) {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'events');
      scope.setTag('issue_type', `event_payment_${outcome.flag.toLowerCase()}`);
      scope.setLevel(outcome.flag === 'EARLY_BIRD_OVERRUN' ? 'info' : 'warning');
      scope.setContext('event_payment', { wompiId, reference, registrationId: m.registrationId, flag: outcome.flag });
      Sentry.captureMessage(`[events] Paid registration flagged ${outcome.flag}`);
    });
  }
  if (outcome.newlyConfirmed) {
    fireConfirmation(eventRepo.findById(m.eventId), outcome.registration, outcome.registration.userId);
  }
  return outcome;
}

export async function cancelRegistration({ slug, userId, refundMethod = null, refundMethodDetails = null, now = new Date() }) {
  const event = await loadOpenableEvent(slug);

  return prisma.$transaction(async (tx) => {
    const locked = await eventRegRepo.lockEvent(tx, event.id);
    assertOpen(locked, now);
    const registration = await eventRegRepo.findRegistration(tx, event.id, userId);
    if (!registration || registration.status !== 'Confirmed') throw eventError(EVENT_ERROR.NOT_REGISTERED);

    const refundable = Number(registration.finalAmount) > 0 && isRefundableAt(locked.starts_at, now);
    if (refundable && (!refundMethod || !refundMethodDetails)) throw eventError(EVENT_ERROR.REFUND_DETAILS_REQUIRED);

    const updated = await tx.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: 'Canceled', canceledAt: now, canceledBy: 'user',
        // Not refundable → keep whatever is stored: an earlier cancellation of
        // this same row may still have a refund Pending that needs those details.
        ...(refundable ? { refundMethod, refundMethodDetails } : {}),
      },
    });
    if (refundable) {
      // Every payment not yet in the refund flow (incl. EARLY_BIRD_OVERRUN);
      // DUPLICATE / *_CANCELED payments are already Pending.
      await tx.eventPayment.updateMany({
        where: { registrationId: registration.id, refundStatus: 'None' },
        data: { refundStatus: 'Pending' },
      });
    }
    return { registration: updated, refundable };
  });
}
