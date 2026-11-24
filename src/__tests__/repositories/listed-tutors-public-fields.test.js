/**
 * The public tutor listing (GET /api/users/tutors, no login) selects an
 * explicit whitelist. It used to return the whole user row: email, phone,
 * payment key (llave) and earnings of every tutor.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { user: { findMany: jest.fn() } },
}));

const prisma = require('@/lib/prisma').default;
const { findAllTutors, findTutorsByCourse } = require('@/lib/repositories/user.repository');

const PRIVATE_USER = ['email', 'phoneNumber', 'phoneNumberNormalized', 'googleId', 'passwordHash', 'role', 'tokenVersion',
  'universityEmail', 'pendingUniversityEmail', 'whatsappTag', 'studentRating'];
const PRIVATE_PROFILE = ['llave', 'totalEarning', 'nextPayment', 'credits', 'schoolEmail'];

function collectKeys(select, out = new Set()) {
  for (const [k, v] of Object.entries(select ?? {})) {
    out.add(k);
    if (v && typeof v === 'object') collectKeys(v.select ?? v, out);
  }
  return out;
}

beforeEach(() => prisma.user.findMany.mockResolvedValue([]));

it.each([
  ['findAllTutors', () => findAllTutors()],
  ['findTutorsByCourse', () => findTutorsByCourse('course-1')],
])('%s uses a select with no private field', async (_, call) => {
  await call();
  const args = prisma.user.findMany.mock.calls.at(-1)[0];
  expect(args.include).toBeUndefined();
  expect(args.select).toBeDefined();
  const userKeys = Object.keys(args.select);
  const profileKeys = Object.keys(args.select.tutorProfile.select);
  for (const k of PRIVATE_USER) expect(userKeys).not.toContain(k);
  for (const k of PRIVATE_PROFILE) expect(profileKeys).not.toContain(k);
  expect(collectKeys(args.select).has('email')).toBe(false);
  // The badge is public: only the university code, never the email.
  expect(args.select.verifiedUniversity).toBe(true);
});
