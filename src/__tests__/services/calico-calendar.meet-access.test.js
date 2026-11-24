/** @jest-environment node */

const insert = jest.fn();
const request = jest.fn();

jest.mock('@googleapis/calendar', () => ({
  calendar: jest.fn(() => ({ events: { insert } })),
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn(), request })),
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

const meetEvent = {
  data: {
    id: 'ev1',
    conferenceData: {
      conferenceId: 'abc-defg-hij',
      entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
    },
  },
};

const session = {
  summary: 'Tutoría',
  startDateTime: new Date('2026-11-10T23:00:00Z'),
  endDateTime: new Date('2026-11-11T00:00:00Z'),
  attendees: ['student@uni.edu'],
  tutorEmail: 'tutor@uni.edu',
  tutorId: 't1',
};

const eventInput = {
  title: 'Repaso',
  description: 'desc',
  startsAt: new Date('2026-11-10T23:00:00Z'),
  endsAt: new Date('2026-11-11T01:00:00Z'),
};

function expectMeetOpened() {
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][0]).toEqual({ url: 'https://meet.googleapis.com/v2/spaces/abc-defg-hij' });
  expect(request.mock.calls[1][0]).toEqual({
    url: 'https://meet.googleapis.com/v2/spaces/SPACE123?updateMask=config.accessType',
    method: 'PATCH',
    data: { config: { accessType: 'OPEN' } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  insert.mockResolvedValue(meetEvent);
  request.mockImplementation(({ method }) =>
    Promise.resolve({ data: method === 'PATCH' ? {} : { name: 'spaces/SPACE123' } }),
  );
});

afterEach(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
});

describe('tutoring session Meet links are opened to anyone with the link', () => {
  it('tutoring session Meet gets accessType OPEN', async () => {
    const svc = await load();
    const res = await svc.createTutoringSessionEvent(session);
    expect(res.meetLink).toBe('https://meet.google.com/abc-defg-hij');
    expectMeetOpened();
  });

  it('paid group event Meet keeps the default access (people are admitted one by one)', async () => {
    const svc = await load();
    const res = await svc.createEventMeeting(eventInput);
    expect(res.meetLink).toBe('https://meet.google.com/abc-defg-hij');
    expect(request).not.toHaveBeenCalled();
  });

  it('a Meet API failure (e.g. missing scope) does not fail the booking', async () => {
    request.mockRejectedValue(Object.assign(new Error('insufficient scopes'), { code: 403 }));
    const svc = await load();
    const res = await svc.createTutoringSessionEvent(session);
    expect(res.success).toBe(true);
    expect(res.meetLink).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('skips the Meet API when the event has no conference', async () => {
    insert.mockResolvedValue({ data: { id: 'ev1' } });
    const svc = await load();
    await svc.createTutoringSessionEvent(session);
    expect(request).not.toHaveBeenCalled();
  });
});
