/**
 * Inicio de admin: una tarjeta por cola de GET /api/admin/inbox, con su
 * prioridad, «Al día» cuando está vacía y error aislado por tarjeta.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import AdminHomePage from '@/app/home/admin/page';
import { AdminService } from '@/app/services/core/AdminService';

const en = require('@/lib/i18n/locales/en.json');
const h = en.admin.home;

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = { getInbox: jest.fn(), metricsOverview: jest.fn() };
  return { __esModule: true, AdminService, default: AdminService };
});

const NOW = '2026-11-18T20:00:00.000Z';
const ok = (key, extra = {}) => ({ key, ok: true, count: 0, severity: 'ok', overdue: false, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  AdminService.metricsOverview.mockResolvedValue({ success: true, sessionsThisWeek: 12, revenueThisMonth: 50000, activeTutors: 7 });
  AdminService.getInbox.mockResolvedValue({
    success: true,
    generatedAt: NOW,
    items: [
      ok('unbooked', { count: 2, severity: 'critical', overdue: true, oldestAt: '2026-11-15T20:00:00.000Z' }),
      ok('applications'),
      ok('recruitment', {
        count: 1, severity: 'high', waitingStudents: 4,
        top: [{ courseId: 'c1', courseCode: 'MATE1203', courseName: 'Cálculo Diferencial', waiting: 4 }],
      }),
      ok('eventApprovals'),
      ok('payouts', { count: 3, severity: 'medium', amountOwed: 120000, cutoffWeekday: 5, cutoffToday: false }),
      ok('courseRequests'),
      { key: 'suggestions', ok: false },
      ok('pendingSoon'),
    ],
  });
});

const card = (title) => screen.getByRole('heading', { name: title }).closest('article');

it('shows each queue with its priority, age and a link to the filtered view', async () => {
  render(<AdminHomePage />);

  await screen.findByText(h.cards.unbooked.title);
  const unbooked = card(h.cards.unbooked.title);
  expect(within(unbooked).getByText('2')).toBeInTheDocument();
  expect(within(unbooked).getByText(h.severity.critical)).toBeInTheDocument();
  expect(within(unbooked).getByText(h.overdue)).toBeInTheDocument();
  expect(within(unbooked).getByText('Oldest: 3 d ago')).toBeInTheDocument();
  expect(within(unbooked).getByRole('link', { name: h.cards.unbooked.cta })).toHaveAttribute('href', '/home/admin/tutorias?tab=unbooked');

  const recruitment = card(h.cards.recruitment.title);
  expect(within(recruitment).getByText('Cálculo Diferencial', { exact: false })).toBeInTheDocument();
  expect(within(recruitment).getByRole('link', { name: h.cards.recruitment.cta })).toHaveAttribute('href', '/home/admin/tutors?tab=recruitment');

  expect(within(card(h.cards.payouts.title)).getByText('Weekly cutoff: Friday')).toBeInTheDocument();
});

it('keeps empty queues visible as caught up and isolates a failed one', async () => {
  render(<AdminHomePage />);
  await screen.findByText(h.cards.applications.title);

  expect(within(card(h.cards.applications.title)).getByText(h.ok)).toBeInTheDocument();
  expect(within(card(h.cards.suggestions.title)).getByText(h.cardError)).toBeInTheDocument();
  expect(screen.getByText('3 queues need your attention.')).toBeInTheDocument();
});

it('shows the pulse KPIs from the metrics overview', async () => {
  render(<AdminHomePage />);
  expect(await screen.findByText('12')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
});
