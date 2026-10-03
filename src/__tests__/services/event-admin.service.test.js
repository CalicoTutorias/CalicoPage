/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/event-admin.service.js (admin CRUD, publish
 * with Meet, cancel with refunds). Repositories, calendar, email, image and
 * audit are mocked; the event rules, pricing and slug helpers are REAL.
 */

const mockTx = { event: { update: jest.fn() } };

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { $transaction: jest.fn((fn) => fn(mockTx)) },
}));
jest.mock('@/lib/repositories/event.repository', () => ({
  EVENT_INCLUDE: { tutors: true, course: true },
  create: jest.fn(),
  update: jest.fn(),
  updateIfStatus: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  findManyAdmin: jest.fn(),
  adminStatsByEvent: jest.fn(),
  countRegistrations: jest.fn(),
  deleteById: jest.fn(),
  findApprovedTutors: jest.fn(),
  findUsersByIds: jest.fn(),
}));
jest.mock('@/lib/repositories/event-registration.repository', () => ({
  lockEvent: jest.fn(),
  cancelAllForEvent: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: {
    EVENT_CREATE: 'EVENT_CREATE',
    EVENT_UPDATE: 'EVENT_UPDATE',
    EVENT_PUBLISH: 'EVENT_PUBLISH',
    EVENT_CANCEL: 'EVENT_CANCEL',
    EVENT_DELETE: 'EVENT_DELETE',
  },
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/calico-calendar.service', () => ({
  createEventMeeting: jest.fn(),
  updateEventMeeting: jest.fn(),
  cancelEventMeeting: jest.fn(),
}));
jest.mock('@/lib/services/event-email.service', () => ({
  sendEventCanceledTo: jest.fn(),
}));
jest.mock('@/lib/services/event-image.service', () => ({
  generateEventImageUploadUrl: jest.fn(),
  resolveEventImageKey: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const eventRepo = require('@/lib/repositories/event.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');
const audit = require('@/lib/services/admin-audit.service');
const calendar = require('@/lib/services/calico-calendar.service');
const email = require('@/lib/services/event-email.service');
const image = require('@/lib/services/event-image.service');
const service = require('@/lib/services/event-admin.service');

const ADMIN = 'admin-1';
const ID = 'evt-1';
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-03T15:00:00.000Z');
const START = '2026-10-18T23:00:00.000Z';
const END = '2026-10-19T01:00:00.000Z';
const MEET = 'https://meet.google.com/abc-defg-hij';

function draftInput(overrides = {}) {
  return {
    title: 'Repaso Cálculo',
    description: 'Repaso del primer parcial',
    courseId: null,
    tutorIds: [T2, T1],
    startsAt: START,
    endsAt: END,
    modality: 'Virtual',
    autoMeet: false,
    meetingUrl: 'https://zoom.us/j/123',
    location: null,
    price: 15000,
    earlyBirdSlots: null,
    earlyBirdPercent: null,
    isListed: true,
    ...overrides,
  };
}

function tutorRow(id, position, name) {
  return { eventId: ID, tutorId: id, position, tutor: { id, name, email: `${name}@x.co`, profilePictureUrl: null } };
}

function storedEvent(overrides = {}) {
  return {
    id: ID,
    slug: 'repaso-calculo-ab12',
    title: 'Repaso Cálculo',
    description: 'Repaso del primer parcial',
    coverImageUrl: null,
    courseId: null,
    startsAt: new Date(START),
    endsAt: new Date(END),
    modality: 'Virtual',
    autoMeet: false,
    meetingUrl: 'https://zoom.us/j/123',
    location: null,
    googleCalendarEventId: null,
    price: '15000.00', // Prisma Decimal
    earlyBirdSlots: null,
    earlyBirdPercent: null,
    isListed: true,
    status: 'Draft',
    publishedAt: null,
    canceledAt: null,
    cancelReason: null,
    lastReminderAt: null,
    createdById: ADMIN,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    tutors: [tutorRow(T2, 0, 'Ana'), tutorRow(T1, 1, 'Luis')],
    course: null,
    ...overrides,
  };
}

const p2002 = (meta) => Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta });
const p2003 = (meta) => Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003', meta });

beforeEach(() => {
  jest.clearAllMocks();
  // Best-effort failures are logged on purpose; keep the test output clean.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  prisma.$transaction.mockImplementation((fn) => fn(mockTx));
  eventRepo.create.mockImplementation(async ({ data }) => storedEvent(data));
  eventRepo.update.mockImplementation(async (id, data) => storedEvent(data));
  eventRepo.updateIfStatus.mockImplementation(async (id, status, data) => storedEvent(data));
  eventRepo.findApprovedTutors.mockImplementation(async (ids) => ids.map((id) => ({ id, name: 'Tutor' })));
  eventRepo.countRegistrations.mockResolvedValue(0);
  eventRepo.adminStatsByEvent.mockResolvedValue(new Map());
  calendar.createEventMeeting.mockResolvedValue({ calendarEventId: 'gcal-1', meetLink: MEET });
  calendar.updateEventMeeting.mockResolvedValue(undefined);
  calendar.cancelEventMeeting.mockResolvedValue(undefined);
  email.sendEventCanceledTo.mockResolvedValue({ messageId: 'm' });
});

// ─── createEvent ──────────────────────────────────────────────────────────

describe('createEvent', () => {
  it('creates a Draft with a numeric price, a slug from the title, the admin as creator and the tutor order', async () => {
    const result = await service.createEvent({ adminId: ADMIN, data: draftInput(), request: null });

    expect(eventRepo.create).toHaveBeenCalledTimes(1);
    const { data, tutorIds } = eventRepo.create.mock.calls[0][0];
    expect(data).toMatchObject({ status: 'Draft', price: 15000, createdById: ADMIN, meetingUrl: 'https://zoom.us/j/123' });
    expect(typeof data.price).toBe('number');
    expect(data.slug).toMatch(/^repaso-calculo-[a-z0-9]{4}$/);
    expect(data).not.toHaveProperty('tutorIds');
    expect(tutorIds).toEqual([T2, T1]);

    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: ADMIN, action: 'EVENT_CREATE', targetType: 'Event', targetId: ID,
    }));
    expect(result).toMatchObject({ id: ID, price: 15000, derivedStatus: 'draft' });
  });

  it('forces meetingUrl to null when autoMeet is on', async () => {
    await service.createEvent({ adminId: ADMIN, data: draftInput({ autoMeet: true, meetingUrl: 'https://zoom.us/j/999' }) });
    expect(eventRepo.create.mock.calls[0][0].data).toMatchObject({ autoMeet: true, meetingUrl: null });
  });

  it('maps empty form strings to null and drops the location of a Virtual event', async () => {
    await service.createEvent({
      adminId: ADMIN,
      data: draftInput({ courseId: '', earlyBirdSlots: '', earlyBirdPercent: '', location: 'Salón 3' }),
    });
    expect(eventRepo.create.mock.calls[0][0].data).toMatchObject({
      courseId: null, earlyBirdSlots: null, earlyBirdPercent: null, location: null,
    });
  });

  it('resolves the cover image key into its public URL', async () => {
    image.resolveEventImageKey.mockResolvedValue('https://cdn.example.com/event-images/a.png');
    await service.createEvent({ adminId: ADMIN, data: draftInput({ coverImageKey: 'event-images/a.png' }) });
    expect(image.resolveEventImageKey).toHaveBeenCalledWith('event-images/a.png');
    expect(eventRepo.create.mock.calls[0][0].data).toMatchObject({ coverImageUrl: 'https://cdn.example.com/event-images/a.png' });
    expect(eventRepo.create.mock.calls[0][0].data).not.toHaveProperty('coverImageKey');
  });

  it('rejects an early-bird that would charge below the minimum', async () => {
    await expect(service.createEvent({
      adminId: ADMIN,
      data: draftInput({ price: 1600, earlyBirdSlots: 1, earlyBirdPercent: 10 }),
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'EARLY_BIRD_BELOW_MINIMUM', field: 'price' });
    expect(eventRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when a tutor is not an approved, active tutor', async () => {
    eventRepo.findApprovedTutors.mockResolvedValue([{ id: T1, name: 'Luis' }]);
    await expect(service.createEvent({ adminId: ADMIN, data: draftInput() }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'TUTOR_NOT_APPROVED', field: 'tutorIds' });
    expect(eventRepo.findApprovedTutors).toHaveBeenCalledWith([T2, T1]);
    expect(eventRepo.create).not.toHaveBeenCalled();
  });

  it('retries a slug collision with a new suffix', async () => {
    const rng = jest.spyOn(Math, 'random');
    [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5].forEach((v) => rng.mockReturnValueOnce(v));
    eventRepo.create.mockRejectedValueOnce(p2002({ target: ['slug'] }));

    await service.createEvent({ adminId: ADMIN, data: draftInput() });

    expect(eventRepo.create).toHaveBeenCalledTimes(2);
    expect(eventRepo.create.mock.calls[0][0].data.slug).toBe('repaso-calculo-aaaa');
    expect(eventRepo.create.mock.calls[1][0].data.slug).toBe('repaso-calculo-ssss');
    rng.mockRestore();
  });

  it('also recognises the driver-adapter shape of a slug collision', async () => {
    eventRepo.create.mockRejectedValueOnce(p2002({
      modelName: 'Event',
      driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['slug'] } } },
    }));
    await service.createEvent({ adminId: ADMIN, data: draftInput() });
    expect(eventRepo.create).toHaveBeenCalledTimes(2);
  });

  it('does not retry other unique violations', async () => {
    eventRepo.create.mockRejectedValueOnce(p2002({ target: ['event_id', 'tutor_id'] }));
    await expect(service.createEvent({ adminId: ADMIN, data: draftInput() })).rejects.toMatchObject({ code: 'P2002' });
    expect(eventRepo.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing upload', 'NOT_FOUND'],
    ['an invalid image', 'VALIDATION_ERROR'],
  ])('reports %s as a coverImageKey validation error, not a 404', async (_label, code) => {
    image.resolveEventImageKey.mockRejectedValue(Object.assign(new Error('La imagen no se encontró'), { code }));
    await expect(service.createEvent({ adminId: ADMIN, data: draftInput({ coverImageKey: 'event-images/a.png' }) }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'COVER_IMAGE_INVALID', field: 'coverImageKey' });
    expect(eventRepo.create).not.toHaveBeenCalled();
  });

  it('lets an S3 outage while resolving the cover propagate as-is', async () => {
    image.resolveEventImageKey.mockRejectedValue(new Error('S3 down'));
    await expect(service.createEvent({ adminId: ADMIN, data: draftInput({ coverImageKey: 'event-images/a.png' }) }))
      .rejects.toThrow('S3 down');
  });

  it.each([
    ['the driver-adapter shape', { driverAdapterError: { cause: { kind: 'ForeignKeyConstraintViolation', constraint: { index: 'events_course_id_fkey' } } } }],
    ['the classic shape', { field_name: 'events_course_id_fkey (index)' }],
  ])('maps an unknown courseId (P2003, %s) to COURSE_NOT_FOUND', async (_label, meta) => {
    eventRepo.create.mockRejectedValue(p2003(meta));
    await expect(service.createEvent({ adminId: ADMIN, data: draftInput({ courseId: '33333333-3333-4333-8333-333333333333' }) }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'COURSE_NOT_FOUND', field: 'courseId' });
  });

  it('leaves other foreign-key violations alone', async () => {
    eventRepo.create.mockRejectedValue(p2003({
      driverAdapterError: { cause: { kind: 'ForeignKeyConstraintViolation', constraint: { index: 'event_tutors_tutor_id_fkey' } } },
    }));
    await expect(service.createEvent({ adminId: ADMIN, data: draftInput() })).rejects.toMatchObject({ code: 'P2003' });
  });
});

