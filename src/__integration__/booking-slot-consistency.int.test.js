/**
 * Property: every slot the individual booking calendar offers is accepted by
 * the server, and none collides with an existing booking (± buffer).
 *
 * Guards the "charged, no session" class of bug: the UI offered a slot, the
 * student paid, and the booking rules rejected it.
 *
 * Both sides run their real code against a real Postgres:
 *  - server: availability blocks written through POST /api/availabilities and
 *    POST /api/availabilities/sync-from-calendar (stored Google credential,
 *    real calendar-credential.service), the GET /api/availabilities route the
 *    calendar calls, assertSlotBookable (create-intent's pre-charge check) and
 *    POST /api/payments/create-intent;
 *  - browser: AvailabilityService + SlotService turn the route's JSON into
 *    1-hour slots, routes.BOOK_SESSION carries them to the booking page.
 * Only Google Calendar's API (calendars + events feed) and the HTTP transport
 * are faked.
 *
 * Timezones: production runs on Vercel in UTC while a Colombian student's
 * device is in America/Bogota, and both sides build Dates from wall-clock
 * strings, so each phase runs in its own zone.
 */
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import * as calendarService from '@/lib/services/calendar.service';
import { saveFromOAuth } from '@/lib/services/calendar-credential.service';
import { assertSlotBookable } from '@/lib/services/session.service';
import { JOINT_AVAILABILITY_ENABLED } from '@/lib/feature-flags';
import { GET as getAvailabilities, POST as postAvailability } from '@/app/api/availabilities/route';
import { POST as syncFromCalendar } from '@/app/api/availabilities/sync-from-calendar/route';
import { POST as createIntent } from '@/app/api/payments/create-intent/route';
import { AvailabilityService } from '@/app/services/core/AvailabilityService';
import { SlotService } from '@/app/services/utils/SlotService';
import routes from '@/routes';
import {
  resetEventData,
  createUser,
  createCourse,
  createTutor,
  createSession,
  offerCourse,
  authHeaders,
} from './helpers/factory';

// The tutor's Google Calendar API (external service). listCalendars only
// gates the real sync; listEvents is set per test. The stored access token is
// fresh, so a refresh against Google would be a test bug: it throws.
jest.mock('@/lib/services/calendar.service', () => ({
  listCalendars: jest.fn(async () => [{ id: 'disponibilidad@group.calendar.google.com', summary: 'Disponibilidad' }]),
  listEvents: jest.fn(),
  refreshAccessToken: jest.fn(async () => {
    throw new Error('unexpected Google token refresh in the integration test');
  }),
}));

// calendar-credential.service seals the Google tokens at rest (secret-box
// reads the key lazily, on first use). A dummy 32-byte key.
process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

// The booking rule's start-minute marks. Private constants in session.service
// and availability.service (not exported), so copied here.
const ALLOWED_SLOT_MINUTES = new Set([0, 10, 20, 30, 40, 45, 50]);

const BOGOTA = 'America/Bogota';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BOGOTA_OFFSET_MS = 5 * HOUR_MS; // UTC-5 all year (no DST)

// Jest hands each test file a COPY of process.env, so `process.env.TZ = …`
// here changes nothing. Node re-reads the zone only when the real
// process.env.TZ is assigned; vm.runInThisContext evaluates in Jest's outer
// context, whose `process` is the real one. The zone is per V8 isolate, so
// the Dates of this sandbox follow it.
const realEnv = vm.runInThisContext('process').env;
const ORIGINAL_TZ = realEnv.TZ;

function setTimeZone(tz) {
  realEnv.TZ = tz;
  // Fails loudly instead of silently testing in the wrong zone.
  expect(new Date().getTimezoneOffset()).toBe(tz === BOGOTA ? 300 : 0);
}

