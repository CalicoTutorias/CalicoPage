/**
 * Admin event detail — action errors are shown in the ConfirmDialog with an
 * i18n message, never the server's Spanish-only text.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AdminEventDetailPage from '@/app/home/admin/eventos/[id]/page';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { get: jest.fn(), publish: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

const DRAFT = {
  id: 'ev-1',
  slug: 'repaso-ab12',
  title: 'Repaso parcial',
  description: 'Temas del parcial',
  coverImageUrl: null,
  course: null,
  startsAt: '2026-10-18T23:00:00.000Z',
  endsAt: '2026-10-19T01:00:00.000Z',
  modality: 'Virtual',
  autoMeet: true,
  meetingUrl: null,
  location: null,
  price: 20000,
  earlyBirdSlots: null,
  earlyBirdPercent: null,
  isListed: true,
  status: 'Draft',
  derivedStatus: 'draft',
  tutors: [{ id: 't1', name: 'Ana Tutor' }],
  stats: { confirmed: 0, pending: 0, canceled: 0, responses: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  AdminEventService.get.mockResolvedValue({ success: true, event: DRAFT });
});

it('publish answered with INVALID_STATE shows the translated "reload" message in the dialog', async () => {
  AdminEventService.publish.mockResolvedValue({
    success: false, code: 'INVALID_STATE', error: 'Solo se puede publicar un borrador', status: 409,
  });
  render(<AdminEventDetailPage />);
  await screen.findByText('Repaso parcial');

  fireEvent.click(screen.getByRole('button', { name: en.admin.events.actions.publish }));
  const dialog = screen.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: en.admin.events.confirm.publish.confirm }));

  expect(await within(dialog).findByText(en.admin.events.errors.INVALID_STATE)).toBeInTheDocument();
  expect(screen.queryByText('Solo se puede publicar un borrador')).toBeNull();
  expect(AdminEventService.publish).toHaveBeenCalledWith('ev-1');
});