// ─── updateEvent ──────────────────────────────────────────────────────────

describe('updateEvent', () => {
  it('rejects NOT_FOUND for an unknown event', async () => {
    eventRepo.findById.mockResolvedValue(null);
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { title: 'Nuevo' } }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('locks the price once a registration exists', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    eventRepo.countRegistrations.mockResolvedValue(1);

    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { price: 20000 } }))
      .rejects.toMatchObject({ code: 'PRICE_LOCKED' });
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { earlyBirdSlots: 5, earlyBirdPercent: 10 } }))
      .rejects.toMatchObject({ code: 'PRICE_LOCKED' });
    expect(eventRepo.update).not.toHaveBeenCalled();
  });

  it('changing only the title succeeds and leaves the slug alone, even with registrations', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    eventRepo.countRegistrations.mockResolvedValue(3);

    const result = await service.updateEvent({ adminId: ADMIN, id: ID, data: { title: 'Repaso Cálculo II' } });

    expect(eventRepo.update).toHaveBeenCalledTimes(1);
    const [id, patch, tutorIds] = eventRepo.update.mock.calls[0];
    expect(id).toBe(ID);
    expect(patch).toEqual({ title: 'Repaso Cálculo II' });
    expect(tutorIds).toBeUndefined();
    expect(result.event.slug).toBe('repaso-calculo-ab12');
    expect(result.calendarWarning).toBeUndefined();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_UPDATE', targetId: ID }));
  });

  it('accepts the unchanged price from a full form resubmission while registrations exist', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    eventRepo.countRegistrations.mockResolvedValue(2);

    await service.updateEvent({ adminId: ADMIN, id: ID, data: draftInput({ location: 'Salón 3', title: 'Otro' }) });

    expect(eventRepo.update.mock.calls[0][1]).toEqual({ title: 'Otro' });
  });

  it('syncs the tutors only when they change', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    await service.updateEvent({ adminId: ADMIN, id: ID, data: { tutorIds: [T1, T2] } });
    expect(eventRepo.findApprovedTutors).toHaveBeenCalledWith([T1, T2]);
    expect(eventRepo.update).toHaveBeenCalledWith(ID, {}, [T1, T2]);
  });

  it('re-validates the merged draft', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { endsAt: '2026-10-18T22:00:00.000Z' } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'ENDS_BEFORE_START', field: 'endsAt' });
    expect(eventRepo.update).not.toHaveBeenCalled();
  });

  it('patches the Meet event when a Published autoMeet event moves, keeping its link', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({
      status: 'Published', autoMeet: true, meetingUrl: MEET, googleCalendarEventId: 'gcal-1',
    }));
    const newStart = '2026-10-20T23:00:00.000Z';
    const newEnd = '2026-10-21T01:00:00.000Z';

    const result = await service.updateEvent({ adminId: ADMIN, id: ID, data: { startsAt: newStart, endsAt: newEnd } });

    expect(calendar.updateEventMeeting).toHaveBeenCalledWith('gcal-1', expect.objectContaining({
      startsAt: new Date(newStart), endsAt: new Date(newEnd),
    }));
    const patch = eventRepo.update.mock.calls[0][1];
    expect(patch).toEqual({ startsAt: new Date(newStart), endsAt: new Date(newEnd) });
    expect(result.calendarWarning).toBeUndefined();
  });

  it('still saves when the Meet patch fails, flagging calendarWarning', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({
      status: 'Published', autoMeet: true, meetingUrl: MEET, googleCalendarEventId: 'gcal-1',
    }));
    calendar.updateEventMeeting.mockRejectedValue(Object.assign(new Error('boom'), { code: 'CALENDAR_UPDATE_FAILED' }));

    const result = await service.updateEvent({ adminId: ADMIN, id: ID, data: { startsAt: '2026-10-18T22:00:00.000Z' } });

    expect(eventRepo.update).toHaveBeenCalledTimes(1);
    expect(result.calendarWarning).toBe(true);
  });

  it('reports a bad replacement cover as a coverImageKey validation error', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    image.resolveEventImageKey.mockRejectedValue(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { coverImageKey: 'event-images/b.png' } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'COVER_IMAGE_INVALID', field: 'coverImageKey' });
    expect(eventRepo.update).not.toHaveBeenCalled();
  });

  it('maps an unknown courseId on update to COURSE_NOT_FOUND', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    eventRepo.update.mockRejectedValue(p2003({
      driverAdapterError: { cause: { kind: 'ForeignKeyConstraintViolation', constraint: { fields: ['course_id'] } } },
    }));
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { courseId: '33333333-3333-4333-8333-333333333333' } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'COURSE_NOT_FOUND', field: 'courseId' });
  });

  it('rejects INVALID_STATE on a Canceled event', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Canceled' }));
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { title: 'Nuevo' } }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('rejects INVALID_STATE when a Published event changes modality or autoMeet', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { modality: 'InPerson', location: 'Salón 3' } }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(service.updateEvent({ adminId: ADMIN, id: ID, data: { autoMeet: true } }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(eventRepo.update).not.toHaveBeenCalled();
  });
});

