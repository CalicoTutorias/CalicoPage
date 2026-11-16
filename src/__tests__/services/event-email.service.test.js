/** @jest-environment node */

jest.mock('@/lib/services/email.service', () => ({
  EVENT_EMAIL: {
    REGISTRATION_CONFIRMED: 'EVENT_REGISTRATION_CONFIRMED',
    REMINDER: 'EVENT_REMINDER',
    CANCELED: 'EVENT_CANCELED',
    SURVEY_REMINDER: 'EVENT_SURVEY_REMINDER',
    DETAILS_UPDATED: 'EVENT_DETAILS_UPDATED',
  },
  isEventEmailConfigured: jest.fn(),
  sendEventEmail: jest.fn(),
}));

import { isEventEmailConfigured, sendEventEmail } from '@/lib/services/email.service';
import {
  buildEventEmailParams,
  sendRegistrationConfirmed,
  sendEventReminderTo,
  sendEventDetailsTo,
  sendEventCanceledTo,
  sendSurveyReminderTo,
} from '@/lib/services/event-email.service';

const user = { email: 'ana@uniandes.edu.co', name: 'Ana Maria Perez' };
const baseEvent = {
  id: 'ev1',
  slug: 'repaso-calculo',
  title: 'Repaso de Cálculo',
  startsAt: new Date('2026-11-10T23:00:00Z'),
  endsAt: new Date('2026-11-11T01:00:00Z'),
  modality: 'Virtual',
  meetingUrl: 'https://meet.google.com/abc',
  location: null,
  cancelReason: 'Tutor enfermo',
  tutors: [{ tutor: { name: 'Juan' } }, { tutor: { name: 'Sara' } }],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://calico.test';
  sendEventEmail.mockResolvedValue({ messageId: 'm1' });
});

describe('buildEventEmailParams', () => {
  it('returns the documented keys for a virtual event', () => {
    const p = buildEventEmailParams(baseEvent, user);
    expect(Object.keys(p).sort()).toEqual(
      ['NAME', 'EVENT_TITLE', 'EVENT_DATE', 'EVENT_TIME', 'TUTORS', 'MEETING_URL', 'LOCATION', 'EVENT_URL'].sort()
    );
    expect(p.LOCATION).toBe('');
    expect(p.MEETING_URL).toBe('https://meet.google.com/abc');
    expect(p.NAME).toBe('Ana');
    expect(p.EVENT_URL).toBe('https://calico.test/eventos/repaso-calculo');
  });

  it('blanks MEETING_URL for in-person events', () => {
    const p = buildEventEmailParams({ ...baseEvent, modality: 'InPerson', location: 'ML 101' }, user);
    expect(p.MEETING_URL).toBe('');
    expect(p.LOCATION).toBe('ML 101');
  });
});

