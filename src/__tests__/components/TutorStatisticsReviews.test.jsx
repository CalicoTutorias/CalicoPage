/**
 * Tutor statistics — the Reviews section: it lists the tutor's own reviews and,
 * when arriving from a notification (#resenas), scrolls to it once the page has
 * finished loading, because the section does not exist before that.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TutorStatistics from '@/app/tutor/statistics/page';
import { useAuth } from '@/app/context/SecureAuthContext';

jest.mock('@/app/services/core/UserService', () => ({
  UserService: { getUserById: jest.fn(async () => ({ id: 'tutor-1' })) },
}));
jest.mock('@/app/services/core/PaymentService', () => ({
  PaymentService: { getTutorPayments: jest.fn(async () => []) },
}));

const scrollIntoView = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  scrollIntoView.mockClear();
  window.history.replaceState(null, '', '/tutor/statistics');
  Element.prototype.scrollIntoView = scrollIntoView;
  useAuth.mockReturnValue({ user: { isLoggedIn: true, isTutor: true, uid: 'tutor-1', email: 't@x.co' }, loading: false });
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('/reviews')
      ? {
        success: true,
        reviews: [{ id: 'r1', rating: 5, comment: 'Excelente repaso', event: { title: 'Repaso IP' }, student: { name: 'Ana Gómez' } }],
        pagination: { page: 1, pageSize: 6, total: 1, totalPages: 1, hasMore: false },
      }
      : { success: true, tutor: { numReview: 1 }, courses: [] }),
  }));
});

it('shows the reviews of this tutor in their own section, without jumping there', async () => {
  const { container } = render(<TutorStatistics />);

  expect(await screen.findByText('Excelente repaso')).toBeInTheDocument();
  expect(screen.getByText('Repaso IP')).toBeInTheDocument();
  expect(container.querySelector('section#resenas')).not.toBeNull();
  const reviewsCall = global.fetch.mock.calls.map(([url]) => String(url)).find((url) => url.includes('/reviews'));
  expect(reviewsCall).toMatch(/^\/api\/tutors\/tutor-1\/reviews\?/);
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it('jumps to the section once loaded when the URL points at it', async () => {
  window.history.replaceState(null, '', '/tutor/statistics#resenas');
  render(<TutorStatistics />);

  await screen.findByText('Excelente repaso');
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
});
