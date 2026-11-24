/**
 * @jest-environment node
 *
 * University email: request a link, confirm it, remove it, and the automatic
 * badge for an already-verified university login email.
 */

jest.mock('@/lib/repositories/university-email.repository', () => ({
  findStatus: jest.fn(),
  findByTokenHash: jest.fn(),
  isTakenByOther: jest.fn(),
  startVerification: jest.fn(),
  clearPending: jest.fn(),
  completeVerification: jest.fn(),
  grantIfNone: jest.fn(),
  remove: jest.fn(),
}));
jest.mock('@/lib/services/email.service', () => ({
  sendUniversityVerificationEmail: jest.fn(),
}));
jest.mock('@/lib/services/notification.service', () => ({
  notifyUniversityVerification: jest.fn(),
}));

const crypto = require('crypto');
const repo = require('@/lib/repositories/university-email.repository');
const { sendUniversityVerificationEmail } = require('@/lib/services/email.service');
const service = require('@/lib/services/university-email.service');
const { notifyUniversityVerification } = require('@/lib/services/notification.service');

const NOW = new Date('2026-11-21T15:00:00.000Z');
const USER = 'user-1';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

const row = (over = {}) => ({
  id: USER,
  name: 'Ana',
  universityEmail: null,
  verifiedUniversity: null,
  universityEmailVerifiedAt: null,
  pendingUniversityEmail: null,
  universityEmailTokenExpiry: null,
  universityEmailSentAt: null,
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  repo.findStatus.mockResolvedValue(row());
  repo.isTakenByOther.mockResolvedValue(false);
  repo.startVerification.mockImplementation(async (id, d) => row({
    pendingUniversityEmail: d.pendingEmail, universityEmailToken: d.tokenHash,
    universityEmailTokenExpiry: d.expiresAt, universityEmailSentAt: d.sentAt,
  }));
  sendUniversityVerificationEmail.mockResolvedValue({ success: true });
});

