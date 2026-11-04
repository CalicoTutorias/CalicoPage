/**
 * Admin "Tutorías" page (/home/admin/tutorias): the sessions table renders
 * what the team acts on (Meet link or its absence, payment, cancellation,
 * test badge) and sends the filters to the API; the "Pagos sin tutoría"
 * panel only shows up when there is something to fix, and "Reintentar"
 * replays the payment through AdminService and shows the outcome.
 */

import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import AdminSessionsPage from '@/app/home/admin/tutorias/page';
import { AdminService } from '@/app/services/core/AdminService';
import { makeSessionItem, makeUnbookedItem } from '../fixtures/admin-sessions.fixtures';

const es = require('@/lib/i18n/locales/es.json');
const en = require('@/lib/i18n/locales/en.json');

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  return {
    useI18n: () => ({
      t,
      locale: 'en',
      formatCurrency: (n) => `$${n}`,
      formatDate: (d) => `D(${new Date(d).toISOString().slice(0, 10)})`,
      formatDateTime: (d) => `DT(${new Date(d).toISOString().slice(0, 16)})`,
    }),
  };
});

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = {
    listSessions: jest.fn(),
    listUnbookedPayments: jest.fn(),
    reconcilePayment: jest.fn(),
    downloadSessionsCsv: jest.fn(),
  };
  return { __esModule: true, AdminService, default: AdminService };
});

const PAID = makeSessionItem();
const NO_MEET = makeSessionItem({
  id: 'sess-2',
  meetLink: null,
  missingMeet: true,
  isTest: true,
  course: { code: 'TEST123', name: 'Curso de prueba' },
  students: [{ id: 'stu-2', name: 'Beto Estudiante', email: 'beto@uniandes.edu.co', external: true }],
  payment: { status: 'pending', amount: 30000, viaWompi: false },
});
const CANCELED = makeSessionItem({
  id: 'sess-3',
  status: 'Canceled',
  meetLink: null,
  source: 'ManualAdmin',
  students: [{ id: 'stu-3', name: 'Caro Estudiante', email: 'caro@uniandes.edu.co', external: false }],
  payment: { status: 'none', amount: null, viaWompi: false },
  cancellation: { at: '2026-11-10T20:00:00.000Z', reason: 'Se enfermó', by: 'student' },
});

const sessionsPage = (items, total = items.length) => ({ ok: true, success: true, items, total, limit: 25, offset: 0 });
const lastFilters = () => AdminService.listSessions.mock.calls.at(-1)[0];

beforeEach(() => {
  jest.clearAllMocks();
  AdminService.listSessions.mockResolvedValue(sessionsPage([PAID, NO_MEET, CANCELED]));
  AdminService.listUnbookedPayments.mockResolvedValue({ ok: true, success: true, items: [] });
});

