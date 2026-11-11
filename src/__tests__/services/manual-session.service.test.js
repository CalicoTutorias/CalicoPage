/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/manual-session.service.js: the slot and the
 * price are the server's, the session goes to the student's account when there
 * is one and otherwise they stay anonymous, reachable by phone or WhatsApp tag,
 * and only a real proof in S3 moves the payment to paid. Repositories,
 * S3, calendar, email and audit are mocked; the slot and pricing rules are REAL.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { session: { update: jest.fn() } } }));
jest.mock('@/lib/s3', () => ({
  generateUploadUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
  headObject: jest.fn(),
  setObjectTags: jest.fn(),
}));
jest.mock('@/lib/repositories/user.repository', () => ({
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByPhoneNumber: jest.fn(),
  findContactByEmail: jest.fn(),
  searchContacts: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}));
jest.mock('@/lib/repositories/session.repository', () => ({
  findById: jest.fn(),
  findByTutorInRange: jest.fn(),
  findManualSessionById: jest.fn(),
  findManualSessions: jest.fn(),
  createSessionWithParticipant: jest.fn(),
}));
jest.mock('@/lib/repositories/payment.repository', () => ({
  create: jest.fn(),
  findBySessionId: jest.fn(),
  markManualPaymentPaid: jest.fn(),
}));
jest.mock('@/lib/repositories/academic.repository', () => ({
  findCourseById: jest.fn(),
  findTutorCourse: jest.fn(),
  findOfferingTutorsForCourse: jest.fn(),
}));
jest.mock('@/lib/repositories/availability.repository', () => ({
  findAvailabilityByUserId: jest.fn(),
  findScheduleByUserId: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: {
    MANUAL_SESSION_CREATE: 'MANUAL_SESSION_CREATE',
    MANUAL_SESSION_PAYMENT_CONFIRM: 'MANUAL_SESSION_PAYMENT_CONFIRM',
  },
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/calico-calendar.service', () => ({ createTutoringSessionEvent: jest.fn() }));
jest.mock('@/lib/services/email.service', () => ({ sendSessionConfirmedEmail: jest.fn() }));
jest.mock('@/lib/services/session.service', () => ({
  completeSession: jest.fn(),
  sessionConfirmedEmailParams: jest.fn((session, tutor, student) => ({
    tutorName: tutor?.name,
    studentName: student?.name || 'Estudiante',
    courseName: session.course?.name,
    meetLink: session.googleMeetLink || '',
  })),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({ invalidateAllMetrics: jest.fn() }));
jest.mock('@/lib/services/notification.service', () => ({
  notifySessionConfirmedToTutor: jest.fn(),
  notifySessionAccepted: jest.fn(),
}));
jest.mock('@/lib/repositories/review.repository', () => ({ upsertReview: jest.fn() }));

const s3 = require('@/lib/s3');
const userRepo = require('@/lib/repositories/user.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const paymentRepo = require('@/lib/repositories/payment.repository');
const academicRepo = require('@/lib/repositories/academic.repository');
const availabilityRepo = require('@/lib/repositories/availability.repository');
const audit = require('@/lib/services/admin-audit.service');
const calendar = require('@/lib/services/calico-calendar.service');
const email = require('@/lib/services/email.service');
const metrics = require('@/lib/services/admin-metrics.service');
const sessionService = require('@/lib/services/session.service');
const notifications = require('@/lib/services/notification.service');
const reviewRepo = require('@/lib/repositories/review.repository');
const service = require('@/lib/services/manual-session.service');

// Monday 2026-11-02, 08:00 in Bogotá. The tutor is free 10:00–13:00 on Mondays.
const NOW = new Date('2026-11-02T13:00:00.000Z');
const START = '2026-11-02T15:00:00.000Z'; // 10:00 in Bogotá
const ADMIN = 'admin-1';
const TUTOR_ID = 'tutor-1';
const COURSE_ID = 'course-1';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PROOF_KEY = `manual-payment-proofs/${SESSION_ID}/a1b2c3d4e5f6.png`;
const TUTOR = { id: TUTOR_ID, name: 'Laura Tutora', email: 'laura@calico.co', isTutorApproved: true, isActive: true };
const CONTACT = { phoneNumber: '+57 300 123 4567', email: 'alguien@gmail.com' };
const ANONYMOUS = { id: 'student-1', name: 'Anónimo', kind: 'ExternalTemporary', email: CONTACT.email };

const code = (expected) => expect.objectContaining({ code: expected });

function storedSession(overrides = {}) {
  return {
    id: SESSION_ID,
    tutorId: TUTOR_ID,
    startTimestamp: new Date(START),
    endTimestamp: new Date('2026-11-02T16:30:00.000Z'),
    googleCalendarEventId: 'evt-1',
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
    course: { id: COURSE_ID, code: 'ISIS1225', name: 'Estructuras de Datos' },
    tutor: { id: TUTOR_ID, name: TUTOR.name, email: TUTOR.email },
    participants: [{ student: ANONYMOUS }],
    ...overrides,
  };
}

function manualRow(overrides = {}) {
  return {
    id: SESSION_ID,
    status: 'Accepted',
    startTimestamp: new Date(START),
    endTimestamp: new Date('2026-11-02T16:30:00.000Z'),
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
    course: { id: COURSE_ID, code: 'ISIS1225', name: 'Estructuras de Datos' },
    tutor: { id: TUTOR_ID, name: TUTOR.name },
    participants: [{ student: { id: 'student-1', name: 'Anónimo', kind: 'ExternalTemporary', email: CONTACT.email, phoneNumber: CONTACT.phoneNumber } }],
    payments: [{ id: 'pay-1', amount: '75000', status: 'pending', proofS3Key: null, proofUploadedAt: null }],
    ...overrides,
  };
}

function storedPayment(overrides = {}) {
  return {
    id: 'pay-1',
    status: 'pending',
    amount: '75000',
    tutorPayoutBase: '75000',
    tutorId: TUTOR_ID,
    studentId: 'student-1',
    proofS3Key: null,
    session: { source: 'ManualAdmin', status: 'Accepted', endTimestamp: new Date('2026-11-02T12:00:00.000Z') },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    adminId: ADMIN,
    tutorId: TUTOR_ID,
    courseId: COURSE_ID,
    student: CONTACT,
    startTimestamp: START,
    durationMinutes: 90,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  userRepo.findById.mockResolvedValue(TUTOR);
  userRepo.findByPhoneNumber.mockResolvedValue(null);
  userRepo.findByEmail.mockResolvedValue(null);
  userRepo.create.mockResolvedValue(ANONYMOUS);
  userRepo.update.mockImplementation(async (id, data) => ({ id, name: 'Guardado', kind: 'Registered', ...data }));

  academicRepo.findTutorCourse.mockResolvedValue({ status: 'Approved' });
  academicRepo.findCourseById.mockResolvedValue({ id: COURSE_ID, basePrice: '50000' });

  availabilityRepo.findScheduleByUserId.mockResolvedValue({ timezone: 'America/Bogota', bufferTime: 20, maxSessionsPerDay: 5 });
  availabilityRepo.findAvailabilityByUserId.mockResolvedValue([
    {
      id: 'b1',
      dayOfWeek: 1,
      startTime: new Date('1970-01-01T10:00:00.000Z'),
      endTime: new Date('1970-01-01T13:00:00.000Z'),
      recurring: true,
      specificDate: null,
      source: 'manual',
    },
  ]);
  sessionRepo.findByTutorInRange.mockResolvedValue([]);
  sessionRepo.createSessionWithParticipant.mockResolvedValue({ id: SESSION_ID });
  sessionRepo.findById.mockResolvedValue(storedSession());
  sessionRepo.findManualSessionById.mockResolvedValue(manualRow());

  calendar.createTutoringSessionEvent.mockResolvedValue({ success: true, eventId: 'evt-1', meetLink: 'https://meet.google.com/abc-defg-hij' });
  email.sendSessionConfirmedEmail.mockResolvedValue(undefined);
  paymentRepo.create.mockResolvedValue({ id: 'pay-1', status: 'pending' });
  paymentRepo.findBySessionId.mockResolvedValue(storedPayment());
  paymentRepo.markManualPaymentPaid.mockResolvedValue({ id: 'pay-1', status: 'paid' });

  s3.generateUploadUrl.mockResolvedValue('https://s3.example/put');
  s3.generateDownloadUrl.mockResolvedValue('https://s3.example/get');
  s3.headObject.mockResolvedValue({ contentLength: 1024, contentType: 'image/png' });
  s3.setObjectTags.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('createManualSession: slot and tutor', () => {
  it('test_should_refuse_a_start_outside_the_tutors_availability', async () => {
    await expect(service.createManualSession(input({ startTimestamp: '2026-11-02T20:00:00.000Z' })))
      .rejects.toEqual(code('SLOT_NOT_AVAILABLE'));

    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(email.sendSessionConfirmedEmail).not.toHaveBeenCalled();
  });

  it('test_should_refuse_a_duration_that_does_not_fit_in_the_block', async () => {
    // 12:00 only has an hour left in the block.
    await expect(service.createManualSession(input({ startTimestamp: '2026-11-02T17:00:00.000Z', durationMinutes: 90 })))
      .rejects.toEqual(code('SLOT_NOT_AVAILABLE'));
  });

  it('test_should_refuse_a_slot_taken_by_another_session', async () => {
    sessionRepo.findByTutorInRange.mockResolvedValue([
      { startTimestamp: new Date('2026-11-02T15:30:00.000Z'), endTimestamp: new Date('2026-11-02T16:30:00.000Z') },
    ]);

    await expect(service.createManualSession(input())).rejects.toEqual(code('SLOT_NOT_AVAILABLE'));
  });

  it('test_should_refuse_a_tutor_that_is_suspended', async () => {
    userRepo.findById.mockResolvedValue({ ...TUTOR, isActive: false });

    await expect(service.createManualSession(input())).rejects.toEqual(code('TUTOR_NOT_APPROVED'));
  });

  it.each([['Paused'], ['Pending'], ['Rejected']])('test_should_refuse_a_course_the_tutor_has_%s', async (status) => {
    academicRepo.findTutorCourse.mockResolvedValue({ status });

    await expect(service.createManualSession(input())).rejects.toEqual(code('COURSE_NOT_OFFERED'));
  });

  it('test_should_use_the_tutors_buffer_when_creating_the_session', async () => {
    await service.createManualSession(input());

    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        startTimestamp: new Date(START),
        endTimestamp: new Date('2026-11-02T16:30:00.000Z'),
        status: 'Accepted',
        locationType: 'Virtual',
        source: 'ManualAdmin',
        manualCreatedById: ADMIN,
      }),
      'student-1',
      20,
    );
  });
});

describe('createManualSession: price', () => {
  it('test_should_price_the_session_from_the_course_and_ignore_any_amount_sent', async () => {
    await service.createManualSession(input({ amount: 1, paymentStatus: 'paid' }));

    // 50 000/h × 1.5 h, pending whatever the request says.
    expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 75000,
      originalAmount: 75000,
      discountAmount: 0,
      tutorPayoutBase: 75000,
      status: 'pending',
      wompiId: null,
    }));
    expect(metrics.invalidateAllMetrics).not.toHaveBeenCalled();
  });

  it('test_should_refuse_a_course_without_a_price_before_creating_anything', async () => {
    academicRepo.findCourseById.mockResolvedValue({ id: COURSE_ID, basePrice: '0' });

    await expect(service.createManualSession(input())).rejects.toEqual(code('NO_PRICE'));

    expect(userRepo.create).not.toHaveBeenCalled();
    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });
});

describe('createManualSession: student', () => {
  it('test_should_create_an_anonymous_external_student_with_the_phone_and_email', async () => {
    const result = await service.createManualSession(input());

    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Anónimo',
      email: CONTACT.email,
      phoneNumber: CONTACT.phoneNumber,
      passwordHash: null,
      kind: 'ExternalTemporary',
      isEmailVerified: false,
    }));
    expect(result.createdStudent).toBe(true);
  });

  it('test_should_create_an_anonymous_student_with_only_a_whatsapp_tag', async () => {
    const result = await service.createManualSession(input({ student: { whatsappTag: '@ana.perez', email: CONTACT.email } }));

    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Anónimo',
      email: CONTACT.email,
      phoneNumber: null,
      whatsappTag: 'ana.perez',
      kind: 'ExternalTemporary',
    }));
    expect(result.createdStudent).toBe(true);
  });

  it('test_should_keep_both_the_phone_and_the_tag_when_both_are_given', async () => {
    await service.createManualSession(input({ student: { ...CONTACT, whatsappTag: 'ana.perez' } }));

    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumber: CONTACT.phoneNumber,
      whatsappTag: 'ana.perez',
    }));
  });

  it('test_should_refuse_someone_without_an_account_and_without_a_way_to_reach_them', async () => {
    await expect(service.createManualSession(input({ student: { email: CONTACT.email } })))
      .rejects.toEqual(code('STUDENT_CONTACT_REQUIRED'));

    expect(userRepo.create).not.toHaveBeenCalled();
    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });

  it.each([
    ['a space', 'ana perez'],
    ['only digits, a phone in the wrong field', '3001234567'],
    ['a single letter', '@a'],
  ])('test_should_refuse_a_tag_with_%s', async (_label, whatsappTag) => {
    await expect(service.createManualSession(input({ student: { email: CONTACT.email, whatsappTag } })))
      .rejects.toEqual(code('INVALID_WHATSAPP_TAG'));

    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });

  it('test_should_not_need_any_contact_when_the_email_has_an_account', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', name: 'Ana Real', kind: 'Registered', email: CONTACT.email });

    const result = await service.createManualSession(input({ student: { email: CONTACT.email } }));

    expect(userRepo.create).not.toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(expect.anything(), 'student-2', 20);
    expect(result.createdStudent).toBe(false);
  });

  it('test_should_give_a_registered_account_the_phone_it_lacks', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', kind: 'Registered', email: CONTACT.email, phoneNumber: null });

    await service.createManualSession(input());

    expect(userRepo.update).toHaveBeenCalledWith('student-2', { phoneNumber: CONTACT.phoneNumber });
    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(expect.anything(), 'student-2', 20);
  });

  it('test_should_never_replace_the_phone_of_a_registered_account', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', kind: 'Registered', email: CONTACT.email, phoneNumber: '+57 311 000 0000' });

    await service.createManualSession(input());

    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('test_should_save_the_tag_on_a_registered_account', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', kind: 'Registered', email: CONTACT.email, phoneNumber: '+57 311 000 0000' });

    await service.createManualSession(input({ student: { email: CONTACT.email, whatsappTag: '@ana' } }));

    expect(userRepo.update).toHaveBeenCalledWith('student-2', { whatsappTag: 'ana' });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ contactFieldsUpdated: ['whatsappTag'] }),
    }));
  });

  it('test_should_not_move_a_phone_held_by_an_earlier_placeholder', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue({ id: 'placeholder', kind: 'ExternalTemporary', email: 'old@x.co' });
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', kind: 'Registered', email: CONTACT.email, phoneNumber: null });

    await service.createManualSession(input());

    expect(userRepo.update).not.toHaveBeenCalled();
    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(expect.anything(), 'student-2', 20);
  });

  it('test_should_keep_the_latest_phone_of_an_earlier_external_student', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'student-4', kind: 'ExternalTemporary', email: CONTACT.email, phoneNumber: '+57 311 000 0000' });

    await service.createManualSession(input());

    expect(userRepo.update).toHaveBeenCalledWith('student-4', { phoneNumber: CONTACT.phoneNumber });
  });

  it('test_should_not_touch_the_account_of_the_tutor_when_refusing_a_self_booking', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: TUTOR_ID, kind: 'Registered', email: CONTACT.email, phoneNumber: null });

    await expect(service.createManualSession(input({ student: { ...CONTACT, whatsappTag: 'laura' } })))
      .rejects.toEqual(code('SELF_BOOKING'));

    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('test_should_refuse_an_invalid_phone', async () => {
    await expect(service.createManualSession(input({ student: { ...CONTACT, phoneNumber: '12' } })))
      .rejects.toEqual(code('INVALID_STUDENT_PHONE'));
  });

  it('test_should_use_the_account_found_by_email_when_the_phone_is_unknown', async () => {
    const registered = { id: 'student-2', name: 'Ana Real', kind: 'Registered', email: CONTACT.email };
    userRepo.findByEmail.mockResolvedValue(registered);

    const result = await service.createManualSession(input());

    expect(userRepo.create).not.toHaveBeenCalled();
    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(expect.anything(), 'student-2', 20);
    expect(result.createdStudent).toBe(false);
  });

  it('test_should_prefer_a_registered_account_over_an_earlier_placeholder', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue({ id: 'placeholder', kind: 'ExternalTemporary', email: 'old@x.co' });
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', kind: 'Registered', email: CONTACT.email });

    await service.createManualSession(input());

    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(expect.anything(), 'student-2', 20);
  });

  it('test_should_refuse_a_phone_and_an_email_of_two_registered_accounts', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue({ id: 'student-3', kind: 'Registered' });
    userRepo.findByEmail.mockResolvedValue({ id: 'student-2', kind: 'Registered' });

    await expect(service.createManualSession(input())).rejects.toEqual(code('STUDENT_CONTACT_CONFLICT'));

    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });

  it('test_should_refresh_the_email_of_an_earlier_external_student', async () => {
    const placeholder = { id: 'student-4', kind: 'ExternalTemporary', email: 'external-573001234567@manual.calico.local' };
    userRepo.findByPhoneNumber.mockResolvedValue(placeholder);
    userRepo.update.mockResolvedValue({ ...placeholder, email: CONTACT.email });

    await service.createManualSession(input());

    expect(userRepo.update).toHaveBeenCalledWith('student-4', { email: CONTACT.email });
  });

  it('test_should_never_change_the_email_of_a_registered_account', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue({ id: 'student-2', name: 'Ana', kind: 'Registered', email: 'ana@real.co' });

    await service.createManualSession(input());

    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('test_should_refuse_the_tutor_as_their_own_student', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: TUTOR_ID, kind: 'Registered', email: CONTACT.email });

    await expect(service.createManualSession(input())).rejects.toEqual(code('SELF_BOOKING'));
  });

  it('test_should_recover_when_a_concurrent_request_created_the_same_student', async () => {
    userRepo.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    userRepo.findByPhoneNumber.mockResolvedValueOnce(null).mockResolvedValueOnce(ANONYMOUS);

    const result = await service.createManualSession(input());

    expect(result.createdStudent).toBe(false);
    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledWith(expect.anything(), 'student-1', 20);
  });
});

