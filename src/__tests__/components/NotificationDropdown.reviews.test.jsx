/**
 * NotificationDropdown — the "new review" notification: it says what it is and
 * opens the tutor's reviews, including for a repaso (no session to open) and for
 * a tutor currently using the app as a student.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationDropdown from '@/app/components/NotificationDropdown/NotificationDropdown';
import { TutoringSessionService } from '@/app/services/core/TutoringSessionService';
import { useAuth } from '@/app/context/SecureAuthContext';
import { useNotificationContext } from '@/app/context/NotificationContext';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/app/services/core/NotificationService', () => ({
  NotificationService: { markAsRead: jest.fn(async () => ({})), markAllAsRead: jest.fn(async () => ({})) },
}));
jest.mock('@/app/services/core/TutoringSessionService', () => ({
  TutoringSessionService: { getSessionById: jest.fn(), getSession: jest.fn() },
}));
jest.mock('@/app/context/NotificationContext', () => ({ useNotificationContext: jest.fn() }));
jest.mock('@/app/components/TutorApprovalModal/TutorApprovalModal', () => () => null);
jest.mock('@/app/components/SessionDetailView/SessionDetailView', () => () => null);

const REVIEW = {
  id: 'n1',
  type: 'review_received',
  message: 'Ana te calificó con 5/5.',
  isRead: false,
  sessionId: null,
  createdAt: '2026-11-01T15:00:00.000Z',
};

function open(isTutor) {
  useAuth.mockReturnValue({ user: { isLoggedIn: true, isTutor, uid: 'u1' }, loading: false });
  useNotificationContext.mockReturnValue({
    notifications: [REVIEW], unreadCount: 1, updateNotifications: jest.fn(),
  });
  render(<NotificationDropdown />);
  fireEvent.click(screen.getByRole('button', { name: /notification/i }));
}

beforeEach(() => {
  jest.clearAllMocks();
  document.getElementById('resenas')?.remove();
});

it('already on Statistics, it scrolls to the section instead of pushing the same URL', () => {
  const section = document.createElement('section');
  section.id = 'resenas';
  section.scrollIntoView = jest.fn();
  document.body.appendChild(section);

  open(true);
  fireEvent.click(screen.getByText('Ana te calificó con 5/5.'));

  expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
});

it.each([
  ['a tutor', true],
  ['a tutor using the app as a student', false],
])('opens the reviews section for %s, with no session to load', async (_label, isTutor) => {
  open(isTutor);

  expect(screen.getByText('New review')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Ana te calificó con 5/5.'));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/tutor/statistics#resenas'));
  expect(TutoringSessionService.getSessionById).not.toHaveBeenCalled();
});