// ─── publishEvent ─────────────────────────────────────────────────────────

describe('publishEvent', () => {
  it('creates the Meet and publishes a Draft autoMeet event', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ autoMeet: true, meetingUrl: null }));

    const result = await service.publishEvent({ adminId: ADMIN, id: ID, request: null, now: NOW });

    expect(calendar.createEventMeeting).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Repaso Cálculo', startsAt: new Date(START), endsAt: new Date(END),
    }));
    expect(eventRepo.updateIfStatus).toHaveBeenCalledWith(ID, 'Draft', {
      status: 'Published', publishedAt: NOW, meetingUrl: MEET, googleCalendarEventId: 'gcal-1',
    });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_PUBLISH', targetId: ID }));
    expect(result).toMatchObject({ status: 'Published', derivedStatus: 'published', meetingUrl: MEET });
  });

  it('publishes a pasted-link event without touching the calendar', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    await service.publishEvent({ adminId: ADMIN, id: ID, now: NOW });
    expect(calendar.createEventMeeting).not.toHaveBeenCalled();
    expect(eventRepo.updateIfStatus).toHaveBeenCalledWith(ID, 'Draft', { status: 'Published', publishedAt: NOW });
  });

  it('cancels a Meet-less calendar event and fails with CALENDAR_ERROR, staying Draft', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ autoMeet: true, meetingUrl: null }));
    calendar.createEventMeeting.mockResolvedValue({ calendarEventId: 'gcal-2', meetLink: null });

    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'CALENDAR_ERROR' });
    expect(calendar.cancelEventMeeting).toHaveBeenCalledWith('gcal-2');
    expect(eventRepo.updateIfStatus).not.toHaveBeenCalled();
  });

  it('still fails with CALENDAR_ERROR when that best-effort cleanup also fails', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ autoMeet: true, meetingUrl: null }));
    calendar.createEventMeeting.mockResolvedValue({ calendarEventId: 'gcal-2', meetLink: null });
    calendar.cancelEventMeeting.mockRejectedValue(new Error('down'));

    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'CALENDAR_ERROR' });
  });

  it('cancels the new Meet and rethrows when the publish write fails', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ autoMeet: true, meetingUrl: null }));
    eventRepo.updateIfStatus.mockRejectedValue(new Error('db down'));

    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW })).rejects.toThrow('db down');
    expect(calendar.cancelEventMeeting).toHaveBeenCalledWith('gcal-1');
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('loses a concurrent publish with INVALID_STATE and cancels its own Meet', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ autoMeet: true, meetingUrl: null }));
    eventRepo.updateIfStatus.mockResolvedValue(null); // another request already published it

    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(eventRepo.updateIfStatus).toHaveBeenCalledWith(ID, 'Draft', expect.objectContaining({ googleCalendarEventId: 'gcal-1' }));
    expect(calendar.cancelEventMeeting).toHaveBeenCalledWith('gcal-1');
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('loses a concurrent publish of a pasted-link event without touching the calendar', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    eventRepo.updateIfStatus.mockResolvedValue(null);

    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(calendar.cancelEventMeeting).not.toHaveBeenCalled();
  });

  it('maps CALENDAR_NOT_CONFIGURED to CALENDAR_ERROR', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ autoMeet: true, meetingUrl: null }));
    calendar.createEventMeeting.mockRejectedValue(Object.assign(new Error('nc'), { code: 'CALENDAR_NOT_CONFIGURED' }));

    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'CALENDAR_ERROR' });
    expect(eventRepo.updateIfStatus).not.toHaveBeenCalled();
  });

  it('rejects INVALID_STATE for a non-Draft and STARTS_IN_PAST for a past start', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });

    eventRepo.findById.mockResolvedValue(storedEvent({
      startsAt: new Date('2026-10-01T23:00:00.000Z'), endsAt: new Date('2026-10-02T01:00:00.000Z'),
    }));
    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'STARTS_IN_PAST' });
    expect(calendar.createEventMeeting).not.toHaveBeenCalled();
    expect(eventRepo.updateIfStatus).not.toHaveBeenCalled();
  });

  it('rejects when a tutor is no longer approved', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    eventRepo.findApprovedTutors.mockResolvedValue([{ id: T1, name: 'Luis' }]);
    await expect(service.publishEvent({ adminId: ADMIN, id: ID, now: NOW }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'TUTOR_NOT_APPROVED' });
    expect(eventRepo.updateIfStatus).not.toHaveBeenCalled();
  });
});

