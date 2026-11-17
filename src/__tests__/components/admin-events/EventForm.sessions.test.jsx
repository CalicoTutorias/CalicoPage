/**
 * EventForm — repaso dividido en varios días (pregunta sí/no, cuántos días,
 * fecha y horas de cada uno, hora por confirmar) y links de Meet / WhatsApp
 * independientes (uno, otro o ambos).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventForm from '@/app/home/admin/eventos/_components/EventForm';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { AdminService } from '@/app/services/core/AdminService';
import { TutorSearchService } from '@/app/services/utils/TutorSearchService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { create: jest.fn(), update: jest.fn(), uploadCover: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});
jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = { listApprovedTutors: jest.fn() };
  return { __esModule: true, AdminService, default: AdminService };
});
jest.mock('@/app/services/utils/TutorSearchService', () => ({
  TutorSearchService: { getMaterias: jest.fn() },
}));

const form = en.admin.events.form;
const errors = form.errors;
const TUTOR = { id: '11111111-1111-4111-8111-111111111111', name: 'Ana Tutor', email: 'ana@calico.test' };
const ZOOM = 'https://zoom.us/j/123';
const WA = 'https://chat.whatsapp.com/abc';

const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: form.actions.create }));
const payload = () => AdminEventService.create.mock.calls[0][0];

function setup(event = null) {
  render(<EventForm event={event} onSaved={jest.fn()} onCancel={jest.fn()} />);
}

/** Everything but the dates and the links. */
async function fillBasics() {
  change('Title', 'Repaso parcial 2 Cálculo');
  change('Description', 'Repasamos los temas del parcial.');
  change('Price (COP)', '20000');
  fireEvent.click(await screen.findByRole('button', { name: 'Add Ana Tutor' }));
}

function chooseDays(count) {
  fireEvent.click(screen.getByLabelText(form.multiSession.yes));
  change(form.fields.sessionCount, String(count));
}

function fillDay(n, date, start, end) {
  change(`Date of day ${n}`, date);
  change(`Starts (day ${n})`, start);
  change(`Ends (day ${n})`, end);
}

beforeEach(() => {
  jest.clearAllMocks();
  AdminService.listApprovedTutors.mockResolvedValue({ ok: true, success: true, tutors: [TUTOR], total: 1 });
  TutorSearchService.getMaterias.mockResolvedValue([]);
  AdminEventService.create.mockResolvedValue({ success: true, event: { id: 'ev-1', slug: 'repaso-ab12' } });
});