describe('createManualSession: link and emails', () => {
  it('test_should_email_the_link_to_the_typed_address_and_to_the_tutor', async () => {
    const result = await service.createManualSession(input());

    const params = expect.objectContaining({ meetLink: 'https://meet.google.com/abc-defg-hij', courseName: 'Estructuras de Datos' });
    expect(email.sendSessionConfirmedEmail).toHaveBeenCalledTimes(2);
    expect(email.sendSessionConfirmedEmail).toHaveBeenCalledWith(CONTACT.email, params);
    expect(email.sendSessionConfirmedEmail).toHaveBeenCalledWith(TUTOR.email, params);
    expect(result.emails).toEqual({ student: true, tutor: true });
  });

  it('test_should_call_an_anonymous_student_estudiante_in_the_email', async () => {
    await service.createManualSession(input());

    expect(email.sendSessionConfirmedEmail).toHaveBeenCalledWith(
      CONTACT.email,
      expect.objectContaining({ recipientName: 'Estudiante', studentName: 'Estudiante' }),
    );
  });

  it('test_should_send_the_email_to_the_typed_address_even_if_the_account_has_another', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue({ id: 'student-2', name: 'Ana', kind: 'Registered', email: 'ana@real.co' });

    await service.createManualSession(input());

    expect(email.sendSessionConfirmedEmail).toHaveBeenCalledWith(CONTACT.email, expect.objectContaining({ recipientName: 'Ana' }));
    expect(calendar.createTutoringSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      attendees: [expect.objectContaining({ email: CONTACT.email })],
    }));
  });

  it('test_should_keep_the_session_and_report_it_when_the_student_email_fails', async () => {
    email.sendSessionConfirmedEmail.mockImplementation(async (to) => {
      if (to === CONTACT.email) throw new Error('Brevo down');
    });

    const result = await service.createManualSession(input());

    expect(result.emails).toEqual({ student: false, tutor: true });
    expect(result.session.id).toBe(SESSION_ID);
    expect(audit.logAction).toHaveBeenCalled();
  });

  it('test_should_keep_the_session_and_warn_when_the_calendar_fails', async () => {
    calendar.createTutoringSessionEvent.mockRejectedValue(new Error('calendar down'));

    const result = await service.createManualSession(input());

    expect(result.calendarWarning).toBe('calendar down');
    expect(paymentRepo.create).toHaveBeenCalled();
    expect(email.sendSessionConfirmedEmail).toHaveBeenCalledTimes(2);
  });

  it('test_should_never_return_the_proof_key_in_the_row', async () => {
    sessionRepo.findManualSessionById.mockResolvedValue(manualRow({
      payments: [{ id: 'pay-1', amount: '75000', status: 'paid', proofS3Key: PROOF_KEY, proofUploadedAt: NOW }],
    }));

    const { session } = await service.createManualSession(input());

    expect(session.payment).toEqual({ status: 'paid', amount: 75000, hasProof: true, proofUploadedAt: NOW });
    expect(JSON.stringify(session)).not.toContain(PROOF_KEY);
  });
});

