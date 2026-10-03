const { buildEventIcs } = require('@/lib/utils/ics');

const base = {
  uid: 'abc@calico-tutorias.com',
  title: 'Repaso, parcial; 2',
  description: 'Linea 1\nLinea 2',
  startsAt: new Date('2026-10-18T23:00:00.000Z'),
  endsAt: new Date('2026-10-19T01:00:00.000Z'),
  location: 'Bloque C',
  url: 'https://example.com/eventos/x',
  now: new Date('2026-10-01T00:00:00.000Z'),
};

it('builds a well-formed calendar', () => {
  const ics = buildEventIcs(base);
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(ics).toContain('DTSTART:20261018T230000Z');
  expect(ics).toContain('DTEND:20261019T010000Z');
  expect(ics).toContain('UID:abc@calico-tutorias.com');
  expect(ics).toContain('SUMMARY:Repaso\\, parcial\\; 2');
  expect(ics).toContain('Linea 1\\nLinea 2');
});
it('folds lines longer than 75 octets', () => {
  const ics = buildEventIcs({ ...base, description: 'x'.repeat(200) });
  expect(ics).toContain('\r\n ');
  for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
});
