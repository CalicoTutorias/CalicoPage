/**
 * @jest-environment node
 *
 * The verification link: it carries where to land after confirming, because
 * the email is often opened in a browser without the pending-booking handoff.
 */

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn(), captureMessage: jest.fn(), withScope: jest.fn() }));

const ORIGINAL_ENV = process.env;

function linkFromLastCall() {
  return JSON.parse(global.fetch.mock.calls[0][1].body).params.VERIFICATION_LINK;
}

describe('sendVerificationEmail', () => {
  let sendVerificationEmail;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      BREVO_API_KEY: 'test-key',
      BREVO_SENDER_EMAIL: 'hola@calico-tutorias.com',
      NEXT_PUBLIC_APP_URL: 'https://calico-tutorias.com',
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    ({ sendVerificationEmail } = require('@/lib/services/email.service'));
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('without a target, the link only carries the token', async () => {
    await sendVerificationEmail('a@x.co', 'Ana', 'tok en');
    expect(linkFromLastCall()).toBe('https://calico-tutorias.com/auth/confirm-email?token=tok%20en');
  });

  it('carries a same-origin target, query string included', async () => {
    await sendVerificationEmail('a@x.co', 'Ana', 'tok', { returnTo: '/eventos/repaso-x?asistencia=abc123' });

    const link = new URL(linkFromLastCall());
    expect(link.pathname).toBe('/auth/confirm-email');
    expect(link.searchParams.get('token')).toBe('tok');
    expect(link.searchParams.get('returnTo')).toBe('/eventos/repaso-x?asistencia=abc123');
  });

  it.each([
    ['https://evil.example/phish'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['/auth/login'],
    [42],
  ])('drops the unsafe target %j', async (returnTo) => {
    await sendVerificationEmail('a@x.co', 'Ana', 'tok', { returnTo });
    expect(new URL(linkFromLastCall()).searchParams.has('returnTo')).toBe(false);
  });
});