describe('createManualSession: notifications and review', () => {
  const REGISTERED = { id: 'student-2', name: 'Ana Real', kind: 'Registered', email: CONTACT.email };

  it('test_should_notify_the_tutor_and_the_registered_student_like_a_paid_booking', async () => {
    userRepo.findByEmail.mockResolvedValue(REGISTERED);

    await service.createManualSession(input({ student: { email: CONTACT.email } }));

    const session = expect.objectContaining({ id: SESSION_ID, tutorId: TUTOR_ID });
    expect(notifications.notifySessionConfirmedToTutor).toHaveBeenCalledWith(session, 'Ana Real');
    expect(notifications.notifySessionAccepted).toHaveBeenCalledWith(session, TUTOR.name);
  });

  it('test_should_create_the_pending_review_of_a_registered_student', async () => {
    userRepo.findByEmail.mockResolvedValue(REGISTERED);

    await service.createManualSession(input({ student: { email: CONTACT.email } }));

    expect(reviewRepo.upsertReview).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      studentId: 'student-2',
      tutorId: TUTOR_ID,
      courseId: COURSE_ID,
      rating: null,
      status: 'pending',
      comment: null,
    });
  });

  it('test_should_notify_only_the_tutor_for_an_anonymous_student', async () => {
    await service.createManualSession(input());

    expect(notifications.notifySessionConfirmedToTutor).toHaveBeenCalledWith(expect.anything(), 'Anónimo');
    expect(notifications.notifySessionAccepted).not.toHaveBeenCalled();
    expect(reviewRepo.upsertReview).not.toHaveBeenCalled();
  });

  it('test_should_keep_the_session_when_the_pending_review_fails', async () => {
    userRepo.findByEmail.mockResolvedValue(REGISTERED);
    reviewRepo.upsertReview.mockRejectedValue(new Error('db down'));

    const result = await service.createManualSession(input({ student: { email: CONTACT.email } }));

    expect(result.session.id).toBe(SESSION_ID);
    expect(audit.logAction).toHaveBeenCalled();
  });
});