/** "YYYY-MM-DD" of the Bogota calendar day `offset` days from today. */
const bogotaDate = (offset) => new Date(Date.now() - BOGOTA_OFFSET_MS + offset * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (isoDate) => new Date(`${isoDate}T12:00:00Z`).getUTCDay();
const bogotaInstant = (isoDate, hhmm) => new Date(`${isoDate}T${hhmm}:00-05:00`);

/** Bogota day and "HH:MM" of an ISO instant. */
function bogotaWallClock(iso) {
  const local = new Date(new Date(iso).getTime() - BOGOTA_OFFSET_MS).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
}

/** A timed Google Calendar event as listEvents returns it with `timeZone: America/Bogota`. */
function googleEvent(isoDate, start, end, extra = {}) {
  return {
    id: randomUUID(),
    status: 'confirmed',
    start: { dateTime: `${isoDate}T${start}:00-05:00`, timeZone: BOGOTA },
    end: { dateTime: `${isoDate}T${end}:00-05:00`, timeZone: BOGOTA },
    ...extra,
  };
}

/** A manual block, created through POST /api/availabilities with the tutor's token. */
async function addBlock(tutor, block) {
  const res = await postAvailability(
    new Request('http://localhost/api/availabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(tutor) },
      body: JSON.stringify(block),
    }),
  );
  expect(res.status).toBe(201);
}

/**
 * The tutor's Google "Disponibilidad" calendar synced in "available" mode
 * through POST /api/availabilities/sync-from-calendar, as the tutor dashboard
 * does. The Google connection is stored like the OAuth callback stores it.
 */
async function syncGoogleCalendar(tutor, events) {
  await saveFromOAuth(tutor.id, {
    refresh_token: 'google-refresh-token',
    access_token: 'google-access-token',
    expiry_date: Date.now() + 3_600_000,
  });
  calendarService.listEvents.mockResolvedValue(events);
  const res = await syncFromCalendar(
    new Request('http://localhost/api/availabilities/sync-from-calendar', {
      method: 'POST',
      headers: authHeaders(tutor),
    }),
  );
  expect(res.status).toBe(200);
  // The events were read with the stored token, in the tutor's zone.
  expect(calendarService.listEvents).toHaveBeenCalledWith(
    'google-access-token',
    'disponibilidad@group.calendar.google.com',
    expect.any(String),
    expect.any(String),
    { timeZone: BOGOTA },
  );
  return res.json();
}

/**
 * The slots the individual booking calendar (AvailabilityCalendar.jsx,
 * mode="individual") offers for `tutor`, each as the timestamps the booking
 * page sends to create-intent.
 */
async function offeredSlots(tutor, student, course) {
  // Server (Vercel, UTC): the route behind AvailabilityService.getAvailabilitiesWithBookings.
  // It is public; the browser still sends the logged-in student's token.
  setTimeZone('UTC');
  const res = await getAvailabilities(
    new Request(`http://localhost/api/availabilities?userId=${tutor.id}`, { headers: authHeaders(student) }),
  );
  expect(res.status).toBe(200);
  const payload = await res.json();

  // Browser (Colombian student). Only the transport is replaced: fetch
  // answers with the route's JSON.
  setTimeZone(BOGOTA);
  const transport = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(payload), { status: 200 }));
  try {
    const { slots, bookedSessions, bufferMinutes } = await AvailabilityService.getAvailabilitiesWithBookings(tutor.id);
    expect(transport).toHaveBeenCalledWith(`/api/availabilities?userId=${tutor.id}`, expect.any(Object));

    // Copy of AvailabilityCalendar.jsx generateSlotsForSelectedDay: the
    // buffer marking lives inline in the component and is not exported.
    const bufferMs = bufferMinutes * 60_000;
    const generatedSlots = SlotService.generateHourlySlotsFromAvailabilities(slots);
    const slotsWithBookings = generatedSlots.map((slot) => {
      const slotStart = new Date(slot.startDateTime);
      const slotEnd = new Date(slot.endDateTime);
      const isBooked = bookedSessions.some((s) => {
        const bufferedStart = new Date(new Date(s.startTimestamp).getTime() - bufferMs);
        const bufferedEnd = new Date(new Date(s.endTimestamp).getTime() + bufferMs);
        return slotStart < bufferedEnd && bufferedStart < slotEnd;
      });
      return isBooked ? { ...slot, isBooked: true } : slot;
    });
    const availableSlots = SlotService.getAvailableSlots(slotsWithBookings);

    return availableSlots.map((slot) => {
      // handleSlotSelect → booking page URL → BookingForm: new Date(param).toISOString().
      const url = new URL(
        routes.BOOK_SESSION({
          tutorId: tutor.id,
          courseId: course.id,
          start: slot.startDateTime,
          end: slot.endDateTime,
          slotId: slot.id,
          slotIndex: slot.slotIndex,
          parentAvailabilityId: slot.parentAvailabilityId,
        }),
        'http://localhost',
      );
      const startTimestamp = new Date(url.searchParams.get('start')).toISOString();
      const endTimestamp = new Date(url.searchParams.get('end')).toISOString();
      const block = payload.availabilities.find((b) => slot.parentAvailabilityId.startsWith(`${b.id}-`));
      return { startTimestamp, endTimestamp, source: block.source, ...bogotaWallClock(startTimestamp) };
    });
  } finally {
    transport.mockRestore();
    setTimeZone('UTC');
  }
}