describe('EventForm — repaso split over several days', () => {
  it('asks whether it is split, defaulting to a single session with the usual start / end fields', () => {
    setup();
    expect(screen.getByText(form.fields.multiSession)).toBeInTheDocument();
    expect(screen.getByLabelText(form.multiSession.no)).toBeChecked();
    expect(screen.getByLabelText('Starts')).toBeInTheDocument();
    expect(screen.queryByLabelText(form.fields.sessionCount)).toBeNull();
  });

  it('"yes" asks how many days and shows one row per day (2 by default, up to 10)', () => {
    setup();
    fireEvent.click(screen.getByLabelText(form.multiSession.yes));

    const count = screen.getByLabelText(form.fields.sessionCount);
    expect(count).toHaveValue('2');
    expect(Array.from(count.options).map((o) => o.value)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(screen.getByLabelText('Date of day 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date of day 3')).toBeNull();
    expect(screen.queryByLabelText('Starts')).toBeNull();

    change(form.fields.sessionCount, '3');
    expect(screen.getByLabelText('Date of day 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Starts (day 3)')).toHaveAttribute('type', 'time');
  });

  it('keeps what was typed in the first days when the number of days changes', () => {
    setup();
    chooseDays(3);
    fillDay(1, '2026-10-18', '18:00', '20:00');
    change(form.fields.sessionCount, '2');
    expect(screen.getByLabelText('Date of day 1')).toHaveValue('2026-10-18');
    expect(screen.getByLabelText('Starts (day 1)')).toHaveValue('18:00');
  });

  it('sends every day as a UTC session and the repaso from the first start to the last end', async () => {
    setup();
    await fillBasics();
    change('Meeting link', ZOOM);
    chooseDays(2);
    fillDay(1, '2026-10-18', '18:00', '20:00');
    fillDay(2, '2026-10-20', '15:00', '17:00');

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({
      timeTbc: false,
      durationHours: null,
      sessions: [
        { startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z', durationHours: null },
        { startsAt: '2026-10-20T20:00:00.000Z', endsAt: '2026-10-20T22:00:00.000Z', durationHours: null },
      ],
      startsAt: '2026-10-18T23:00:00.000Z',
      endsAt: '2026-10-20T22:00:00.000Z',
    });
  });

  it('days typed out of order are sent sorted', async () => {
    setup();
    await fillBasics();
    change('Meeting link', ZOOM);
    chooseDays(2);
    fillDay(1, '2026-10-20', '15:00', '17:00');
    fillDay(2, '2026-10-18', '18:00', '20:00');

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload().sessions.map((s) => s.startsAt)).toEqual(['2026-10-18T23:00:00.000Z', '2026-10-20T20:00:00.000Z']);
    expect(payload().startsAt).toBe('2026-10-18T23:00:00.000Z');
  });

  it('asks whether the time of the sessions is to be confirmed; then each day takes a date and its hours', async () => {
    setup();
    await fillBasics();
    change('Meeting link', ZOOM);
    chooseDays(2);
    fireEvent.click(screen.getByLabelText(form.fields.timeTbcSessions));

    expect(screen.queryByLabelText('Starts (day 1)')).toBeNull();
    expect(screen.getByText(form.hints.sessionsTbc)).toBeInTheDocument();
    change('Date of day 1', '2026-10-19');
    change('Duration in hours (day 1)', '2');
    change('Date of day 2', '2026-10-21');
    change('Duration in hours (day 2)', '1.5');

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({
      timeTbc: true,
      durationHours: null,
      sessions: [
        { startsAt: '2026-10-19T05:00:00.000Z', endsAt: '2026-10-20T04:59:00.000Z', durationHours: 2 },
        { startsAt: '2026-10-21T05:00:00.000Z', endsAt: '2026-10-22T04:59:00.000Z', durationHours: 1.5 },
      ],
    });
  });

  it.each([
    ['a day without its hours', (n) => { change(`Date of day ${n}`, '2026-10-20'); }, `Day 2: ${errors.SESSION_INVALID_DATES}`],
    ['two sessions on the same day', (n) => fillDay(n, '2026-10-18', '21:00', '22:00'), `Day 2: ${errors.SESSIONS_SAME_DAY}`],
    ['a day that ends before it starts', (n) => fillDay(n, '2026-10-20', '17:00', '15:00'), `Day 2: ${errors.SESSION_ENDS_BEFORE_START}`],
  ])('%s shows the day and does not create', async (_label, fillSecond, message) => {
    setup();
    await fillBasics();
    change('Meeting link', ZOOM);
    chooseDays(2);
    fillDay(1, '2026-10-18', '18:00', '20:00');
    fillSecond(2);

    submit();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('a TBC day without its duration says which day', async () => {
    setup();
    await fillBasics();
    change('Meeting link', ZOOM);
    chooseDays(2);
    fireEvent.click(screen.getByLabelText(form.fields.timeTbcSessions));
    change('Date of day 1', '2026-10-19');
    change('Duration in hours (day 1)', '2');
    change('Date of day 2', '2026-10-21');

    submit();

    expect(await screen.findByText(`Day 2: ${errors.SESSION_DURATION_INVALID}`)).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('answering "no" again sends a single session (sessions: null)', async () => {
    setup();
    await fillBasics();
    change('Meeting link', ZOOM);
    chooseDays(2);
    fireEvent.click(screen.getByLabelText(form.multiSession.no));
    change('Starts', '2026-10-18T18:00');
    change('Ends', '2026-10-18T20:00');

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ sessions: null, startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z' });
  });

  it('editing a multi-day repaso loads its days in Colombia time', () => {
    setup({
      id: 'ev-9', slug: 'r', title: 'Repaso', description: 'd', status: 'Draft', modality: 'Virtual',
      autoMeet: false, meetingUrl: ZOOM, whatsappUrl: null, price: 0, isListed: true, tutors: [TUTOR],
      timeTbc: false,
      startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-20T22:00:00.000Z',
      sessions: [
        { endsAt: '2026-10-19T01:00:00.000Z', startsAt: '2026-10-18T23:00:00.000Z', durationHours: null },
        { endsAt: '2026-10-20T22:00:00.000Z', startsAt: '2026-10-20T20:00:00.000Z', durationHours: null },
      ],
      stats: { confirmed: 0, pending: 0, canceled: 0, responses: 0 },
    });
    expect(screen.getByLabelText(form.multiSession.yes)).toBeChecked();
    expect(screen.getByLabelText(form.fields.sessionCount)).toHaveValue('2');
    expect(screen.getByLabelText('Date of day 1')).toHaveValue('2026-10-18');
    expect(screen.getByLabelText('Starts (day 1)')).toHaveValue('18:00');
    expect(screen.getByLabelText('Ends (day 1)')).toHaveValue('20:00');
    expect(screen.getByLabelText('Date of day 2')).toHaveValue('2026-10-20');
    expect(screen.getByLabelText('Starts (day 2)')).toHaveValue('15:00');
  });
});

describe('EventForm — Meet and WhatsApp links', () => {
  async function fillSingle() {
    await fillBasics();
    change('Starts', '2026-10-18T18:00');
    change('Ends', '2026-10-18T20:00');
  }

  it('sends both the pasted meeting link and the WhatsApp group', async () => {
    setup();
    await fillSingle();
    change('Meeting link', ZOOM);
    fireEvent.click(screen.getByLabelText(form.fields.addWhatsapp));
    change(form.fields.whatsappUrl, WA);

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ autoMeet: false, meetingUrl: ZOOM, whatsappUrl: WA });
  });

  it('sends the automatic Meet together with the WhatsApp group', async () => {
    setup();
    await fillSingle();
    fireEvent.click(screen.getByLabelText(form.modality.autoMeet));
    fireEvent.click(screen.getByLabelText(form.fields.addWhatsapp));
    change(form.fields.whatsappUrl, WA);

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ autoMeet: true, meetingUrl: null, whatsappUrl: WA });
  });

  it('only the WhatsApp group: "no meeting" plus the group', async () => {
    setup();
    await fillSingle();
    fireEvent.click(screen.getByLabelText(form.modality.noMeeting));
    expect(screen.queryByLabelText('Meeting link')).toBeNull();
    fireEvent.click(screen.getByLabelText(form.fields.addWhatsapp));
    change(form.fields.whatsappUrl, WA);

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ autoMeet: false, meetingUrl: null, whatsappUrl: WA });
  });

  it('only the meeting link: no WhatsApp group is sent', async () => {
    setup();
    await fillSingle();
    change('Meeting link', ZOOM);
    expect(screen.queryByLabelText(form.fields.whatsappUrl)).toBeNull();

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ meetingUrl: ZOOM, whatsappUrl: null });
  });

  it('"no meeting" without the WhatsApp group asks for at least one link', async () => {
    setup();
    await fillSingle();
    fireEvent.click(screen.getByLabelText(form.modality.noMeeting));

    submit();

    expect(await screen.findByText(errors.MEETING_URL_REQUIRED)).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('the WhatsApp option checked but empty asks for its link', async () => {
    setup();
    await fillSingle();
    change('Meeting link', ZOOM);
    fireEvent.click(screen.getByLabelText(form.fields.addWhatsapp));

    submit();

    expect(await screen.findByText(errors.WHATSAPP_URL_EMPTY)).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('editing a repaso with both links loads both', () => {
    setup({
      id: 'ev-9', slug: 'r', title: 'Repaso', description: 'd', status: 'Draft', modality: 'Virtual',
      autoMeet: false, meetingUrl: ZOOM, whatsappUrl: WA, price: 0, isListed: true, tutors: [TUTOR],
      startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z',
      stats: { confirmed: 0, pending: 0, canceled: 0, responses: 0 },
    });
    expect(screen.getByLabelText(form.modality.pasteLink)).toBeChecked();
    expect(screen.getByLabelText('Meeting link')).toHaveValue(ZOOM);
    expect(screen.getByLabelText(form.fields.addWhatsapp)).toBeChecked();
    expect(screen.getByLabelText(form.fields.whatsappUrl)).toHaveValue(WA);
  });

  it('editing a WhatsApp-only repaso loads "no meeting" with the group', () => {
    setup({
      id: 'ev-9', slug: 'r', title: 'Repaso', description: 'd', status: 'Draft', modality: 'Virtual',
      autoMeet: false, meetingUrl: null, whatsappUrl: WA, price: 0, isListed: true, tutors: [TUTOR],
      startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z',
      stats: { confirmed: 0, pending: 0, canceled: 0, responses: 0 },
    });
    expect(screen.getByLabelText(form.modality.noMeeting)).toBeChecked();
    expect(screen.getByLabelText(form.fields.whatsappUrl)).toHaveValue(WA);
  });

  it('a published automatic Meet stays locked, but the WhatsApp group can still be added', () => {
    setup({
      id: 'ev-9', slug: 'r', title: 'Repaso', description: 'd', status: 'Published', modality: 'Virtual',
      autoMeet: true, meetingUrl: 'https://meet.google.com/abc', whatsappUrl: null, price: 0, isListed: true, tutors: [TUTOR],
      startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z',
      stats: { confirmed: 0, pending: 0, canceled: 0, responses: 0 },
    });
    expect(screen.getByLabelText(form.modality.noMeeting)).toBeDisabled();
    expect(screen.getByLabelText(form.fields.addWhatsapp)).toBeEnabled();
  });
});