describe('listManualSessions', () => {
  it('test_should_say_how_many_materials_each_session_has', async () => {
    sessionRepo.findManualSessions.mockResolvedValue({ total: 1, rows: [manualRow({ _count: { materials: 3 } })] });

    const { sessions } = await service.listManualSessions({ limit: 20, offset: 0 });

    expect(sessions[0].materialsCount).toBe(3);
  });

  it('test_should_hide_the_placeholder_email_of_older_students', async () => {
    sessionRepo.findManualSessions.mockResolvedValue({
      total: 1,
      rows: [manualRow({
        participants: [{ student: { name: 'Pedro', kind: 'ExternalTemporary', email: 'external-57300@manual.calico.local', phoneNumber: '+57300' } }],
      })],
    });

    const { sessions, total } = await service.listManualSessions({ limit: 20, offset: 0 });

    expect(total).toBe(1);
    expect(sessions[0].student).toEqual({ name: 'Pedro', external: true, phoneNumber: '+57300', whatsappTag: null, email: null });
  });
});

describe('searchStudents', () => {
  const ANA = { name: 'Ana Real', kind: 'Registered', email: 'ana@real.co', phoneNumber: '+57 300', whatsappTag: 'ana' };
  const PEPE = { name: 'Anónimo', kind: 'ExternalTemporary', email: 'ana.pepe@gmail.com', phoneNumber: null, whatsappTag: 'pepe' };

  beforeEach(() => {
    userRepo.findContactByEmail.mockResolvedValue(null);
    userRepo.searchContacts.mockResolvedValue([]);
  });

  it('test_should_answer_empty_when_nobody_matches', async () => {
    await expect(service.searchStudents('nadie')).resolves.toEqual([]);
  });

  it('test_should_say_who_each_person_is_and_how_to_reach_them', async () => {
    userRepo.searchContacts.mockResolvedValue([ANA, PEPE]);

    await expect(service.searchStudents('ana')).resolves.toEqual([
      { name: 'Ana Real', external: false, phoneNumber: '+57 300', whatsappTag: 'ana', email: 'ana@real.co' },
      { name: 'Anónimo', external: true, phoneNumber: null, whatsappTag: 'pepe', email: 'ana.pepe@gmail.com' },
    ]);
  });

  it('test_should_put_a_whole_email_first_and_only_once', async () => {
    userRepo.findContactByEmail.mockResolvedValue(PEPE);
    userRepo.searchContacts.mockResolvedValue([ANA, PEPE]);

    const students = await service.searchStudents(PEPE.email);

    expect(students.map((s) => s.email)).toEqual([PEPE.email, ANA.email]);
  });

  it('test_should_keep_a_whole_email_even_when_the_search_is_full', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...ANA, email: `ana${i}@real.co` }));
    userRepo.findContactByEmail.mockResolvedValue(PEPE);
    userRepo.searchContacts.mockResolvedValue(many);

    const students = await service.searchStudents(PEPE.email);

    expect(students).toHaveLength(6);
    expect(students[0].email).toBe(PEPE.email);
  });

  it('test_should_leave_out_placeholder_emails', async () => {
    userRepo.searchContacts.mockResolvedValue([{ ...PEPE, email: 'external-573@manual.calico.local' }]);

    await expect(service.searchStudents('external')).resolves.toEqual([]);
  });
});

