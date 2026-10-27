/**
 * @jest-environment node
 *
 * calendar-credential.service — único punto de acceso a los tokens de Google
 * Calendar del tutor. Antes vivían en cookies del navegador (30 días, un solo
 * dispositivo); ahora se persisten cifrados y se renuevan en servidor.
 */

process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

jest.mock('@/lib/repositories/google-calendar-credential.repository', () => ({
  findByUserId: jest.fn(),
  upsert: jest.fn(),
  updateTokens: jest.fn(),
  markRevoked: jest.fn(),
  deleteByUserId: jest.fn(),
  toSummary: jest.fn((row) => (row ? { connectedAt: row.createdAt } : null)),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  refreshAccessToken: jest.fn(),
  revokeToken: jest.fn(),
}));

const repo = require('@/lib/repositories/google-calendar-credential.repository');
const calendarService = require('@/lib/services/calendar.service');
const { seal, open } = require('@/lib/security/secret-box');
const {
  getAccessToken,
  getConnectionStatus,
  saveFromOAuth,
  revoke,
  CalendarAuthError,
  CALENDAR_AUTH_CODES,
} = require('@/lib/services/calendar-credential.service');

const USER = 'tutor-1';
const HOUR = 60 * 60 * 1000;

function row(overrides = {}) {
  return {
    userId: USER,
    refreshTokenEncrypted: seal('refresh-1'),
    accessTokenEncrypted: seal('access-1'),
    accessTokenExpiresAt: new Date(Date.now() + HOUR),
    revokedAt: null,
    createdAt: new Date('2026-08-24T02:08:55Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

describe('saveFromOAuth', () => {
  it('guarda ambos tokens cifrados y la caducidad que informa Google', async () => {
    const expiry = Date.now() + HOUR;
    await saveFromOAuth(USER, {
      refresh_token: 'rt',
      access_token: 'at',
      expiry_date: expiry,
      scope: 'calendar.readonly',
    });

    const [, data] = repo.upsert.mock.calls[0];
    expect(repo.upsert).toHaveBeenCalledWith(USER, expect.any(Object));
    expect(data.refreshTokenEncrypted).not.toContain('rt');
    expect(open(data.refreshTokenEncrypted)).toBe('rt');
    expect(open(data.accessTokenEncrypted)).toBe('at');
    expect(data.accessTokenExpiresAt.getTime()).toBe(expiry);
    expect(data.scope).toBe('calendar.readonly');
  });

  it('sin refresh token no hay conexión durable: falla con REAUTH_REQUIRED', async () => {
    await expect(saveFromOAuth(USER, { access_token: 'at' })).rejects.toMatchObject({
      code: CALENDAR_AUTH_CODES.REAUTH_REQUIRED,
    });
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('getAccessToken', () => {
  it('devuelve el access token guardado mientras siga vigente, sin ir a Google', async () => {
    repo.findByUserId.mockResolvedValue(row());

    await expect(getAccessToken(USER)).resolves.toEqual({ accessToken: 'access-1', refreshed: false });
    expect(calendarService.refreshAccessToken).not.toHaveBeenCalled();
    expect(repo.updateTokens).not.toHaveBeenCalled();
  });

  it('renueva con el refresh token cuando caducó y persiste el nuevo access token', async () => {
    repo.findByUserId.mockResolvedValue(row({ accessTokenExpiresAt: new Date(Date.now() - 1000) }));
    calendarService.refreshAccessToken.mockResolvedValue({ access_token: 'access-2', expiry_date: Date.now() + HOUR });

    await expect(getAccessToken(USER)).resolves.toEqual({ accessToken: 'access-2', refreshed: true });

    expect(calendarService.refreshAccessToken).toHaveBeenCalledWith('refresh-1');
    const [, data] = repo.updateTokens.mock.calls[0];
    expect(open(data.accessTokenEncrypted)).toBe('access-2');
    expect(data.refreshTokenEncrypted).toBeUndefined();
  });

  it('trata un token a punto de caducar (<60 s) como caducado', async () => {
    repo.findByUserId.mockResolvedValue(row({ accessTokenExpiresAt: new Date(Date.now() + 30_000) }));
    calendarService.refreshAccessToken.mockResolvedValue({ access_token: 'access-2' });

    await expect(getAccessToken(USER)).resolves.toMatchObject({ refreshed: true });
  });

  it('si Google rota el refresh token, lo guarda cifrado', async () => {
    repo.findByUserId.mockResolvedValue(row({ accessTokenEncrypted: null, accessTokenExpiresAt: null }));
    calendarService.refreshAccessToken.mockResolvedValue({ access_token: 'a', refresh_token: 'refresh-2' });

    await getAccessToken(USER);

    const [, data] = repo.updateTokens.mock.calls[0];
    expect(open(data.refreshTokenEncrypted)).toBe('refresh-2');
  });

  it('invalid_grant marca la credencial como revocada y pide reconectar', async () => {
    repo.findByUserId.mockResolvedValue(row({ accessTokenExpiresAt: new Date(0) }));
    const err = new Error('invalid_grant: Token has been expired or revoked.');
    err.code = 400;
    calendarService.refreshAccessToken.mockRejectedValue(err);

    await expect(getAccessToken(USER)).rejects.toMatchObject({
      name: 'CalendarAuthError',
      code: CALENDAR_AUTH_CODES.REAUTH_REQUIRED,
    });
    expect(repo.markRevoked).toHaveBeenCalledWith(USER, 'invalid_grant');
  });

  it('un fallo de red al renovar NO revoca la credencial', async () => {
    repo.findByUserId.mockResolvedValue(row({ accessTokenExpiresAt: new Date(0) }));
    calendarService.refreshAccessToken.mockRejectedValue(new Error('ECONNRESET'));

    await expect(getAccessToken(USER)).rejects.toThrow('ECONNRESET');
    expect(repo.markRevoked).not.toHaveBeenCalled();
  });

  it('sin fila → NOT_CONNECTED; fila revocada → REAUTH_REQUIRED', async () => {
    repo.findByUserId.mockResolvedValueOnce(null);
    await expect(getAccessToken(USER)).rejects.toMatchObject({ code: CALENDAR_AUTH_CODES.NOT_CONNECTED });

    repo.findByUserId.mockResolvedValueOnce(row({ revokedAt: new Date() }));
    await expect(getAccessToken(USER)).rejects.toMatchObject({ code: CALENDAR_AUTH_CODES.REAUTH_REQUIRED });
    expect(calendarService.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('sin clave de cifrado en el servidor falla con ENCRYPTION_UNAVAILABLE', async () => {
    const saved = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    require('@/lib/security/secret-box')._resetKeyCache();
    try {
      await expect(getAccessToken(USER)).rejects.toMatchObject({
        code: CALENDAR_AUTH_CODES.ENCRYPTION_UNAVAILABLE,
      });
      expect(repo.findByUserId).not.toHaveBeenCalled();
    } finally {
      process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = saved;
      require('@/lib/security/secret-box')._resetKeyCache();
    }
  });
});

describe('getConnectionStatus', () => {
  it('traduce cada CalendarAuthError a un estado para la UI', async () => {
    repo.findByUserId.mockResolvedValue(row());
    await expect(getConnectionStatus(USER)).resolves.toEqual({
      connected: true,
      status: 'connected',
      refreshed: false,
      connectedAt: new Date('2026-08-24T02:08:55Z'),
    });

    repo.findByUserId.mockResolvedValue(null);
    await expect(getConnectionStatus(USER)).resolves.toMatchObject({ connected: false, status: 'not_connected' });

    repo.findByUserId.mockResolvedValue(row({ revokedAt: new Date() }));
    await expect(getConnectionStatus(USER)).resolves.toMatchObject({ connected: false, status: 'reauth_required' });
  });

  it('propaga errores que no son de autorización', async () => {
    repo.findByUserId.mockRejectedValue(new Error('db down'));
    await expect(getConnectionStatus(USER)).rejects.toThrow('db down');
  });
});

describe('revoke', () => {
  it('revoca en Google con el refresh token descifrado y borra la fila', async () => {
    repo.findByUserId.mockResolvedValue(row());
    repo.deleteByUserId.mockResolvedValue(true);

    await expect(revoke(USER)).resolves.toBe(true);
    expect(calendarService.revokeToken).toHaveBeenCalledWith('refresh-1');
    expect(repo.deleteByUserId).toHaveBeenCalledWith(USER);
  });

  it('borra la fila aunque Google falle, y no llama a Google si ya estaba revocada', async () => {
    repo.findByUserId.mockResolvedValueOnce(row());
    repo.deleteByUserId.mockResolvedValue(true);
    calendarService.revokeToken.mockRejectedValue(new Error('network'));
    await expect(revoke(USER)).resolves.toBe(true);

    repo.findByUserId.mockResolvedValueOnce(row({ revokedAt: new Date() }));
    await revoke(USER);
    expect(calendarService.revokeToken).toHaveBeenCalledTimes(1);
  });

  it('sin credencial no hace nada', async () => {
    repo.findByUserId.mockResolvedValue(null);
    await expect(revoke(USER)).resolves.toBe(false);
    expect(repo.deleteByUserId).not.toHaveBeenCalled();
  });
});

it('CalendarAuthError lleva mensaje legible y código estable', () => {
  const err = new CalendarAuthError(CALENDAR_AUTH_CODES.NOT_CONNECTED);
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toMatch(/Conecta tu Google Calendar/);
});
