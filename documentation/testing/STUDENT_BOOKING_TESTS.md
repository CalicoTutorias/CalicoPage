# Student Booking Module — Test Suite

Comprehensive Jest test coverage for the student-side booking experience. Designed
to be run on every PR via GitHub Actions to prevent regressions in the four core
flows: **tutor search, availability/slot logic, booking creation, and session
history**.

Payment gateways and checkout flows are intentionally excluded — those live in
`src/__tests__/services/wompi.service.test.js` and
`src/__tests__/services/session.service.bookPaid.test.js`.

## File Layout

| File | Type | Tests | What it pins down |
|------|------|-------|-------------------|
| `src/__tests__/fixtures/booking.fixtures.js` | shared | — | DRY builders + 3 pure helpers (`filterTutorsByMinRating`, `subtractBookedSlots`, `splitPastUpcoming`) |
| `src/__tests__/services/tutor-search.test.js` | unit | 14 | Subject filter via `userService.getTutorsByCourse`; rating filter via `filterTutorsByMinRating`; per-day slot subtraction via `subtractBookedSlots` |
| `src/__tests__/services/availability-slots.test.js` | unit | 4 | `availabilityService.getFreeAvailabilityByUserId` only returns active future sessions; HH:MM:SS serialization of Prisma `@db.Time` |
| `src/__tests__/services/booking-create-session.test.js` | unit | 14 | `sessionService.createSession`: status branching (Pending / Accepted / forceAutoAccept), all validation codes, **timezone-correct** availability matching against America/Bogota and America/Mexico_City |
| `src/__tests__/services/session-history.test.js` | unit | 12 | `getSessionsByStudent` passthrough; `getStudentHistory` pending-review backfill for past sessions; `splitPastUpcoming` partitioning |
| `src/__tests__/api/booking-flow.api.test.js` | integration | 10 | `GET /api/users/tutors` (subject filter + self-exclusion), `POST /api/sessions` 403 PAYMENT_REQUIRED guard, `GET /api/sessions` (auth, limit clamp, status validation) |

**Distribution: 70% unit (44) / 30% integration (10) — 54 tests total.**

## Mocking Strategy

Two layers, matching existing tests in this repo:

1. **Service-level units** mock collaborators at the module boundary
   (`@/lib/repositories/...`, `@/lib/services/notification.service`, etc.) so the
   real service logic — validation, time-zone math, status branching — runs
   end-to-end inside the test.
2. **Integration tests** mock `@/lib/prisma` (singleton) and `@/lib/auth/middleware`,
   then exercise the actual route handler → service → repository chain.

Fixtures are centralized in `src/__tests__/fixtures/booking.fixtures.js` and
imported by every test file. **Never duplicate a tutor/session/schedule shape
inline** — extend a fixture builder.

## Running the Suite

### Run only the student-booking tests

```bash
npm test -- --testPathPattern='__tests__/(services/(tutor-search|availability-slots|booking-create-session|session-history)|api/booking-flow)'
```

### Run a single file

```bash
npm test -- src/__tests__/services/booking-create-session.test.js
```

### Filter by test name (descriptive `test_should_*` style is used throughout)

```bash
npm test -- -t "test_should_fail_when_booking_an_already_occupied_slot"
```

### Watch mode while iterating

```bash
npm run test:watch -- --testPathPattern=booking
```

### CI mode (the runner GitHub Actions should call)

```bash
npm run test:ci -- --testPathPattern='__tests__/(services|api)/.*'
```

## GitHub Actions

Drop into `.github/workflows/test.yml` (or extend an existing job):

```yaml
name: tests
on:
  pull_request:
  push:
    branches: [main]

jobs:
  jest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm run db:generate    # required: tests import from @/generated/prisma
      - run: npm run test:ci
```

Prisma must be generated before Jest runs because `@/lib/prisma` and the
repositories import the generated client. No live database is needed — every
Prisma call is mocked.

## What's NOT Covered (and Why)

- **Payment / Wompi flows** — explicitly out of scope per spec; covered by
  `wompi.service.test.js` and `session.service.bookPaid.test.js`.
- **Cross-tutor "find tutors free at time T"** — does not exist as a server-side
  endpoint today. The closest primitive is `getFreeAvailabilityByUserId` per
  tutor, which IS tested. If a multi-tutor search endpoint is added, extend
  `tutor-search.test.js`.
- **Frontend React components** (`BuscarTutores`, `AvailabilityCalendar`) — UI
  rendering tests can build on the same fixtures; out of scope for this iteration.

## Adding a New Test

1. Reuse fixtures from `booking.fixtures.js` — add a builder there if missing.
2. Mock dependencies at the **module** boundary (`jest.mock('@/lib/...')`), not
   at the function boundary.
3. Use the `test_should_<verb>_<condition>` naming pattern. Names are searched
   directly in CI failure logs — make them precise.
4. For new API routes, mock `@/lib/prisma` + `@/lib/auth/middleware` and import
   the handler with `require('@/app/api/.../route')`. Set
   `@jest-environment node` at the top of the file.
5. **Always** await `params` as `Promise.resolve({ id: '...' })` — Next.js 15
   contract.
