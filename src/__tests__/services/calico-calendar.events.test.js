/** @jest-environment node */

const insert = jest.fn();
const patch = jest.fn();

jest.mock('@googleapis/calendar', () => ({
  calendar: jest.fn(() => ({ events: { insert, patch } })),
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

const input = {
  title: 'Repaso',
  description: 'desc',
  startsAt: new Date('2026-11-10T23:00:00Z'),
  endsAt: new Date('2026-11-11T01:00:00Z'),
};

async function load(configured = true) {
  jest.resetModules();
  if (configured) {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_ADMIN_REFRESH_TOKEN = 'refresh-token';
    process.env.CALICO_CALENDAR_ID = 'calico-calendar';
  } else {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_ADMIN_REFRESH_TOKEN;
    delete process.env.CALICO_CALENDAR_ID;
  }
  return import('@/lib/services/calico-calendar.service');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => console.warn.mockRestore());

describe('createEventMeeting', () => {
  it('creates a Meet without attendees and returns the video entry point', async () => {
    insert.mockResolvedValue({
      data: {
        id: 'cal1',
        conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/xyz' }] },
      },
    });
    const svc = await load();
    const res = await svc.createEventMeeting(input);
    expect(res).toEqual({ calendarEventId: 'cal1', meetLink: 'https://meet.google.com/xyz' });
    const arg = insert.mock.calls[0][0];
    expect(arg.conferenceDataVersion).toBe(1);
    expect(arg.sendUpdates).toBe('none');
    expect(arg.requestBody.start.timeZone).toBe('America/Bogota');
    expect(arg.requestBody).not.toHaveProperty('attendees');
  });

  it('rejects with CALENDAR_NOT_CONFIGURED when unconfigured', async () => {
    const svc = await load(false);
    await expect(svc.createEventMeeting(input)).rejects.toMatchObject({ code: 'CALENDAR_NOT_CONFIGURED' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('cancelEventMeeting / updateEventMeeting', () => {
  it('patches status cancelled', async () => {
    patch.mockResolvedValue({ data: {} });
    const svc = await load();
    await svc.cancelEventMeeting('cal1');
    expect(patch.mock.calls[0][0]).toMatchObject({ eventId: 'cal1', requestBody: { status: 'cancelled' } });
  });

  it('patches only the provided fields on update', async () => {
    patch.mockResolvedValue({ data: {} });
    const svc = await load();
    await svc.updateEventMeeting('cal1', { title: 'Nuevo' });
    expect(patch.mock.calls[0][0].requestBody).toEqual({ summary: 'Nuevo' });
  });
});