describe('requestVerification', () => {
  it('stores only the hash of the token and emails the raw one', async () => {
    const status = await service.requestVerification(USER, '  Ana.P@Uniandes.edu.co ', NOW);

    const [, data] = repo.startVerification.mock.calls[0];
    expect(data.pendingEmail).toBe('ana.p@uniandes.edu.co');
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + 24 * 3_600_000));
    const [to, name, token, university] = sendUniversityVerificationEmail.mock.calls[0];
    expect([to, name, university]).toEqual(['ana.p@uniandes.edu.co', 'Ana', 'Universidad de los Andes']);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(data.tokenHash).toBe(sha(token));
    expect(data.tokenHash).not.toBe(token);
    expect(status).toMatchObject({ email: null, pendingEmail: 'ana.p@uniandes.edu.co' });
  });

  it.each([
    ['ana@gmail.com', 'DOMAIN_NOT_ALLOWED'],
    ['ana@alumni.uniandes.edu.co', 'DOMAIN_NOT_ALLOWED'],
    ['not-an-email', 'INVALID_EMAIL'],
  ])('rejects %s (%s)', async (email, code) => {
    await expect(service.requestVerification(USER, email, NOW)).rejects.toMatchObject({ code });
    expect(sendUniversityVerificationEmail).not.toHaveBeenCalled();
  });

  it('rejects an email another account already verified', async () => {
    repo.isTakenByOther.mockResolvedValue(true);
    await expect(service.requestVerification(USER, 'ana@uniandes.edu.co', NOW)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('rejects the email the user already verified', async () => {
    repo.findStatus.mockResolvedValue(row({ universityEmail: 'ana@uniandes.edu.co', verifiedUniversity: 'uniandes' }));
    await expect(service.requestVerification(USER, 'ANA@uniandes.edu.co', NOW)).rejects.toMatchObject({ code: 'ALREADY_VERIFIED' });
  });

  it('makes the user wait between two emails', async () => {
    repo.findStatus.mockResolvedValue(row({ universityEmailSentAt: new Date(NOW.getTime() - 20_000) }));
    await expect(service.requestVerification(USER, 'ana@uniandes.edu.co', NOW))
      .rejects.toMatchObject({ code: 'COOLDOWN', retryAfterSeconds: 40 });
    expect(repo.startVerification).not.toHaveBeenCalled();
  });

  it('reports a Brevo failure as EMAIL_SEND_FAILED', async () => {
    sendUniversityVerificationEmail.mockRejectedValue(new Error('brevo down'));
    await expect(service.requestVerification(USER, 'ana@uniandes.edu.co', NOW)).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED' });
  });
});

describe('verifyToken', () => {
  const pending = (over = {}) => row({
    pendingUniversityEmail: 'ana@uniandes.edu.co',
    universityEmailTokenExpiry: new Date(NOW.getTime() + 3_600_000),
    ...over,
  });

  it('looks the user up by the hash and verifies the pending email', async () => {
    repo.findByTokenHash.mockResolvedValue(pending());
    const result = await service.verifyToken('a'.repeat(64), NOW);

    expect(repo.findByTokenHash).toHaveBeenCalledWith(sha('a'.repeat(64)));
    expect(repo.completeVerification).toHaveBeenCalledWith(USER, {
      email: 'ana@uniandes.edu.co', universityCode: 'uniandes', verifiedAt: NOW,
    });
    expect(result).toEqual({ status: 'success', university: { code: 'uniandes', name: 'Universidad de los Andes', shortName: 'Uniandes' } });
  });

  it('an unknown or reused token is invalid', async () => {
    repo.findByTokenHash.mockResolvedValue(null);
    expect(await service.verifyToken('x'.repeat(64), NOW)).toEqual({ status: 'invalid' });
    expect(await service.verifyToken('', NOW)).toEqual({ status: 'invalid' });
    expect(await service.verifyToken('x'.repeat(200), NOW)).toEqual({ status: 'invalid' });
  });

  it('an expired link is cleared', async () => {
    repo.findByTokenHash.mockResolvedValue(pending({ universityEmailTokenExpiry: new Date(NOW.getTime() - 1) }));
    expect(await service.verifyToken('t', NOW)).toEqual({ status: 'expired' });
    expect(repo.clearPending).toHaveBeenCalledWith(USER);
    expect(repo.completeVerification).not.toHaveBeenCalled();
  });

  it('another account verified the email in between: taken', async () => {
    repo.findByTokenHash.mockResolvedValue(pending());
    repo.isTakenByOther.mockResolvedValue(true);
    expect(await service.verifyToken('t', NOW)).toEqual({ status: 'taken' });
    expect(repo.completeVerification).not.toHaveBeenCalled();
  });

  it('a unique-constraint race is also taken', async () => {
    repo.findByTokenHash.mockResolvedValue(pending());
    repo.completeVerification.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    expect(await service.verifyToken('t', NOW)).toEqual({ status: 'taken' });
    expect(repo.clearPending).toHaveBeenCalledWith(USER);
  });
});

describe('getStatus', () => {
  it('hides an expired pending email and exposes the badge university', async () => {
    repo.findStatus.mockResolvedValue(row({
      universityEmail: 'ana@uniandes.edu.co', verifiedUniversity: 'uniandes', universityEmailVerifiedAt: NOW,
      pendingUniversityEmail: 'old@uniandes.edu.co', universityEmailTokenExpiry: new Date(NOW.getTime() - 1),
    }));
    expect(await service.getStatus(USER, NOW)).toEqual({
      email: 'ana@uniandes.edu.co',
      university: { code: 'uniandes', name: 'Universidad de los Andes', shortName: 'Uniandes' },
      verifiedAt: NOW,
      pendingEmail: null,
      resendAvailableAt: null,
    });
  });
});

describe('grantFromVerifiedLoginEmail', () => {
  it('gives the badge to a verified @uniandes.edu.co login email', async () => {
    repo.grantIfNone.mockResolvedValue(1);
    expect(await service.grantFromVerifiedLoginEmail({ id: USER, email: 'Ana@Uniandes.edu.co' }, NOW)).toBe(true);
    expect(repo.grantIfNone).toHaveBeenCalledWith(USER, { email: 'ana@uniandes.edu.co', universityCode: 'uniandes', verifiedAt: NOW });
  });

  it('skips other domains, users that already have one, and emails taken by another account', async () => {
    expect(await service.grantFromVerifiedLoginEmail({ id: USER, email: 'ana@gmail.com' }, NOW)).toBe(false);
    expect(await service.grantFromVerifiedLoginEmail({ id: USER, email: 'a@uniandes.edu.co', universityEmail: 'b@uniandes.edu.co' }, NOW)).toBe(false);
    repo.isTakenByOther.mockResolvedValue(true);
    expect(await service.grantFromVerifiedLoginEmail({ id: USER, email: 'a@uniandes.edu.co' }, NOW)).toBe(false);
    expect(repo.grantIfNone).not.toHaveBeenCalled();
  });

  it('never throws (a login must not fail because of the badge)', async () => {
    repo.isTakenByOther.mockRejectedValue(new Error('db down'));
    await expect(service.grantFromVerifiedLoginEmail({ id: USER, email: 'a@uniandes.edu.co' }, NOW)).resolves.toBe(false);
  });
});

describe('onAccountVerified (new account just verified)', () => {
  it('a university login email gets the badge, not the invitation', async () => {
    repo.grantIfNone.mockResolvedValue(1);
    await service.onAccountVerified({ id: USER, email: 'ana@uniandes.edu.co' }, NOW);
    expect(repo.grantIfNone).toHaveBeenCalled();
    expect(notifyUniversityVerification).not.toHaveBeenCalled();
  });

  it('anyone else gets the one-time invitation', async () => {
    await service.onAccountVerified({ id: USER, email: 'ana@gmail.com' }, NOW);
    expect(notifyUniversityVerification).toHaveBeenCalledWith(USER);
  });

  it('a university email taken by another account gets neither (no misleading invite)', async () => {
    repo.isTakenByOther.mockResolvedValue(true);
    await service.onAccountVerified({ id: USER, email: 'ana@uniandes.edu.co' }, NOW);
    expect(notifyUniversityVerification).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    notifyUniversityVerification.mockRejectedValue(new Error('db down'));
    await expect(service.onAccountVerified({ id: USER, email: 'ana@gmail.com' }, NOW)).resolves.toBeUndefined();
  });
});