// ─── cancelEvent ──────────────────────────────────────────────────────────

describe('cancelEvent', () => {
  const published = () => storedEvent({
    status: 'Published', autoMeet: true, meetingUrl: MEET, googleCalendarEventId: 'gcal-1',
  });
  const canceledRow = () => ({ ...published(), status: 'Canceled', canceledAt: NOW, cancelReason: 'Tutor enfermo' });

  beforeEach(() => {
    eventRepo.findById.mockResolvedValue(published());
    regRepo.lockEvent.mockResolvedValue({ id: ID, status: 'Published' });
    regRepo.cancelAllForEvent.mockResolvedValue({
      confirmed: [
        { id: 'r1', userId: 'u1', finalAmount: '13500.00' },
        { id: 'r2', userId: 'u2', finalAmount: '15000.00' },
      ],
    });
    mockTx.event.update.mockResolvedValue(canceledRow());
    eventRepo.findUsersByIds.mockResolvedValue([
      { id: 'u1', name: 'Uno', email: 'uno@x.co' },
      { id: 'u2', name: 'Dos', email: 'dos@x.co' },
    ]);
  });

  it('cancels everything in one locked transaction, then emails, frees the Meet and audits', async () => {
    prisma.$transaction.mockImplementationOnce(async (fn) => {
      const out = await fn(mockTx);
      // Side effects happen only after the transaction commits.
      expect(email.sendEventCanceledTo).not.toHaveBeenCalled();
      expect(calendar.cancelEventMeeting).not.toHaveBeenCalled();
      return out;
    });

    const result = await service.cancelEvent({ adminId: ADMIN, id: ID, reason: '  Tutor enfermo ', request: null, now: NOW });

    expect(regRepo.lockEvent).toHaveBeenCalledWith(mockTx, ID);
    expect(regRepo.cancelAllForEvent).toHaveBeenCalledWith(mockTx, ID, NOW);
    expect(regRepo.lockEvent.mock.invocationCallOrder[0])
      .toBeLessThan(regRepo.cancelAllForEvent.mock.invocationCallOrder[0]);
    expect(mockTx.event.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ID },
      data: { status: 'Canceled', canceledAt: NOW, cancelReason: 'Tutor enfermo' },
    }));

    expect(eventRepo.findUsersByIds).toHaveBeenCalledWith(['u1', 'u2']);
    expect(email.sendEventCanceledTo).toHaveBeenCalledTimes(2);
    expect(email.sendEventCanceledTo).toHaveBeenCalledWith({
      event: expect.objectContaining({ status: 'Canceled', cancelReason: 'Tutor enfermo' }),
      user: expect.objectContaining({ id: 'u1', email: 'uno@x.co' }),
      amountPaid: 13500,
    });
    expect(email.sendEventCanceledTo).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ id: 'u2' }), amountPaid: 15000,
    }));
    expect(calendar.cancelEventMeeting).toHaveBeenCalledWith('gcal-1');
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_CANCEL', targetId: ID }));
    expect(result).toMatchObject({ status: 'Canceled', derivedStatus: 'canceled' });
  });

  it('stores a null reason when none is given', async () => {
    await service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW });
    expect(mockTx.event.update.mock.calls[0][0].data.cancelReason).toBeNull();
  });

  it('does not fail when an email, the user lookup or the calendar fails', async () => {
    email.sendEventCanceledTo.mockRejectedValueOnce(new Error('brevo down'));
    calendar.cancelEventMeeting.mockRejectedValue(new Error('calendar down'));
    await expect(service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW })).resolves.toMatchObject({ status: 'Canceled' });
    expect(email.sendEventCanceledTo).toHaveBeenCalledTimes(2);

    eventRepo.findUsersByIds.mockRejectedValue(new Error('db blip'));
    await expect(service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW })).resolves.toMatchObject({ status: 'Canceled' });
    expect(audit.logAction).toHaveBeenCalledTimes(2);
  });

  it('skips the calendar when the event has no Meet', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    mockTx.event.update.mockResolvedValue(storedEvent({ status: 'Canceled', canceledAt: NOW }));
    await service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW });
    expect(calendar.cancelEventMeeting).not.toHaveBeenCalled();
  });

  it('rejects INVALID_STATE for a Draft or a Canceled event', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Draft' }));
    await expect(service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW })).rejects.toMatchObject({ code: 'INVALID_STATE' });

    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Canceled' }));
    await expect(service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects INVALID_STATE when a concurrent cancel won the lock', async () => {
    regRepo.lockEvent.mockResolvedValue({ id: ID, status: 'Canceled' });
    await expect(service.cancelEvent({ adminId: ADMIN, id: ID, now: NOW })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(regRepo.cancelAllForEvent).not.toHaveBeenCalled();
    expect(email.sendEventCanceledTo).not.toHaveBeenCalled();
  });
});

