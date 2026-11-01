/**
 * @jest-environment node
 *
 * POST /api/auth/register: the target the verification link lands on reaches
 * the email, and a bad value never blocks a registration.
 */

jest.mock('bcrypt', () => ({ __esModule: true, default: { hash: jest.fn(async () => 'hash') } }));
jest.mock('@/lib/repositories/user.repository', () => ({
  findByEmailWithPassword: jest.fn(),
  create: jest.fn(),
}));
jest.mock('@/lib/services/user.service', () => ({ createVerificationToken: jest.fn(async () => 'tok') }));
jest.mock('@/lib/services/email.service', () => ({ sendVerificationEmail: jest.fn(async () => ({})) }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn(() => null), getClientIp: jest.fn(() => '1.1.1.1') }));

const userRepository = require('@/lib/repositories/user.repository');
const { sendVerificationEmail } = require('@/lib/services/email.service');
const route = require('@/app/api/auth/register/route');

const VALID = { name: 'Ana', email: 'ana@x.co', password: 'Segura-Larga-2026!', terms: true };
const TARGET = '/eventos/repaso-x?asistencia=abc123';

const register = (body) => route.POST(new Request('http://localhost/api/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

beforeEach(() => {
  jest.clearAllMocks();
  userRepository.findByEmailWithPassword.mockResolvedValue(null);
  userRepository.create.mockResolvedValue({ id: 'u1', email: VALID.email });
});

it('passes the target to the verification email', async () => {
  const res = await register({ ...VALID, returnTo: TARGET });
  expect(res.status).toBe(201);
  expect(sendVerificationEmail).toHaveBeenCalledWith(VALID.email, VALID.name, 'tok', { returnTo: TARGET });
});

it('passes it too when re-sending to an unverified account', async () => {
  userRepository.findByEmailWithPassword.mockResolvedValue({ id: 'u1', name: 'Ana', isEmailVerified: false });
  const res = await register({ ...VALID, returnTo: TARGET });
  expect(res.status).toBe(200);
  expect(sendVerificationEmail).toHaveBeenCalledWith(VALID.email, 'Ana', 'tok', { returnTo: TARGET });
});

it.each([[undefined], [null], [42], [{ evil: true }]])('still registers with returnTo = %j', async (returnTo) => {
  const res = await register({ ...VALID, returnTo });
  expect(res.status).toBe(201);
  expect(userRepository.create).toHaveBeenCalled();
});
