/**
 * Unit tests — Tutor Search (subject / availability / rating filters)
 *
 * Covers:
 *   - userService.getAllTutors / getTutorsByCourse  (subject filter at repo)
 *   - filterTutorsByMinRating                       (rating filter, pure)
 *   - splitPastUpcoming + subtractBookedSlots       (availability/slot logic)
 *
 * Strategy: mock @/lib/repositories/user.repository at the boundary so we
 * exercise the real service code paths.
 */

jest.mock('@/lib/repositories/user.repository', () => ({
  findAllTutors: jest.fn(),
  findTutorsByCourse: jest.fn(),
}));

const userRepo = require('@/lib/repositories/user.repository');
const userService = require('@/lib/services/user.service');

const {
  makeTutor,
  makeSession,
  makeAvailabilityBlock,
  filterTutorsByMinRating,
  subtractBookedSlots,
  ANCHOR_START,
  TUTOR_TIMEZONE,
} = require('../fixtures/booking.fixtures');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Subject filter (real service) ──────────────────────────────────

describe('userService.getTutorsByCourse — subject filter', () => {
  it('test_should_call_repository_with_courseId_and_default_limit', async () => {
    userRepo.findTutorsByCourse.mockResolvedValue([]);

    await userService.getTutorsByCourse('course-uuid-cal-1');

    expect(userRepo.findTutorsByCourse).toHaveBeenCalledWith('course-uuid-cal-1', 50);
  });

  it('test_should_return_success_envelope_with_count_matching_array_length', async () => {
    const tutors = [makeTutor({ id: 1 }), makeTutor({ id: 2 })];
    userRepo.findTutorsByCourse.mockResolvedValue(tutors);

    const result = await userService.getTutorsByCourse('course-uuid-cal-1', 25);

    expect(userRepo.findTutorsByCourse).toHaveBeenCalledWith('course-uuid-cal-1', 25);
    expect(result).toEqual({ success: true, tutors, count: 2 });
  });

  it('test_should_return_empty_list_when_no_tutor_offers_the_subject', async () => {
    userRepo.findTutorsByCourse.mockResolvedValue([]);

    const result = await userService.getTutorsByCourse('course-uuid-unknown');

    expect(result).toEqual({ success: true, tutors: [], count: 0 });
  });
});

describe('userService.getAllTutors', () => {
  it('test_should_default_limit_to_100_when_not_specified', async () => {
    userRepo.findAllTutors.mockResolvedValue([makeTutor()]);

    await userService.getAllTutors();

    expect(userRepo.findAllTutors).toHaveBeenCalledWith(100);
  });

  it('test_should_propagate_custom_limit_to_repository', async () => {
    userRepo.findAllTutors.mockResolvedValue([]);

    await userService.getAllTutors(7);

    expect(userRepo.findAllTutors).toHaveBeenCalledWith(7);
  });
});

// ─── Rating filter (pure helper, regression-pinned) ────────────────

describe('filterTutorsByMinRating — rating filter', () => {
  const tutors = [
    makeTutor({ id: 1, tutorProfile: { review: 4.9, numReview: 30 } }),
    makeTutor({ id: 2, tutorProfile: { review: 3.5, numReview: 10 } }),
    makeTutor({ id: 3, tutorProfile: { review: 0,   numReview: 0  } }), // never reviewed
    makeTutor({ id: 4, tutorProfile: null }),                            // no profile
    makeTutor({ id: 5, tutorProfile: { review: 4.0, numReview: 1  } }),
  ];

  it('test_should_return_input_unchanged_when_minRating_is_zero_or_falsy', () => {
    expect(filterTutorsByMinRating(tutors, 0)).toBe(tutors);
    expect(filterTutorsByMinRating(tutors, undefined)).toBe(tutors);
  });

  it('test_should_keep_only_tutors_with_review_at_or_above_threshold', () => {
    const result = filterTutorsByMinRating(tutors, 4.0);
    expect(result.map((t) => t.id)).toEqual([1, 5]);
  });

  it('test_should_exclude_tutors_with_zero_reviews_when_threshold_positive', () => {
    const result = filterTutorsByMinRating(tutors, 0.5);
    expect(result.map((t) => t.id)).toEqual([1, 2, 5]);
    expect(result.find((t) => t.id === 3)).toBeUndefined();
  });

  it('test_should_exclude_tutors_with_missing_profile', () => {
    const result = filterTutorsByMinRating(tutors, 1);
    expect(result.find((t) => t.id === 4)).toBeUndefined();
  });
});

// ─── Availability filter (pure helper) ──────────────────────────────

describe('subtractBookedSlots — availability filter', () => {
  const block = makeAvailabilityBlock({ startTime: '09:00:00', endTime: '12:00:00' });

  it('test_should_remove_a_booked_session_from_the_middle_of_a_block', () => {
    const booked = [
      makeSession({
        startTimestamp: new Date('2026-04-15T15:00:00.000Z'), // 10:00 BOG
        endTimestamp: new Date('2026-04-15T16:00:00.000Z'),   // 11:00 BOG
      }),
    ];

    const slots = subtractBookedSlots([block], booked, TUTOR_TIMEZONE, ANCHOR_START);

    expect(slots).toEqual([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '11:00', endTime: '12:00' },
    ]);
  });

  it('test_should_return_full_block_when_no_sessions_fall_inside', () => {
    const slots = subtractBookedSlots([block], [], TUTOR_TIMEZONE, ANCHOR_START);
    expect(slots).toEqual([{ startTime: '09:00', endTime: '12:00' }]);
  });

  it('test_should_swallow_block_completely_when_a_session_covers_it', () => {
    const booked = [
      makeSession({
        startTimestamp: new Date('2026-04-15T14:00:00.000Z'), // 09:00 BOG
        endTimestamp: new Date('2026-04-15T17:00:00.000Z'),   // 12:00 BOG
      }),
    ];
    const slots = subtractBookedSlots([block], booked, TUTOR_TIMEZONE, ANCHOR_START);
    expect(slots).toEqual([]);
  });

  it('test_should_ignore_sessions_on_a_different_local_day', () => {
    const booked = [
      makeSession({
        // Tuesday in Bogota — different local day
        startTimestamp: new Date('2026-04-14T15:00:00.000Z'),
        endTimestamp: new Date('2026-04-14T16:00:00.000Z'),
      }),
    ];
    const slots = subtractBookedSlots([block], booked, TUTOR_TIMEZONE, ANCHOR_START);
    expect(slots).toEqual([{ startTime: '09:00', endTime: '12:00' }]);
  });

  it('test_should_handle_back_to_back_sessions_without_emitting_zero_length_gap', () => {
    const booked = [
      makeSession({
        id: 's-a',
        startTimestamp: new Date('2026-04-15T14:00:00.000Z'), // 09:00
        endTimestamp: new Date('2026-04-15T15:00:00.000Z'),   // 10:00
      }),
      makeSession({
        id: 's-b',
        startTimestamp: new Date('2026-04-15T15:00:00.000Z'), // 10:00
        endTimestamp: new Date('2026-04-15T16:00:00.000Z'),   // 11:00
      }),
    ];
    const slots = subtractBookedSlots([block], booked, TUTOR_TIMEZONE, ANCHOR_START);
    expect(slots).toEqual([{ startTime: '11:00', endTime: '12:00' }]);
  });
});
