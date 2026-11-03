/** @jest-environment node */

const insert = jest.fn();
const update = jest.fn();
const get = jest.fn();
const patch = jest.fn();
const del = jest.fn();

jest.mock('@googleapis/calendar', () => ({
  calendar: jest.fn(() => ({ events: { insert, update, get, patch, delete: del } })),
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

const session = {
  summary: 'Tutoría',
  startDateTime: new Date('2026-11-10T23:00:00Z'),
  endDateTime: new Date('2026-11-11T00:00:00Z'),
  attendees: ['student@uni.edu'],
  tutorEmail: 'tutor@uni.edu',
  tutorId: 't1',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  insert.mockResolvedValue({ data: { id: 'ev1' } });
  get.mockResolvedValue({ data: { id: 'ev1' } });
  update.mockResolvedValue({ data: { id: 'ev1' } });
  patch.mockResolvedValue({ data: { id: 'ev1' } });
  del.mockResolvedValue({});
});

afterEach(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
});

describe('tutoring session events send Google invitations', () => {
  it('creation emails student and tutor (sendUpdates: all)', async () => {
    const svc = await load();
    await svc.createTutoringSessionEvent(session);
    const arg = insert.mock.calls[0][0];
    expect(arg.sendUpdates).toBe('all');
    expect(arg.requestBody.attendees.map((a) => a.email).sort()).toEqual(['student@uni.edu', 'tutor@uni.edu']);
  });

  it('no-Meet fallback creation also uses sendUpdates: all', async () => {
    insert.mockRejectedValueOnce(new Error('meet failed')).mockResolvedValueOnce({ data: { id: 'ev1' } });
    const svc = await load();
    await svc.createTutoringSessionEvent(session);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0].sendUpdates).toBe('all');
    expect(insert.mock.calls[1][0].requestBody.conferenceData).toBeUndefined();
  });

  it('update, cancel and delete notify attendees', async () => {
    const svc = await load();
    await svc.updateTutoringSessionEvent('ev1', { summary: 'x' });
    await svc.cancelTutoringSessionEvent('ev1');
    await svc.deleteTutoringSessionEvent('ev1');
    expect(update.mock.calls[0][0].sendUpdates).toBe('all');
    expect(patch.mock.calls[0][0].sendUpdates).toBe('all');
    expect(del.mock.calls[0][0].sendUpdates).toBe('all');
  });

  it('event-feature meetings keep sendUpdates: none', async () => {
    const svc = await load();
    await svc.createEventMeeting({
      title: 'Repaso',
      description: 'd',
      startsAt: new Date('2026-11-10T23:00:00Z'),
      endsAt: new Date('2026-11-11T01:00:00Z'),
    });
    expect(insert.mock.calls[0][0].sendUpdates).toBe('none');
  });
});