describe('sendRegistrationConfirmed', () => {
  it('adds AMOUNT and an .ics attachment', async () => {
    isEventEmailConfigured.mockReturnValue(true);
    await sendRegistrationConfirmed({ event: baseEvent, registration: { id: 'r1', finalAmount: 18000 }, user });
    const [key, arg] = sendEventEmail.mock.calls[0];
    expect(key).toBe('EVENT_REGISTRATION_CONFIRMED');
    expect(arg.params.AMOUNT).toMatch(/^\$18\.000 COP$/);
    expect(arg.attachment[0].name).toBe('evento.ics');
    expect(Buffer.from(arg.attachment[0].content, 'base64').toString('utf8')).toContain('BEGIN:VEVENT');
  });

  it('uses an empty AMOUNT for free registrations', async () => {
    isEventEmailConfigured.mockReturnValue(true);
    await sendRegistrationConfirmed({ event: baseEvent, registration: { id: 'r1', finalAmount: 0 }, user });
    expect(sendEventEmail.mock.calls[0][1].params.AMOUNT).toBe('');
  });

  it('skips with a warning when the template is not configured', async () => {
    isEventEmailConfigured.mockReturnValue(false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await sendRegistrationConfirmed({ event: baseEvent, registration: { id: 'r1', finalAmount: 0 }, user });
    expect(res).toEqual({ skipped: true });
    expect(sendEventEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('other senders', () => {
  it('sendEventReminderTo sends the base params', async () => {
    await sendEventReminderTo({ event: baseEvent, user });
    expect(sendEventEmail.mock.calls[0][0]).toBe('EVENT_REMINDER');
    expect(sendEventEmail.mock.calls[0][1].params.EVENT_TITLE).toBe('Repaso de Cálculo');
  });

  it('sendSurveyReminderTo builds SURVEY_URL', async () => {
    await sendSurveyReminderTo({ event: baseEvent, user });
    expect(sendEventEmail.mock.calls[0][1].params.SURVEY_URL).toBe(
      'https://calico.test/eventos/repaso-calculo?encuesta=1'
    );
  });

  it('sendEventCanceledTo sets reason, amount and events URL', async () => {
    await sendEventCanceledTo({ event: baseEvent, user, amountPaid: 0 });
    let p = sendEventEmail.mock.calls[0][1].params;
    expect(p.CANCEL_REASON).toBe('Tutor enfermo');
    expect(p.AMOUNT).toBe('');
    expect(p.EVENTS_URL).toBe('https://calico.test/eventos');
    await sendEventCanceledTo({ event: baseEvent, user, amountPaid: 18000 });
    p = sendEventEmail.mock.calls[1][1].params;
    expect(p.AMOUNT).toMatch(/18\.000 COP/);
  });
});

describe('time to be confirmed and WhatsApp group', () => {
  const tbcEvent = { ...baseEvent, timeTbc: true, durationHours: 2, meetingUrl: null, whatsappUrl: 'https://chat.whatsapp.com/abc' };

  it('puts the WhatsApp group where the meeting link goes and says the time is pending', () => {
    const p = buildEventEmailParams(tbcEvent, user);
    expect(p.MEETING_URL).toBe('https://chat.whatsapp.com/abc');
    expect(p.EVENT_TIME).toBe('Por confirmar');
  });

  it('prefers the meeting link over the WhatsApp group', () => {
    const p = buildEventEmailParams({ ...baseEvent, whatsappUrl: 'https://chat.whatsapp.com/abc' }, user);
    expect(p.MEETING_URL).toBe('https://meet.google.com/abc');
  });

  it('does not attach an .ics until the time is confirmed', async () => {
    isEventEmailConfigured.mockReturnValue(true);
    await sendRegistrationConfirmed({ event: tbcEvent, registration: { id: 'r1', finalAmount: 0 }, user });
    expect(sendEventEmail.mock.calls[0][1]).not.toHaveProperty('attachment');
  });

  it('sendEventDetailsTo falls back to the reminder template until its own one is configured', async () => {
    isEventEmailConfigured.mockReturnValue(false);
    await sendEventDetailsTo({ event: baseEvent, user });
    const [key, arg] = sendEventEmail.mock.calls[0];
    expect(key).toBe('EVENT_REMINDER');
    expect(arg.params.MEETING_URL).toBe('https://meet.google.com/abc');
    expect(arg.attachment[0].name).toBe('evento.ics');
  });

  it('sendEventDetailsTo uses EVENT_DETAILS_UPDATED with LINK_KIND and TIME_PENDING once configured', async () => {
    isEventEmailConfigured.mockReturnValue(true);
    await sendEventDetailsTo({ event: tbcEvent, user });
    const [key, arg] = sendEventEmail.mock.calls[0];
    expect(key).toBe('EVENT_DETAILS_UPDATED');
    expect(arg.params).toMatchObject({ LINK_KIND: 'whatsapp', TIME_PENDING: '1', EVENT_TIME: 'Por confirmar' });
    expect(arg).not.toHaveProperty('attachment');

    sendEventEmail.mockClear();
    await sendEventDetailsTo({ event: baseEvent, user });
    expect(sendEventEmail.mock.calls[0][1].params).toMatchObject({ LINK_KIND: 'meet', TIME_PENDING: '' });
    expect(sendEventEmail.mock.calls[0][1].attachment[0].name).toBe('evento.ics');
  });
});
