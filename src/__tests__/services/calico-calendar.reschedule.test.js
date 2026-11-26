/**
 * @jest-environment node
 *
 * rescheduleTutoringSessionEvent — the admin reschedule moves the event and,
 * for back-to-back hours, puts the other event's Meet on it.
 */

const get = jest.fn();
const patch = jest.fn();

jest.mock('@googleapis/calendar', () => ({
  calendar: jest.fn(() => ({ events: { get, patch } })),
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
}));

jest.mock('@sentry/nextjs', () => ({
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

async function load() {
  jest.resetModules();
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_ADMIN_REFRESH_TOKEN = 'refresh-token';
  process.env.CALICO_CALENDAR_ID = 'calico-calendar';
  return import('@/lib/services/calico-calendar.service');
}

const START = new Date('2026-11-27T21:00:00Z');
const END = new Date('2026-11-27T22:00:00Z');
const CONFERENCE = {
  conferenceId: 'aea-qfbo-oyx',
  conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
  entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/aea-qfbo-oyx' }],
  createRequest: { requestId: 'old', status: { statusCode: 'success' } },
};

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => console.error.mockRestore());

it('moves the event to the new time and tells everyone', async () => {
  patch.mockResolvedValue({ data: { id: 'ev1', hangoutLink: 'https://meet.google.com/own' } });
  const svc = await load();

  const res = await svc.rescheduleTutoringSessionEvent('ev1', { startDateTime: START, endDateTime: END });

  expect(get).not.toHaveBeenCalled();
  expect(patch).toHaveBeenCalledWith({
    calendarId: 'calico-calendar',
    eventId: 'ev1',
    sendUpdates: 'all',
    requestBody: {
      start: { dateTime: START.toISOString(), timeZone: 'America/Bogota' },
      end: { dateTime: END.toISOString(), timeZone: 'America/Bogota' },
    },
  });
  expect(res).toEqual({ success: true, eventId: 'ev1', meetLink: 'https://meet.google.com/own' });
});

it("copies the other event's conference (without its create request) to share its Meet", async () => {
  get.mockResolvedValue({ data: { id: 'ev2', conferenceData: CONFERENCE } });
  patch.mockResolvedValue({ data: { id: 'ev1', hangoutLink: 'https://meet.google.com/aea-qfbo-oyx' } });
  const svc = await load();

  const res = await svc.rescheduleTutoringSessionEvent('ev1', {
    startDateTime: START, endDateTime: END, conferenceFromEventId: 'ev2',
  });

  expect(get).toHaveBeenCalledWith({ calendarId: 'calico-calendar', eventId: 'ev2' });
  const call = patch.mock.calls[0][0];
  expect(call.conferenceDataVersion).toBe(1);
  expect(call.requestBody.conferenceData).toEqual({
    conferenceId: CONFERENCE.conferenceId,
    conferenceSolution: CONFERENCE.conferenceSolution,
    entryPoints: CONFERENCE.entryPoints,
  });
  expect(res.meetLink).toBe('https://meet.google.com/aea-qfbo-oyx');
});

it('fails without touching the event when the other one has no Meet', async () => {
  get.mockResolvedValue({ data: { id: 'ev2' } });
  const svc = await load();

  await expect(svc.rescheduleTutoringSessionEvent('ev1', {
    startDateTime: START, endDateTime: END, conferenceFromEventId: 'ev2',
  })).rejects.toMatchObject({ code: 'CALENDAR_CREATE_FAILED' });
  expect(patch).not.toHaveBeenCalled();
});
