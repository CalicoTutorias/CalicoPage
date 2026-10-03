/**
 * Event emails: turns an event + user (+ registration) into the Brevo params
 * documented in docs/emails/event-*.html and sends them. Callers fire these
 * AFTER their transaction commits; a failed email never undoes a registration.
 */

import { EVENT_EMAIL, isEventEmailConfigured, sendEventEmail } from './email.service';
import { buildEventIcs } from '../utils/ics';
import { formatEventDate, formatEventTimeRange, joinNames } from '../utils/event-format';

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export function eventPublicUrl(slug) {
  return `${appUrl()}/eventos/${slug}`;
}

function formatCop(amount) {
  return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(amount))} COP`;
}

function firstName(user) {
  return String(user?.name || '').trim().split(/\s+/)[0] || '';
}

export function buildEventEmailParams(event, user) {
  const tutorNames = (event.tutors || []).map((t) => t.tutor?.name ?? t.name).filter(Boolean);
  return {
    NAME: firstName(user),
    EVENT_TITLE: event.title,
    EVENT_DATE: formatEventDate(event.startsAt),
    EVENT_TIME: formatEventTimeRange(event.startsAt, event.endsAt),
    TUTORS: joinNames(tutorNames),
    MEETING_URL: event.modality === 'Virtual' ? event.meetingUrl || '' : '',
    LOCATION: event.modality === 'InPerson' ? event.location || '' : '',
    EVENT_URL: eventPublicUrl(event.slug),
  };
}

export async function sendRegistrationConfirmed({ event, registration, user }) {
  if (!isEventEmailConfigured(EVENT_EMAIL.REGISTRATION_CONFIRMED)) {
    console.warn(`[event-email] Confirmation template not configured; skipped for registration ${registration.id}`);
    return { skipped: true };
  }
  const params = buildEventEmailParams(event, user);
  const amount = Number(registration.finalAmount);
  const ics = buildEventIcs({
    uid: `${event.id}@calico-tutorias.com`,
    title: event.title,
    description: params.EVENT_URL,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: params.MEETING_URL || params.LOCATION || undefined,
    url: params.EVENT_URL,
  });
  return sendEventEmail(EVENT_EMAIL.REGISTRATION_CONFIRMED, {
    to: { email: user.email, name: user.name },
    params: { ...params, AMOUNT: amount > 0 ? formatCop(amount) : '' },
    attachment: [{ name: 'evento.ics', content: Buffer.from(ics, 'utf8').toString('base64') }],
  });
}

export async function sendEventReminderTo({ event, user }) {
  return sendEventEmail(EVENT_EMAIL.REMINDER, {
    to: { email: user.email, name: user.name },
    params: buildEventEmailParams(event, user),
  });
}

export async function sendEventCanceledTo({ event, user, amountPaid = 0 }) {
  const base = buildEventEmailParams(event, user);
  return sendEventEmail(EVENT_EMAIL.CANCELED, {
    to: { email: user.email, name: user.name },
    params: {
      NAME: base.NAME,
      EVENT_TITLE: base.EVENT_TITLE,
      EVENT_DATE: base.EVENT_DATE,
      EVENT_TIME: base.EVENT_TIME,
      CANCEL_REASON: event.cancelReason || '',
      AMOUNT: Number(amountPaid) > 0 ? formatCop(amountPaid) : '',
      EVENTS_URL: `${appUrl()}/eventos`,
    },
  });
}

export async function sendSurveyReminderTo({ event, user }) {
  const base = buildEventEmailParams(event, user);
  return sendEventEmail(EVENT_EMAIL.SURVEY_REMINDER, {
    to: { email: user.email, name: user.name },
    params: {
      NAME: base.NAME,
      EVENT_TITLE: base.EVENT_TITLE,
      TUTORS: base.TUTORS,
      SURVEY_URL: `${base.EVENT_URL}?encuesta=1`,
    },
  });
}
