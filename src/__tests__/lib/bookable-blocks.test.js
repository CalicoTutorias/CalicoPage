/**
 * Unit tests — bookable-blocks helpers
 *
 * Única fuente de verdad de dos reglas:
 *   1. En modo «eventos = ocupado» los bloques manuales son la base de la
 *      resta y NO se publican; solo cuentan los `calendar_sync`.
 *   2. Un bloque recurrente aplica cada semana en su dayOfWeek; uno de una
 *      sola vez, solo en su specificDate.
 */

const {
  selectBookableBlocks,
  blockAppliesToDate,
  isBaseBlock,
  isBusySyncMode,
  specificDateToIso,
} = require('@/lib/availability/bookable-blocks');

const manual = { id: 'm1', source: 'manual', dayOfWeek: 1, recurring: true };
const synced = { id: 's1', source: 'calendar_sync', dayOfWeek: 1, recurring: false, specificDate: '2026-09-07' };
const legacy = { id: 'l1', dayOfWeek: 1 }; // fila anterior a las columnas source/recurring

describe('selectBookableBlocks', () => {
  it('en modo disponible (o sin schedule) publica todos los bloques', () => {
    expect(selectBookableBlocks([manual, synced, legacy], null)).toEqual([manual, synced, legacy]);
    expect(selectBookableBlocks([manual, synced], { calendarSyncMode: 'available' })).toEqual([manual, synced]);
  });

  it('en modo ocupado descarta los manuales (base) y conserva los sincronizados', () => {
    expect(selectBookableBlocks([manual, synced, legacy], { calendarSyncMode: 'busy' })).toEqual([synced]);
  });

  it('tolera entradas que no son arrays', () => {
    expect(selectBookableBlocks(undefined, { calendarSyncMode: 'busy' })).toEqual([]);
  });
});

describe('isBaseBlock / isBusySyncMode', () => {
  it('solo un manual en modo ocupado es base', () => {
    expect(isBusySyncMode({ calendarSyncMode: 'busy' })).toBe(true);
    expect(isBusySyncMode({ calendarSyncMode: 'available' })).toBe(false);
    expect(isBusySyncMode(undefined)).toBe(false);
    expect(isBaseBlock(manual, { calendarSyncMode: 'busy' })).toBe(true);
    expect(isBaseBlock(legacy, { calendarSyncMode: 'busy' })).toBe(true);
    expect(isBaseBlock(synced, { calendarSyncMode: 'busy' })).toBe(false);
    expect(isBaseBlock(manual, { calendarSyncMode: 'available' })).toBe(false);
  });
});

describe('blockAppliesToDate', () => {
  it('un bloque recurrente aplica cada semana en su día', () => {
    expect(blockAppliesToDate(manual, '2026-09-07', 1)).toBe(true);
    expect(blockAppliesToDate(manual, '2026-09-14', 1)).toBe(true);
    expect(blockAppliesToDate(manual, '2026-09-08', 2)).toBe(false);
  });

  it('un bloque de una sola vez aplica solo en su fecha, aunque el día de la semana coincida', () => {
    expect(blockAppliesToDate(synced, '2026-09-07', 1)).toBe(true);
    expect(blockAppliesToDate(synced, '2026-09-14', 1)).toBe(false);
  });

  it('acepta specificDate como Date a medianoche UTC (como lo devuelve Prisma)', () => {
    const block = { ...synced, specificDate: new Date('2026-09-07T00:00:00.000Z') };
    expect(blockAppliesToDate(block, '2026-09-07', 1)).toBe(true);
    expect(specificDateToIso(block.specificDate)).toBe('2026-09-07');
  });

  it('las filas sin columna recurring cuentan como semanales', () => {
    expect(blockAppliesToDate(legacy, '2026-09-14', 1)).toBe(true);
  });
});
