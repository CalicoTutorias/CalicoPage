/**
 * @jest-environment node
 *
 * secret-box — cifrado en reposo de los tokens de Google Calendar.
 */

const KEY = Buffer.alloc(32, 7).toString('base64');

function loadBox(key) {
  jest.resetModules();
  if (key === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = key;
  return require('@/lib/security/secret-box');
}

describe('secret-box', () => {
  afterAll(() => {
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  it('cifra y descifra con IV distinto en cada llamada', () => {
    const box = loadBox(KEY);
    const a = box.seal('1//refresh-token');
    const b = box.seal('1//refresh-token');

    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(a).not.toContain('refresh-token');
    expect(box.open(a)).toBe('1//refresh-token');
    expect(box.open(b)).toBe('1//refresh-token');
  });

  it('acepta la clave en hex además de base64', () => {
    const box = loadBox(Buffer.alloc(32, 9).toString('hex'));
    expect(box.isSecretBoxConfigured()).toBe(true);
    expect(box.open(box.seal('x'))).toBe('x');
  });

  it('rechaza valores alterados o cifrados con otra clave', () => {
    const box = loadBox(KEY);
    const sealed = box.seal('secreto');
    const [v, iv, tag, data] = sealed.split('.');
    const tampered = [v, iv, tag, data.slice(0, -2) + (data.endsWith('AA') ? 'BB' : 'AA')].join('.');

    expect(() => box.open(tampered)).toThrow(expect.objectContaining({ code: 'SECRET_BOX_INVALID' }));
    expect(() => box.open('v9.a.b.c')).toThrow(expect.objectContaining({ code: 'SECRET_BOX_INVALID' }));

    const other = loadBox(Buffer.alloc(32, 1).toString('base64'));
    expect(() => other.open(sealed)).toThrow(expect.objectContaining({ code: 'SECRET_BOX_INVALID' }));
  });

  it('sin clave (o con una de tamaño incorrecto) no está configurado y seal() falla con código', () => {
    const none = loadBox(undefined);
    expect(none.isSecretBoxConfigured()).toBe(false);
    expect(() => none.seal('x')).toThrow(expect.objectContaining({ code: 'SECRET_BOX_NOT_CONFIGURED' }));

    const short = loadBox('abc');
    expect(short.isSecretBoxConfigured()).toBe(false);
  });
});
