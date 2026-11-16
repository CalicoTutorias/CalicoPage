/**
 * @jest-environment node
 *
 * GET /api/admin/sessions/export end to end down to the repository: the
 * real service builds the CSV from repository rows, so this covers the
 * content type, the header row, cell escaping (commas, quotes, newlines,
 * formulas), Bogotá local times, and the filters + row cap the repository
 * receives. Only the guard and the repository are mocked.
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/repositories/admin-metrics.repository', () => ({
  operationsSessions: jest.fn(),
}));
// Fulfillers behind src/lib/payments/checkout.js, unused here (keeps their
// calendar/Wompi import chain out of the test).
jest.mock('@/lib/services/wompi.service', () => ({ processSuccessfulPayment: jest.fn() }));
jest.mock('@/lib/services/event-checkout.service', () => ({ fulfilPaidRegistration: jest.fn() }));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const repo = require('@/lib/repositories/admin-metrics.repository');
const { GET } = require('@/app/api/admin/sessions/export/route');
const { SESSIONS_EXPORT_MAX_ROWS } = require('@/lib/services/admin-sessions.service');
const { makeOperationsRow } = require('../fixtures/admin-sessions.fixtures');

const HEADER =
  'ID,Inicio,Fin,Estado,Origen,Código materia,Materia,Tutor,Correo tutor,Estudiantes,Correos estudiantes,'
  + 'Estado pago,Monto,Vía Wompi,Link Meet,Creada,Cancelada el,Motivo cancelación,Cancelada por,Prueba';

const req = (qs = '') => new Request(`http://localhost/api/admin/sessions/export${qs}`);

/** CSV body after checking its UTF-8 BOM (Excel needs it for the accents). */
async function body(res) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return new TextDecoder().decode(bytes); // drops the BOM
}

const lines = async (res) => (await body(res)).split('\r\n');

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
  repo.operationsSessions.mockResolvedValue({ rows: [makeOperationsRow()], total: 1 });
});

it('test_should_reject_non_admins_before_reading_sessions', async () => {
  requireAdminUser.mockResolvedValue(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }));

  const res = await GET(req());

  expect(res.status).toBe(403);
  expect(repo.operationsSessions).not.toHaveBeenCalled();
});

it('test_should_answer_text_csv_with_a_header_row_and_bogota_times', async () => {
  const res = await GET(req());

  expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  const [header, row, ...rest] = await lines(res);
  expect(header).toBe(HEADER);
  expect(rest).toEqual([]);
  expect(row).toBe(
    'sess-1,2026-11-11 10:00,2026-11-11 11:00,Accepted,Platform,ISIS1221,Intro a la Programación,'
    + 'Andrés Tutor,andres@uniandes.edu.co,Ana Estudiante,ana@uniandes.edu.co,'
    + 'paid,40000,Sí,https://meet.google.com/abc-defg-hij,2026-11-04 08:30,,,,No',
  );
});

it('test_should_escape_commas_quotes_newlines_and_formulas', async () => {
  repo.operationsSessions.mockResolvedValue({
    total: 1,
    rows: [makeOperationsRow({
      status: 'Canceled',
      googleMeetLink: null,
      cancelledAt: new Date('2026-11-10T20:00:00.000Z'),
      cancellationReason: 'Se enfermó,\nno pudo "asistir"',
      cancelledBy: 'stu-1',
      tutor: { id: 'tutor-1', name: '=HYPERLINK("http://x")', email: 'andres@uniandes.edu.co' },
      students: [
        { id: 'stu-1', name: 'Pérez, Ana', email: 'ana@uniandes.edu.co', kind: 'Registered' },
        { id: 'stu-2', name: 'Juan "JJ" Gómez', email: 'jj@uniandes.edu.co', kind: 'ExternalTemporary' },
      ],
    })],
  });

  const text = await body(await GET(req()));

  expect(text).toContain(',"Pérez, Ana; Juan ""JJ"" Gómez",ana@uniandes.edu.co; jj@uniandes.edu.co,');
  expect(text).toContain(',"\'=HYPERLINK(""http://x"")",');
  // The newline stays inside one quoted cell instead of starting a new record.
  expect(text).toContain(',2026-11-10 15:00,"Se enfermó,\nno pudo ""asistir""",Estudiante,No');
  expect(text.split('\r\n')).toHaveLength(2);
});

it('test_should_hand_the_validated_filters_and_the_row_cap_to_the_repository', async () => {
  await GET(req('?status=Accepted&from=2026-11-01&to=2026-11-30&search=ana&missingMeet=true'));

  expect(repo.operationsSessions).toHaveBeenCalledWith({
    filters: {
      statuses: ['Accepted'],
      from: new Date('2026-11-01T05:00:00.000Z'), // Bogotá midnight
      to: new Date('2026-12-01T05:00:00.000Z'),   // end of the inclusive `to` day
      search: 'ana',
      upcoming: false,
      missingMeet: true,
      includeTest: false,
    },
    now: expect.any(Date),
    limit: SESSIONS_EXPORT_MAX_ROWS,
    offset: 0,
  });
  expect(SESSIONS_EXPORT_MAX_ROWS).toBe(5000);
});

it('test_should_export_only_the_header_when_nothing_matches', async () => {
  repo.operationsSessions.mockResolvedValue({ rows: [], total: 0 });

  expect(await lines(await GET(req()))).toEqual([HEADER]);
});