describe('generatePaymentProofUploadUrl', () => {
  const upload = (overrides = {}) => service.generatePaymentProofUploadUrl({
    sessionId: SESSION_ID,
    mimeType: 'image/png',
    fileSize: 1024,
    ...overrides,
  });

  it('test_should_sign_a_key_inside_the_sessions_folder', async () => {
    const result = await upload();

    expect(result.s3Key).toMatch(new RegExp(`^manual-payment-proofs/${SESSION_ID}/[a-f0-9]{12}\\.png$`));
    expect(result.contentType).toBe('image/png');
    expect(s3.generateUploadUrl).toHaveBeenCalledWith(result.s3Key, 'image/png', {
      expiresIn: 300,
      contentLength: 1024,
      tagging: 'status=unconfirmed',
    });
  });

  it.each([['application/pdf'], ['image/svg+xml'], ['text/html']])('test_should_refuse_a_%s_file', async (mimeType) => {
    await expect(upload({ mimeType })).rejects.toEqual(code('PROOF_INVALID_TYPE'));

    expect(s3.generateUploadUrl).not.toHaveBeenCalled();
  });

  it('test_should_refuse_a_file_over_the_limit', async () => {
    await expect(upload({ fileSize: 10 * 1024 * 1024 + 1 })).rejects.toEqual(code('PROOF_TOO_LARGE'));
  });

  it('test_should_refuse_a_payment_of_a_normal_session', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ session: { source: 'Platform', status: 'Accepted' } }));

    await expect(upload()).rejects.toEqual(code('PAYMENT_IS_NOT_MANUAL'));
  });

  it('test_should_refuse_a_session_without_payment', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(null);

    await expect(upload()).rejects.toEqual(code('PAYMENT_NOT_FOUND'));
  });

  it('test_should_refuse_a_payment_already_paid', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ status: 'paid' }));

    await expect(upload()).rejects.toEqual(code('PAYMENT_ALREADY_PAID'));
  });

  it('test_should_refuse_a_canceled_session', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ session: { source: 'ManualAdmin', status: 'Canceled' } }));

    await expect(upload()).rejects.toEqual(code('SESSION_NOT_PAYABLE'));
  });
});

