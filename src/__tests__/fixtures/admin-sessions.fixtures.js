/**
 * Shared fixtures for the admin "Tutorías" operations page
 * (/home/admin/tutorias): repository rows and the API items built from them.
 *
 * Anchor: Wed 2026-11-11 15:00Z = 10:00 America/Bogota (UTC−5).
 */

const START = '2026-11-11T15:00:00.000Z';
const END = '2026-11-11T16:00:00.000Z';

// ─── Repository rows ────────────────────────────────────────────────

/** A row as admin-metrics.repository.operationsSessions returns it. */
function makeOperationsRow(overrides = {}) {
  return {
    id: 'sess-1',
    status: 'Accepted',
    source: 'Platform',
    startTimestamp: new Date(START),
    endTimestamp: new Date(END),
    createdAt: new Date('2026-11-04T13:30:00.000Z'),
    cancelledAt: null,
    cancellationReason: null,
    cancelledBy: null,
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
    course: { code: 'ISIS1221', name: 'Intro a la Programación' },
    tutor: { id: 'tutor-1', name: 'Andrés Tutor', email: 'andres@uniandes.edu.co' },
    students: [{ id: 'stu-1', name: 'Ana Estudiante', email: 'ana@uniandes.edu.co', kind: 'Registered' }],
    payments: [{
      amount: 40000, originalAmount: 40000, discountAmount: 0, tutorPayoutBase: 40000,
      status: 'paid', createdAt: new Date('2026-11-04T13:31:00.000Z'), viaWompi: true,
    }],
    ...overrides,
  };
}

/** A row as payment-intent.repository.findUnbooked returns it (raw SQL). */
function makeUnbookedRow(overrides = {}) {
  return {
    reference: 'CALICO-1730000000-abc',
    kind: 'session',
    created_at: new Date('2026-11-04T12:00:00.000Z'),
    student_name: 'Ana Estudiante',
    student_email: 'ana@uniandes.edu.co',
    tutor_name: 'Andrés Tutor',
    course_code: 'ISIS1221',
    course_name: 'Intro a la Programación',
    event_title: null,
    event_starts_at: null,
    metadata: {
      studentId: 'stu-1',
      tutorId: 'tutor-1',
      courseId: 'course-1',
      startTimestamp: START,
      endTimestamp: END,
      topicsToReview: 'private notes',
      attachments: '[]',
      originalAmount: '40000',
      discountAmount: '0',
      tutorPayoutBase: '40000',
      sweep: {
        status: 'APPROVED',
        transactionId: 'wompi-tx-1',
        outcome: 'NEEDS_ATTENTION',
        reason: 'SESSION_CONFLICT',
        checkedAt: '2026-11-04T12:30:00.000Z',
      },
    },
    ...overrides,
  };
}

// ─── API items (what the page renders) ──────────────────────────────

/** One item of GET /api/admin/sessions. */
function makeSessionItem(overrides = {}) {
  return {
    id: 'sess-1',
    status: 'Accepted',
    source: 'Platform',
    startTimestamp: START,
    endTimestamp: END,
    createdAt: '2026-11-04T13:30:00.000Z',
    course: { code: 'ISIS1221', name: 'Intro a la Programación' },
    isTest: false,
    tutor: { id: 'tutor-1', name: 'Andrés Tutor', email: 'andres@uniandes.edu.co' },
    students: [{ id: 'stu-1', name: 'Ana Estudiante', email: 'ana@uniandes.edu.co', external: false }],
    meetLink: 'https://meet.google.com/abc-defg-hij',
    missingMeet: false,
    payment: { status: 'paid', amount: 40000, viaWompi: true },
    cancellation: null,
    ...overrides,
  };
}

/** One item of GET /api/admin/payments/unbooked. */
function makeUnbookedItem(overrides = {}) {
  return {
    reference: 'CALICO-1730000000-abc',
    kind: 'session',
    createdAt: '2026-11-04T12:00:00.000Z',
    student: { name: 'Ana Estudiante', email: 'ana@uniandes.edu.co' },
    tutor: { name: 'Andrés Tutor' },
    course: { code: 'ISIS1221', name: 'Intro a la Programación' },
    event: null,
    slotStart: START,
    amount: 40000,
    transactionId: 'wompi-tx-1',
    sweep: {
      status: 'APPROVED',
      outcome: 'NEEDS_ATTENTION',
      reason: 'SESSION_CONFLICT',
      checkedAt: '2026-11-04T12:30:00.000Z',
    },
    ...overrides,
  };
}

module.exports = {
  START,
  END,
  makeOperationsRow,
  makeUnbookedRow,
  makeSessionItem,
  makeUnbookedItem,
};