// ─── deleteDraftEvent ─────────────────────────────────────────────────────

describe('deleteDraftEvent', () => {
  it('refuses to delete a Published event', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent({ status: 'Published' }));
    await expect(service.deleteDraftEvent({ adminId: ADMIN, id: ID })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(eventRepo.deleteById).not.toHaveBeenCalled();
  });

  it('deletes a Draft and audits it', async () => {
    eventRepo.findById.mockResolvedValue(storedEvent());
    await service.deleteDraftEvent({ adminId: ADMIN, id: ID, request: null });
    expect(eventRepo.deleteById).toHaveBeenCalledWith(ID);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_DELETE', targetId: ID }));
  });
});

// ─── reads ────────────────────────────────────────────────────────────────

describe('reads and serialization', () => {
  it('serializeAdminEvent exposes a numeric price, flat tutors, stats and the derived status', () => {
    const stats = { confirmed: 4, pending: 1, canceled: 0, responses: 2 };
    const out = service.serializeAdminEvent(storedEvent({ status: 'Published' }), stats, NOW);
    expect(out).toMatchObject({
      id: ID, slug: 'repaso-calculo-ab12', price: 15000, status: 'Published', derivedStatus: 'published', stats, course: null,
    });
    expect(out.tutors).toEqual([
      { id: T2, name: 'Ana', email: 'Ana@x.co', profilePictureUrl: null },
      { id: T1, name: 'Luis', email: 'Luis@x.co', profilePictureUrl: null },
    ]);

    const later = new Date('2026-10-20T00:00:00.000Z');
    expect(service.serializeAdminEvent(storedEvent({ status: 'Published' }), stats, later).derivedStatus).toBe('finished');
    expect(service.serializeAdminEvent(storedEvent({ status: 'Canceled' }), stats, later).derivedStatus).toBe('canceled');
  });

  it('listEventsAdmin forwards the filter and attaches per-event stats', async () => {
    eventRepo.findManyAdmin.mockResolvedValue([storedEvent()]);
    eventRepo.adminStatsByEvent.mockResolvedValue(new Map([[ID, { confirmed: 2, pending: 0, canceled: 1, responses: 1 }]]));

    const events = await service.listEventsAdmin({ filter: 'draft', now: NOW });

    expect(eventRepo.findManyAdmin).toHaveBeenCalledWith({ filter: 'draft', now: NOW });
    expect(eventRepo.adminStatsByEvent).toHaveBeenCalledWith([ID]);
    expect(events[0].stats).toEqual({ confirmed: 2, pending: 0, canceled: 1, responses: 1 });
  });

  it('getEventAdmin 404s on an unknown id', async () => {
    eventRepo.findById.mockResolvedValue(null);
    await expect(service.getEventAdmin(ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