/** POST /api/payments/create-intent with the body BookingForm sends. */
function postCreateIntent(student, tutor, course, slot) {
  return createIntent(
    new Request('http://localhost/api/payments/create-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(student) },
      body: JSON.stringify({
        tutorId: tutor.id,
        studentId: student.id,
        courseId: course.id,
        amount: 5_000_000,
        durationMinutes: 60,
        startTimestamp: slot.startTimestamp,
        endTimestamp: slot.endTimestamp,
        topicsToReview: 'Integrales por partes',
        attachments: [],
      }),
    }),
  );
}

beforeEach(async () => {
  setTimeZone('UTC');
  await resetEventData();
});

afterAll(async () => {
  if (ORIGINAL_TZ === undefined) delete realEnv.TZ;
  else realEnv.TZ = ORIGINAL_TZ;
  await prisma.$disconnect();
});

describe('booking calendar ↔ server slot consistency (real Postgres)', () => {
  it('test_should_accept_every_slot_the_booking_calendar_offers_in_the_next_14_days', async () => {
    const D = bogotaDate;
    const tutor = await createTutor({ schedule: { timezone: BOGOTA, bufferTime: 15 } });
    const student = await createUser();
    const [otherA, otherB, otherC] = [await createUser(), await createUser(), await createUser()];
    const course = await createCourse();
    await offerCourse(tutor, course);

    // Manual weekly grid: three weekdays, morning and afternoon (ends at :30).
    for (const k of [2, 3, 4]) {
      await addBlock(tutor, { dayOfWeek: weekdayOf(D(k)), startTime: '08:00', endTime: '12:00' });
      await addBlock(tutor, { dayOfWeek: weekdayOf(D(k)), startTime: '14:00', endTime: '17:30' });
    }
    // One-off evening block: from 19:00 Bogota it is already the next UTC day.
    await addBlock(tutor, { recurring: false, specificDate: D(5), startTime: '18:00', endTime: '20:00' });

    // Google "Disponibilidad" calendar, synced in "available" mode.
    const sync = await syncGoogleCalendar(tutor, [
      googleEvent(D(6), '09:15', '11:15'), // odd minutes → 09:20–11:10
      googleEvent(D(6), '14:05', '16:00'), // → 14:10–16:00
      googleEvent(D(7), '10:55', '11:55'), // → 11:00–11:50, under 1h: no block
      googleEvent(D(1), '07:35', '10:05', { recurringEventId: 'weekly-review' }), // → weekly 07:40–10:00
      googleEvent(D(8), '07:35', '10:05', { recurringEventId: 'weekly-review' }),
      googleEvent(D(7), '08:00', '10:00', { status: 'cancelled' }),
      { id: 'all-day', status: 'confirmed', start: { date: D(7) }, end: { date: D(8) } },
    ]);
    expect(sync.mode).toBe('available');
    expect(sync.total).toBeGreaterThan(0);

    // Bookings by other students: on the grid, off the grid (10:30) and a
    // cancelled one that must not hide anything.
    await createSession({ tutor, student: otherA, course, start: bogotaInstant(D(2), '09:00') });
    await createSession({ tutor, student: otherB, course, start: bogotaInstant(D(3), '15:00') });
    await createSession({ tutor, student: otherC, course, start: bogotaInstant(D(9), '10:30') });
    await createSession({ tutor, student: otherA, course, start: bogotaInstant(D(4), '08:00'), status: 'Canceled' });

    const offered = (await offeredSlots(tutor, student, course)).filter((s) => s.day <= D(13));

    // (i) Not vacuous: ~42 slots are expected in this window.
    expect(offered.length).toBeGreaterThanOrEqual(30);

    // (ii) The server (UTC) accepts every one of them with create-intent's
    // pre-charge check (every booking rule, strict, plus the overlap check).
    setTimeZone('UTC');
    const rejected = [];
    for (const slot of offered) {
      try {
        await assertSlotBookable(student.id, {
          tutorId: tutor.id,
          courseId: course.id,
          startTimestamp: slot.startTimestamp,
          endTimestamp: slot.endTimestamp,
        });
      } catch (err) {
        rejected.push(`${slot.day} ${slot.time} (${slot.source}): ${err.code}`);
      }
    }
    expect(rejected).toEqual([]);

    // (iii) None collides with an active booking ± the 15 min buffer.
    const bufferMs = 15 * 60_000;
    const active = await prisma.session.findMany({
      where: { tutorId: tutor.id, status: { notIn: ['Rejected', 'Canceled'] } },
    });
    const collisions = offered.filter((slot) =>
      active.some(
        (s) =>
          new Date(slot.startTimestamp).getTime() < s.endTimestamp.getTime() + bufferMs &&
          s.startTimestamp.getTime() - bufferMs < new Date(slot.endTimestamp).getTime(),
      ),
    );
    expect(collisions).toEqual([]);

    // (iv) Odd-minute Google events only yield slots on the allowed marks.
    const fromGoogle = offered.filter((s) => s.source === 'calendar_sync');
    expect(fromGoogle.map((s) => `${s.day} ${s.time}`).sort()).toEqual(
      [
        `${D(1)} 07:40`,
        `${D(1)} 08:40`,
        `${D(6)} 09:20`,
        `${D(6)} 14:10`,
        `${D(8)} 07:40`,
        `${D(8)} 08:40`,
      ].sort(),
    );
    for (const slot of fromGoogle) expect(ALLOWED_SLOT_MINUTES.has(Number(slot.time.slice(3)))).toBe(true);
  });

  it('test_should_refuse_before_any_charge_a_slot_on_a_day_at_the_daily_cap', async () => {
    const tutor = await createTutor({ schedule: { timezone: BOGOTA, bufferTime: 15, maxSessionsPerDay: 2 } });
    const student = await createUser();
    const course = await createCourse();
    await offerCourse(tutor, course);
    const cappedDay = bogotaDate(3);
    const sameWeekdayLater = bogotaDate(10);
    await addBlock(tutor, { dayOfWeek: weekdayOf(cappedDay), startTime: '08:00', endTime: '14:00' });
    await createSession({ tutor, student: await createUser(), course, start: bogotaInstant(cappedDay, '08:00') });
    await createSession({ tutor, student: await createUser(), course, start: bogotaInstant(cappedDay, '12:00') });

    const offered = await offeredSlots(tutor, student, course);

    // Known gap: the calendar does not account for maxSessionsPerDay (GET
    // /api/availabilities does not return it), so a day already at the cap
    // still shows its free hours. No guarantee is claimed for the UI here;
    // what must hold is the safety net below. If the calendar learns the
    // cap, this precondition fails: move the case into the property above.
    const onCappedDay = offered.filter((s) => s.day === cappedDay);
    expect(onCappedDay.length).toBeGreaterThan(0);

    for (const slot of onCappedDay) {
      const res = await postCreateIntent(student, tutor, course, slot);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ success: false, error: 'MAX_SESSIONS_REACHED' });
    }
    // No payment intent: nothing the Wompi widget could charge.
    expect(await prisma.paymentIntent.count()).toBe(0);

    // Control: the same hour a week later is under the cap and opens a checkout.
    const control = offered.find((s) => s.day === sameWeekdayLater && s.time === onCappedDay[0].time);
    const res = await postCreateIntent(student, tutor, course, control);
    expect(res.status).toBe(200);
    const { intent } = await res.json();
    expect(await prisma.paymentIntent.findUnique({ where: { reference: intent.reference } })).not.toBeNull();
  });

  it('test_should_keep_the_joint_availability_entry_disabled', () => {
    // Joint availability shows other students' booked slots as free until it
    // is computed server-side.
    expect(JOINT_AVAILABILITY_ENABLED).toBe(false);
  });
});
