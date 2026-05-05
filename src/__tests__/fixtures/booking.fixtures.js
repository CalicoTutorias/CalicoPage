/**
 * Shared fixtures for the Student Booking Module test suite.
 *
 * All builders return plain objects shaped like Prisma rows (post-sanitize where
 * applicable). Pass overrides as a single object — DRY across every test file.
 *
 * Anchor date: Wed 2026-04-15 15:00:00Z = 10:00 America/Bogota (UTC-5).
 * JS Date.getDay() in that zone = 3 (Wednesday).
 */

const ANCHOR_START = new Date('2026-04-15T15:00:00.000Z'); // Wed 10:00 BOG
const ANCHOR_END = new Date('2026-04-15T16:00:00.000Z');   // Wed 11:00 BOG

const TUTOR_TIMEZONE = 'America/Bogota';

// ─── Domain fixtures ────────────────────────────────────────────────

function makeStudent(overrides = {}) {
  return {
    id: 42,
    name: 'Laura Estudiante',
    email: 'laura@test.co',
    profilePictureUrl: null,
    isTutorApproved: false,
    isEmailVerified: true,
    ...overrides,
  };
}

function makeTutor(overrides = {}) {
  return {
    id: 99,
    name: 'Carlos Tutor',
    email: 'carlos@test.co',
    profilePictureUrl: null,
    isTutorApproved: true,
    isEmailVerified: true,
    tutorProfile: {
      userId: 99,
      review: 4.6,    // average rating (TutorProfile.review)
      numReview: 12,  // count
      tutorCourses: [],
    },
    ...overrides,
  };
}

function makeSchedule(overrides = {}) {
  return {
    userId: 99,
    timezone: TUTOR_TIMEZONE,
    bufferTime: 15,
    maxSessionsPerDay: 5,
    autoAcceptSession: false,
    minBookingNotice: 0,
    ...overrides,
  };
}

/** Default block: Wed 09:00–12:00 in tutor's local time. */
function makeAvailabilityBlock(overrides = {}) {
  return {
    id: 'av_1',
    userId: 99,
    dayOfWeek: 3,           // Wednesday
    startTime: '09:00:00',  // string form accepted by service helpers
    endTime: '12:00:00',
    ...overrides,
  };
}

function makeCourse(overrides = {}) {
  return {
    id: 'course-uuid-cal-1',
    name: 'Cálculo I',
    complexity: 'Foundational',
    basePrice: 50000,
    ...overrides,
  };
}

/** Build a session in any status. Default: an upcoming Accepted Individual. */
function makeSession(overrides = {}) {
  return {
    id: 'sess_1',
    tutorId: 99,
    courseId: 'course-uuid-cal-1',
    sessionType: 'Individual',
    maxCapacity: 1,
    status: 'Accepted',
    locationType: 'Virtual',
    notes: null,
    topicsToReview: null,
    startTimestamp: ANCHOR_START,
    endTimestamp: ANCHOR_END,
    googleMeetLink: '',
    googleCalendarEventId: null,
    course: makeCourse(),
    tutor: { id: 99, name: 'Carlos Tutor', email: 'carlos@test.co', profilePictureUrl: null },
    participants: [
      { studentId: 42, student: { id: 42, name: 'Laura', email: 'laura@test.co', profilePictureUrl: null } },
    ],
    reviews: [],
    payments: [],
    ...overrides,
  };
}

function makeReview(overrides = {}) {
  return {
    id: 'rev_1',
    sessionId: 'sess_1',
    studentId: 42,
    tutorId: 99,
    rating: 5,
    status: 'done',
    comment: 'Excelente',
    ...overrides,
  };
}

// ─── Pure helpers under test (regression-pin client/server filters) ─

/**
 * Filter a tutor list by a minimum aggregated rating stored on TutorProfile.review.
 * Tutors with no reviews (numReview === 0) are excluded when minRating > 0.
 */
function filterTutorsByMinRating(tutors, minRating) {
  if (!minRating || minRating <= 0) return tutors;
  return tutors.filter((t) => {
    const profile = t.tutorProfile;
    if (!profile || !profile.numReview) return false;
    return Number(profile.review || 0) >= minRating;
  });
}

/**
 * Subtract booked sessions from a list of weekly availability blocks for a single
 * concrete date, returning gap intervals (HH:MM strings). Used by the slot
 * renderer in the student booking UI.
 *
 * @param {Array<{ startTime: string, endTime: string }>} blocks  HH:MM:SS strings
 * @param {Array<{ startTimestamp: Date, endTimestamp: Date }>} bookedSessions
 * @param {string} timeZone IANA tz, e.g. 'America/Bogota'
 * @param {Date} dayAnchor any Date inside the target local day
 */
function subtractBookedSlots(blocks, bookedSessions, timeZone, dayAnchor) {
  const localTime = (d) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);

  const localDate = (d) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const targetDay = localDate(dayAnchor);
  const dayBookings = bookedSessions
    .filter((s) => localDate(new Date(s.startTimestamp)) === targetDay)
    .map((s) => ({
      start: localTime(new Date(s.startTimestamp)),
      end: localTime(new Date(s.endTimestamp)),
    }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));

  const gaps = [];
  for (const block of blocks) {
    let cursor = block.startTime.slice(0, 5); // HH:MM
    const blockEnd = block.endTime.slice(0, 5);
    for (const b of dayBookings) {
      if (b.end <= cursor || b.start >= blockEnd) continue;
      if (b.start > cursor) gaps.push({ startTime: cursor, endTime: b.start });
      cursor = b.end > cursor ? b.end : cursor;
    }
    if (cursor < blockEnd) gaps.push({ startTime: cursor, endTime: blockEnd });
  }
  return gaps;
}

/** Split a session list into past and upcoming relative to `now`. */
function splitPastUpcoming(sessions, now = new Date()) {
  const past = [];
  const upcoming = [];
  for (const s of sessions) {
    if (new Date(s.endTimestamp) < now) past.push(s);
    else upcoming.push(s);
  }
  return { past, upcoming };
}

module.exports = {
  // anchors
  ANCHOR_START,
  ANCHOR_END,
  TUTOR_TIMEZONE,
  // builders
  makeStudent,
  makeTutor,
  makeSchedule,
  makeAvailabilityBlock,
  makeCourse,
  makeSession,
  makeReview,
  // pure helpers
  filterTutorsByMinRating,
  subtractBookedSlots,
  splitPastUpcoming,
};
