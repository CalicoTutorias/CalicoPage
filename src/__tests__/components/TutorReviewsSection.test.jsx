/**
 * Tutor profile reviews — the comment a student left on a finished tutoring
 * session shows up on the tutor's profile, read from
 * GET /api/tutors/[id]/reviews.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TutorReviewsSection from '@/app/components/TutorProfile/TutorReviewsSection';

const REVIEW = {
  id: 'r1',
  rating: 4,
  comment: 'Me ayudó mucho con el parcial de grafos.',
  status: 'done',
  student: { id: 's1', name: 'María López', profilePictureUrl: null },
  course: { id: 'c1', name: 'Estructuras de Datos', code: 'ISIS1225' },
  event: null,
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({
      success: true,
      reviews: [REVIEW],
      pagination: { page: 1, pageSize: 6, total: 1, totalPages: 1, hasMore: false },
    }),
  });
});

it('loads the tutor reviews from the profile endpoint and renders the student comment', async () => {
  render(<TutorReviewsSection tutorId="tutor-1" subjects={[]} totalReviews={1} />);

  expect(await screen.findByText(REVIEW.comment)).toBeInTheDocument();
  expect(screen.getByText('María L.')).toBeInTheDocument();
  expect(screen.getByText('Estructuras de Datos')).toBeInTheDocument();

  const url = global.fetch.mock.calls[0][0];
  expect(url).toMatch(/^\/api\/tutors\/tutor-1\/reviews\?/);
  expect(url).toContain('page=1');
});

describe('variant="own" (the tutor reading their own reviews in Statistics)', () => {
  const renderOwn = () => render(
    <TutorReviewsSection variant="own" id="resenas" className="statistics-reviews" tutorId="tutor-1" subjects={[]} totalReviews={9} />,
  );

  it('speaks to the tutor, counts from the API and takes the anchor and class', async () => {
    const { container } = renderOwn();

    expect(await screen.findByText(REVIEW.comment)).toBeInTheDocument();
    expect(screen.getByText(/^1 review from your tutoring and review sessions/)).toBeInTheDocument();
    expect(screen.queryByText(/has rated this tutor/)).not.toBeInTheDocument();
    expect(container.querySelector('section#resenas.statistics-reviews')).not.toBeNull();
  });

  it('has its own empty state', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ success: true, reviews: [], pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1, hasMore: false } }),
    });
    renderOwn();

    expect(await screen.findByText("You don't have any reviews yet.")).toBeInTheDocument();
    expect(screen.getByText('The reviews of your tutoring and review sessions will show up here.')).toBeInTheDocument();
  });

  it('the public profile keeps its copy and card', async () => {
    const { container } = render(<TutorReviewsSection tutorId="tutor-1" subjects={[]} totalReviews={1} />);

    await screen.findByText(REVIEW.comment);
    expect(screen.queryByText(/your tutoring/)).not.toBeInTheDocument();
    expect(container.querySelector('section').className).toContain('rounded-2xl');
  });
});

it('shows the empty state when the tutor has no submitted reviews yet', async () => {
  global.fetch.mockResolvedValue({
    json: async () => ({ success: true, reviews: [], pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1, hasMore: false } }),
  });
  render(<TutorReviewsSection tutorId="tutor-1" subjects={[]} totalReviews={0} />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByText(REVIEW.comment)).not.toBeInTheDocument();
});
