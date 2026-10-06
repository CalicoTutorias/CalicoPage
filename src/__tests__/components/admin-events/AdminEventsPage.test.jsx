/**
 * Admin events list — a failed load explains itself: the admin rate limit
 * (429) gets its own message instead of the generic load error.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminEventsPage from '@/app/home/admin/eventos/page';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { list: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

beforeEach(() => jest.clearAllMocks());

it('a 429 shows the rate-limit message', async () => {
  AdminEventService.list.mockResolvedValue({ success: false, error: null, status: 429 });
  render(<AdminEventsPage />);

  expect(await screen.findByText(en.admin.events.errors.RATE_LIMITED)).toBeInTheDocument();
  expect(screen.queryByText(en.admin.events.errors.load)).toBeNull();
});

it('any other failure keeps the generic load error', async () => {
  AdminEventService.list.mockResolvedValue({ success: false, error: 'boom', status: 500 });
  render(<AdminEventsPage />);

  expect(await screen.findByText(en.admin.events.errors.load)).toBeInTheDocument();
});
