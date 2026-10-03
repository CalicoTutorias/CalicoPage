/** @jest-environment node */

jest.mock('@sentry/nextjs', () => ({
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const user = { email: 'a@uniandes.edu.co', name: 'Ana Perez' };

beforeEach(() => {
  jest.resetModules();
  process.env.BREVO_API_KEY = 'key';
  process.env.BREVO_SENDER_EMAIL = 'no-reply@calico.test';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('sendEventEmail', () => {
  it('rejects with EMAIL_TEMPLATE_NOT_CONFIGURED while the template ID is null', async () => {
    const svc = await import('@/lib/services/email.service');
    await expect(
      svc.sendEventEmail(svc.EVENT_EMAIL.REMINDER, { to: user, params: {} })
    ).rejects.toMatchObject({ code: 'EMAIL_TEMPLATE_NOT_CONFIGURED' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends templateId, params and the attachment when the template is configured', async () => {
    const svc = await import('@/lib/services/email.service');
    svc.__setTemplateIdForTests('EVENT_REMINDER', 99);
    expect(svc.isEventEmailConfigured('EVENT_REMINDER')).toBe(true);
    const attachment = [{ name: 'evento.ics', content: 'QUJD' }];
    await svc.sendEventEmail(svc.EVENT_EMAIL.REMINDER, { to: user, params: { NAME: 'Ana' }, attachment });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.templateId).toBe(99);
    expect(body.params).toEqual({ NAME: 'Ana' });
    expect(body.attachment).toEqual(attachment);
  });

  it('omits the attachment key when none is given', async () => {
    const svc = await import('@/lib/services/email.service');
    svc.__setTemplateIdForTests('EVENT_REMINDER', 99);
    await svc.sendEventEmail(svc.EVENT_EMAIL.REMINDER, { to: user, params: {} });
    expect('attachment' in JSON.parse(global.fetch.mock.calls[0][1].body)).toBe(false);
  });
});

describe('existing senders', () => {
  it('sendSessionConfirmedEmail sends no attachment key', async () => {
    const svc = await import('@/lib/services/email.service');
    await svc.sendSessionConfirmedEmail('a@uniandes.edu.co', {
      recipientName: 'Ana',
      tutorName: 'T',
      studentName: 'S',
      courseName: 'C',
      startTime: new Date(),
      endTime: new Date(),
      meetLink: 'https://meet.google.com/x',
    });
    expect(global.fetch).toHaveBeenCalled();
    expect('attachment' in JSON.parse(global.fetch.mock.calls[0][1].body)).toBe(false);
  });
});
