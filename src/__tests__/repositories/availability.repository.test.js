/**
 * Unit tests — availability.repository
 *
 * Cubre la asimetría lectura/escritura que producía "horarios fantasma": la
 * lectura por tutor truncaba a 50 filas mientras la validación de solapamiento
 * leía todo, así que un bloque podía existir (y bloquear la creación de otro
 * igual) sin pintarse nunca. También el solapamiento por origen y la limpieza
 * de bloques sincronizados.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    availability: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const prisma = require('@/lib/prisma').default;
const repo = require('@/lib/repositories/availability.repository');

function time(hhmm) {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

beforeEach(() => jest.clearAllMocks());

describe('findAvailabilityByUserId', () => {
  it('no trunca por defecto: devuelve todos los bloques del tutor', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await repo.findAvailabilityByUserId('tutor-1');

    const args = prisma.availability.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'tutor-1' });
    expect(args).not.toHaveProperty('take');
    // Orden determinista, también entre bloques de una sola vez del mismo día.
    expect(args.orderBy).toEqual([
      { dayOfWeek: 'asc' },
      { startTime: 'asc' },
      { specificDate: 'asc' },
    ]);
  });

  it('respeta un límite explícito cuando el llamador lo pide', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await repo.findAvailabilityByUserId('tutor-1', 10);

    expect(prisma.availability.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('ignora límites inválidos', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await repo.findAvailabilityByUserId('tutor-1', 0);
    await repo.findAvailabilityByUserId('tutor-1', 'muchos');

    for (const call of prisma.availability.findMany.mock.calls) {
      expect(call[0]).not.toHaveProperty('take');
    }
  });
});

describe('findOverlap', () => {
  it('compara solo contra bloques manuales por defecto', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await repo.findOverlap('tutor-1', 6, time('14:00'), time('19:00'));

    expect(prisma.availability.findMany).toHaveBeenCalledWith({
      where: { userId: 'tutor-1', recurring: true, source: 'manual', dayOfWeek: 6 },
    });
  });

  it('un bloque manual no choca con su copia sincronizada desde Google', async () => {
    // Prisma ya filtra por source; aquí se comprueba que el filtro llega.
    prisma.availability.findMany.mockResolvedValue([]);

    const hit = await repo.findOverlap(
      'tutor-1', 6, time('14:00'), time('19:00'), null,
      { recurring: false, specificDate: new Date('2026-09-19T00:00:00.000Z'), source: 'manual' },
    );

    expect(hit).toBeNull();
    expect(prisma.availability.findMany.mock.calls[0][0].where).toMatchObject({
      recurring: false,
      source: 'manual',
      specificDate: new Date('2026-09-19T00:00:00.000Z'),
    });
  });

  it('detecta el cruce entre bloques del mismo origen', async () => {
    const existing = { id: 'a', startTime: time('13:00'), endTime: time('15:00') };
    prisma.availability.findMany.mockResolvedValue([existing]);

    const hit = await repo.findOverlap('tutor-1', 1, time('14:00'), time('16:00'), null, { source: 'calendar_sync' });

    expect(hit).toBe(existing);
    expect(prisma.availability.findMany.mock.calls[0][0].where.source).toBe('calendar_sync');
  });
});

describe('deleteCalendarSyncedAvailability', () => {
  it('borra solo los bloques calendar_sync del tutor y devuelve cuántos', async () => {
    prisma.availability.deleteMany.mockResolvedValue({ count: 52 });

    const count = await repo.deleteCalendarSyncedAvailability('tutor-1');

    expect(count).toBe(52);
    expect(prisma.availability.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'tutor-1', source: 'calendar_sync' },
    });
  });
});