describe('attachPaymentProof', () => {
  const attach = (overrides = {}) => service.attachPaymentProof({
    sessionId: SESSION_ID,
    s3Key: PROOF_KEY,
    adminId: ADMIN,
    ...overrides,
  });

  it('test_should_mark_the_payment_paid_and_credit_the_tutor', async () => {
    await attach();

    expect(paymentRepo.markManualPaymentPaid).toHaveBeenCalledWith('pay-1', {
      tutorId: TUTOR_ID,
      tutorPayoutBase: 75000,
      proofS3Key: PROOF_KEY,
    });
    expect(s3.setObjectTags).toHaveBeenCalledWith(PROOF_KEY, { status: 'confirmed' });
    expect(metrics.invalidateAllMetrics).toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: ADMIN,
      action: 'MANUAL_SESSION_PAYMENT_CONFIRM',
      targetId: 'pay-1',
    }));
  });

  it.each([
    ['a key of another session', 'manual-payment-proofs/22222222-2222-4222-8222-222222222222/a1b2c3d4e5f6.png'],
    ['a key outside the proofs folder', 'profile-pictures/x/a1b2c3d4e5f6.png'],
    ['a traversal', `manual-payment-proofs/${SESSION_ID}/../other/a1b2c3d4e5f6.png`],
    ['a key the server would not generate', `manual-payment-proofs/${SESSION_ID}/evil.html`],
  ])('test_should_refuse_%s', async (_label, s3Key) => {
    await expect(attach({ s3Key })).rejects.toEqual(code('PROOF_KEY_INVALID'));

    expect(s3.headObject).not.toHaveBeenCalled();
    expect(paymentRepo.markManualPaymentPaid).not.toHaveBeenCalled();
  });

  it('test_should_not_mark_paid_when_the_file_is_not_in_s3', async () => {
    s3.headObject.mockRejectedValue(Object.assign(new Error('missing'), { code: 'NOT_FOUND' }));

    await expect(attach()).rejects.toEqual(code('PROOF_NOT_UPLOADED'));

    expect(paymentRepo.markManualPaymentPaid).not.toHaveBeenCalled();
  });

  it('test_should_not_mark_paid_when_the_stored_file_is_not_an_image', async () => {
    s3.headObject.mockResolvedValue({ contentLength: 10, contentType: 'text/html' });

    await expect(attach()).rejects.toEqual(code('PROOF_INVALID_TYPE'));

    expect(paymentRepo.markManualPaymentPaid).not.toHaveBeenCalled();
  });

  it('test_should_not_mark_paid_when_the_stored_file_is_too_large', async () => {
    s3.headObject.mockResolvedValue({ contentLength: 10 * 1024 * 1024 + 1, contentType: 'image/png' });

    await expect(attach()).rejects.toEqual(code('PROOF_TOO_LARGE'));
  });

  it('test_should_do_nothing_when_the_same_file_is_registered_twice', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ status: 'paid', proofS3Key: PROOF_KEY }));

    const row = await attach();

    expect(row.id).toBe(SESSION_ID);
    expect(paymentRepo.markManualPaymentPaid).not.toHaveBeenCalled();
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('test_should_refuse_another_file_for_a_payment_already_paid', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ status: 'paid', proofS3Key: PROOF_KEY }));

    await expect(attach({ s3Key: `manual-payment-proofs/${SESSION_ID}/ffffffffffff.png` }))
      .rejects.toEqual(code('PAYMENT_ALREADY_PAID'));
  });

  it('test_should_refuse_when_a_concurrent_upload_won_the_race', async () => {
    paymentRepo.markManualPaymentPaid.mockResolvedValue(null);

    await expect(attach()).rejects.toEqual(code('PAYMENT_ALREADY_PAID'));

    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('test_should_complete_a_session_that_already_ended', async () => {
    await attach();

    expect(sessionService.completeSession).toHaveBeenCalledWith(SESSION_ID, TUTOR_ID, { withReviews: false });
    const paidAt = paymentRepo.markManualPaymentPaid.mock.invocationCallOrder[0];
    expect(sessionService.completeSession.mock.invocationCallOrder[0]).toBeGreaterThan(paidAt);
  });

  it('test_should_ask_for_reviews_when_the_student_has_a_real_account', async () => {
    sessionRepo.findManualSessionById.mockResolvedValue(manualRow({
      participants: [{ student: { id: 'student-2', name: 'Ana', kind: 'Registered', email: 'ana@real.co', phoneNumber: null } }],
    }));

    await attach();

    expect(sessionService.completeSession).toHaveBeenCalledWith(SESSION_ID, TUTOR_ID, { withReviews: true });
  });

  it('test_should_leave_accepted_a_session_still_to_come', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({
      session: { source: 'ManualAdmin', status: 'Accepted', endTimestamp: new Date('2026-11-09T16:00:00.000Z') },
    }));

    await attach();

    expect(paymentRepo.markManualPaymentPaid).toHaveBeenCalled();
    expect(sessionService.completeSession).not.toHaveBeenCalled();
  });

  it('test_should_not_complete_a_session_already_completed', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({
      session: { source: 'ManualAdmin', status: 'Completed', endTimestamp: new Date('2026-11-02T12:00:00.000Z') },
    }));

    await attach();

    expect(sessionService.completeSession).not.toHaveBeenCalled();
  });

  it('test_should_keep_the_payment_paid_when_completing_the_session_fails', async () => {
    sessionService.completeSession.mockRejectedValue(new Error('db down'));

    await expect(attach()).resolves.toEqual(expect.objectContaining({ id: SESSION_ID }));

    expect(audit.logAction).toHaveBeenCalled();
    expect(s3.setObjectTags).toHaveBeenCalled();
  });

  it('test_should_not_complete_twice_when_the_same_file_is_registered_again', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ status: 'paid', proofS3Key: PROOF_KEY }));

    await attach();

    expect(sessionService.completeSession).not.toHaveBeenCalled();
  });

  it('test_should_keep_the_payment_paid_when_the_tag_update_fails', async () => {
    s3.setObjectTags.mockRejectedValue(new Error('s3 down'));

    await expect(attach()).resolves.toEqual(expect.objectContaining({ id: SESSION_ID }));
  });
});

describe('getPaymentProofUrl', () => {
  it('test_should_sign_a_short_lived_url', async () => {
    paymentRepo.findBySessionId.mockResolvedValue(storedPayment({ status: 'paid', proofS3Key: PROOF_KEY }));

    await expect(service.getPaymentProofUrl({ sessionId: SESSION_ID })).resolves.toBe('https://s3.example/get');

    expect(s3.generateDownloadUrl).toHaveBeenCalledWith(PROOF_KEY, 300);
  });

  it('test_should_answer_not_found_when_there_is_no_proof', async () => {
    await expect(service.getPaymentProofUrl({ sessionId: SESSION_ID })).rejects.toEqual(code('PROOF_NOT_FOUND'));
  });
});
