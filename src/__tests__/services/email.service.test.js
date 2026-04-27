/**
 * Unit tests for email.service.js (sendSessionConfirmedEmail — template 7).
 *
 * The email service is a thin wrapper around Brevo's transactional API,
 * so we stub global.fetch and assert the outgoing payload shape.
 */

beforeEach(() => {
  jest.resetModules();
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SENDER_EMAIL = 'no-reply@calico.test';
  process.env.BREVO_SENDER_NAME = 'Calico Test';
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ messageId: 'brevo-1' }),
    }),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('sendSessionConfirmedEmail', () => {
  it('posts to Brevo with templateId=7 and all expected params', async () => {
    const emailService = require('@/lib/services/email.service');

    await emailService.sendSessionConfirmedEmail('tutor@test.co', {
      recipientName: 'Carlos Tutor',
      tutorName: 'Carlos Tutor',
      studentName: 'Laura Estudiante',
      courseName: 'Cálculo 1',
      startTime: '15 de abril, 2026 — 10:00 AM',
      endTime: '15 de abril, 2026 — 11:00 AM',
      meetLink: 'https://meet.google.com/abc-defg-hij',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/sendinblue\.com\/v3\/smtp\/email/);

    const body = JSON.parse(opts.body);
    expect(body.templateId).toBe(7);
    expect(body.to).toEqual([{ email: 'tutor@test.co', name: 'Carlos Tutor' }]);
    expect(body.params).toEqual({
      RECIPIENT_NAME: 'Carlos Tutor',
      TUTOR_NAME: 'Carlos Tutor',
      STUDENT_NAME: 'Laura Estudiante',
      COURSE_NAME: 'Cálculo 1',
      START_TIME: '15 de abril, 2026 — 10:00 AM',
      END_TIME: '15 de abril, 2026 — 11:00 AM',
      MEET_LINK: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('defaults MEET_LINK to empty string when omitted', async () => {
    const emailService = require('@/lib/services/email.service');

    await emailService.sendSessionConfirmedEmail('student@test.co', {
      recipientName: 'Laura',
      tutorName: 'Carlos',
      studentName: 'Laura',
      courseName: 'Física',
      startTime: 'x',
      endTime: 'y',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.params.MEET_LINK).toBe('');
  });

  it('propagates Brevo API errors', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad request'),
      }),
    );

    const emailService = require('@/lib/services/email.service');

    await expect(
      emailService.sendSessionConfirmedEmail('x@test.co', {
        recipientName: 'x',
        tutorName: 'x',
        studentName: 'x',
        courseName: 'x',
        startTime: 'x',
        endTime: 'y',
      }),
    ).rejects.toThrow(/Brevo email failed \(400\)/);
  });
});