describe('sessions table', () => {
  it('test_should_render_every_session_with_meet_payment_and_cancellation', async () => {
    render(<AdminSessionsPage />);

    const paid = (await screen.findByText('Ana Estudiante')).closest('tr');
    expect(within(paid).getByText('D(2026-11-11)')).toBeInTheDocument();
    expect(within(paid).getByText('andres@uniandes.edu.co')).toBeInTheDocument();
    expect(within(paid).getByText('ana@uniandes.edu.co')).toBeInTheDocument();
    expect(within(paid).getByText('Scheduled')).toBeInTheDocument();
    expect(within(paid).getByText('Platform')).toBeInTheDocument();
    expect(within(paid).getByText('$40000')).toBeInTheDocument();
    expect(within(paid).getByText('Via Wompi')).toBeInTheDocument();
    expect(within(paid).getByRole('link', { name: 'Open Meet' })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    expect(within(paid).getByText('DT(2026-11-04T13:30)')).toBeInTheDocument();

    const noMeet = screen.getByText('Beto Estudiante').closest('tr');
    expect(within(noMeet).getByText('Missing link')).toBeInTheDocument();
    expect(within(noMeet).queryByRole('link')).not.toBeInTheDocument();
    expect(within(noMeet).getByText('Test')).toBeInTheDocument();
    expect(within(noMeet).getByText(/external/)).toBeInTheDocument();
    expect(within(noMeet).getByText('Not via Wompi')).toBeInTheDocument();

    const canceled = screen.getByText('Caro Estudiante').closest('tr');
    expect(within(canceled).getByText('On DT(2026-11-10T20:00)')).toBeInTheDocument();
    expect(within(canceled).getByText('Canceled by the student')).toBeInTheDocument();
    expect(within(canceled).getByText('Se enfermó')).toBeInTheDocument();
    expect(within(canceled).getByText('No payment')).toBeInTheDocument();
    expect(within(canceled).getByText('Manual')).toBeInTheDocument();
    expect(within(canceled).queryByText('Missing link')).not.toBeInTheDocument();

    expect(screen.getByText('Page 1 of 1 · 3 sessions')).toBeInTheDocument();
  });

  it('test_should_send_status_search_and_flag_filters_to_the_api', async () => {
    render(<AdminSessionsPage />);
    await screen.findByText('Ana Estudiante');
    expect(lastFilters()).toEqual({
      statuses: [], from: '', to: '', search: '', upcoming: false, missingMeet: false, includeTest: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    await waitFor(() => expect(lastFilters().statuses).toEqual(['Accepted']));
    expect(screen.getByRole('button', { name: 'Scheduled' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  ana@uni ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastFilters().search).toBe('ana@uni'));

    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    fireEvent.click(screen.getByRole('button', { name: 'No Meet link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Include tests' }));
    await waitFor(() => expect(lastFilters()).toMatchObject({ upcoming: true, missingMeet: true, includeTest: true }));
    expect(AdminService.listSessions.mock.calls.at(-1)[1]).toEqual({ limit: 25, offset: 0 });

    AdminService.downloadSessionsCsv.mockResolvedValue({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(AdminService.downloadSessionsCsv).toHaveBeenCalledWith(lastFilters()));
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('test_should_show_an_error_with_retry_when_the_list_fails', async () => {
    AdminService.listSessions.mockResolvedValueOnce({ ok: false, status: 500, success: false });
    render(<AdminSessionsPage />);

    expect(await screen.findByText('Could not load the sessions.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Ana Estudiante')).toBeInTheDocument();
  });
});

describe('payments without a session', () => {
  it('test_should_hide_the_panel_when_nothing_is_unbooked', async () => {
    render(<AdminSessionsPage />);
    await screen.findByText('Ana Estudiante');
    await waitFor(() => expect(AdminService.listUnbookedPayments).toHaveBeenCalled());

    expect(screen.queryByText('Payments without a session')).not.toBeInTheDocument();
  });

  it('test_should_list_each_unbooked_payment_with_its_sweep_verdict', async () => {
    AdminService.listUnbookedPayments.mockResolvedValue({
      ok: true,
      success: true,
      items: [
        makeUnbookedItem(),
        makeUnbookedItem({
          reference: 'EVT-2', kind: 'event', tutor: null, course: null, event: { title: 'Repaso final' },
          transactionId: 'pending-tx', sweep: null,
        }),
        makeUnbookedItem({
          reference: 'CALICO-3',
          transactionId: 'pending-tx-3',
          sweep: { status: null, outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE', checkedAt: '2026-11-04T12:45:00.000Z' },
        }),
      ],
    });
    render(<AdminSessionsPage />);

    const panel = (await screen.findByText('Payments without a session')).closest('section');
    const row = within(panel).getByText('CALICO-1730000000-abc').closest('tr');
    expect(within(row).getByText('Ana Estudiante')).toBeInTheDocument();
    expect(within(row).getByText('Intro a la Programación · ISIS1221')).toBeInTheDocument();
    expect(within(row).getByText('$40000')).toBeInTheDocument();
    expect(within(row).getByText('wompi-tx-1')).toBeInTheDocument();
    expect(within(row).getByText('Needs attention')).toBeInTheDocument();
    expect(within(row).getByText('Wompi: APPROVED')).toBeInTheDocument();
    expect(within(row).getByText('SESSION_CONFLICT')).toBeInTheDocument();

    const event = within(panel).getByText('EVT-2').closest('tr');
    expect(within(event).getByText('Review session')).toBeInTheDocument();
    expect(within(event).getByText('Repaso final')).toBeInTheDocument();
    expect(within(event).getByText('Not checked yet')).toBeInTheDocument();

    // The sweeper could not ask Wompi: status null is shown as unknown.
    const unknown = within(panel).getByText('CALICO-3').closest('tr');
    expect(within(unknown).getByText('Check failed')).toBeInTheDocument();
    expect(within(unknown).getByText('Wompi: status unknown')).toBeInTheDocument();
    expect(within(unknown).getByText('pending-tx-3')).toBeInTheDocument();

    expect(within(panel).getByText('What does each result mean?')).toBeInTheDocument();
    expect(within(panel).getByText(/will not try it again\. The only ways out are "Retry" or refunding/)).toBeInTheDocument();
  });

  it('test_should_retry_through_the_service_and_reload_the_table_when_booked', async () => {
    AdminService.listUnbookedPayments.mockResolvedValue({ ok: true, success: true, items: [makeUnbookedItem()] });
    AdminService.reconcilePayment.mockResolvedValue({
      ok: true, status: 200, success: true, result: { outcome: 'FULFILLED', sessionId: 'sess-9' },
    });
    render(<AdminSessionsPage />);
    const row = (await screen.findByText('CALICO-1730000000-abc')).closest('tr');
    await screen.findByText('Page 1 of 1 · 3 sessions');
    const loads = AdminService.listSessions.mock.calls.length;

    fireEvent.click(within(row).getByRole('button', { name: 'Retry' }));

    expect(AdminService.reconcilePayment).toHaveBeenCalledWith({ transactionId: 'wompi-tx-1', reference: 'CALICO-1730000000-abc' });
    const status = within(row).getByRole('status');
    expect(await within(status).findByText('FULFILLED')).toBeInTheDocument();
    expect(within(status).getByText('Booked')).toBeInTheDocument();
    await waitFor(() => expect(AdminService.listSessions.mock.calls.length).toBe(loads + 1));
  });

  it('test_should_show_the_error_code_and_that_a_refund_is_needed_on_session_conflict', async () => {
    AdminService.listUnbookedPayments.mockResolvedValue({ ok: true, success: true, items: [makeUnbookedItem()] });
    AdminService.reconcilePayment.mockResolvedValue({
      ok: false, status: 409, success: false, error: 'SESSION_CONFLICT', message: 'Slot taken',
    });
    render(<AdminSessionsPage />);
    const row = (await screen.findByText('CALICO-1730000000-abc')).closest('tr');
    await screen.findByText('Page 1 of 1 · 3 sessions');
    const loads = AdminService.listSessions.mock.calls.length;

    fireEvent.click(within(row).getByRole('button', { name: 'Retry' }));

    const status = within(row).getByRole('status');
    expect(await within(status).findByText('SESSION_CONFLICT')).toBeInTheDocument();
    expect(within(status).getByText('Refund needed')).toBeInTheDocument();
    expect(AdminService.listSessions.mock.calls.length).toBe(loads);
  });

  it('test_should_show_a_load_error_instead_of_hiding_the_panel', async () => {
    AdminService.listUnbookedPayments.mockResolvedValueOnce({ ok: false, status: 500, success: false });
    render(<AdminSessionsPage />);

    expect(await screen.findByText('Could not load the payments without a session.')).toBeInTheDocument();
  });
});

describe('i18n', () => {
  const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  ));

  it('test_should_have_every_admin_sessions_key_in_both_locales', () => {
    expect(flatten(es.admin.sessions).sort()).toEqual(flatten(en.admin.sessions).sort());
    expect(flatten(es.admin.sessions).length).toBeGreaterThan(50);
    expect(typeof es.admin.shell.nav.sessions).toBe('string');
    expect(typeof en.admin.shell.nav.sessions).toBe('string');
  });

  it('test_should_label_every_session_status_and_sweep_outcome', () => {
    for (const locale of [es, en]) {
      expect(Object.keys(locale.admin.sessions.status).sort())
        .toEqual(['Accepted', 'Canceled', 'Completed', 'Pending', 'Rejected']);
      expect(Object.keys(locale.admin.sessions.unbooked.outcome).sort())
        .toEqual(['ALREADY_PROCESSED', 'ERROR', 'FULFILLED', 'NEEDS_ATTENTION', 'NOT_APPROVED', 'NO_TRANSACTION']);
    }
  });
});
