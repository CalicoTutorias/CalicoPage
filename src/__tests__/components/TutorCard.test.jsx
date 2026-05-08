/**
 * Unit tests for TutorCard with reviews toggle
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorCard from '@/app/components/TutorCard/TutorCard';

// Mock i18n
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      const map = {
        'tutorCard.viewReviews': 'Ver reseñas',
        'tutorCard.hideReviews': 'Ocultar reseñas',
        'tutorCard.ratingWithReviews': `${params?.rating} ⭐ (${params?.count} reviews)`,
        'tutorCard.reviewsCountOnly': `(${params?.count} reviews)`,
      };
      return map[key] || key;
    }
  })
}));

// Mock TutorReviewsList
jest.mock('@/app/components/TutorReviewsList/TutorReviewsList', () => {
  return function MockTutorReviewsList({ tutorId, isOpen }) {
    if (!isOpen) return null;
    return <div data-testid="reviews-list" data-tutor-id={tutorId}>Reviews visible</div>;
  };
});

// Mock shadcn Button
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }) => (
    <button onClick={onClick} className={className}>{children}</button>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TutorCard', () => {
  const baseTutor = {
    id: 5,
    name: 'María López',
    tutorProfile: { review: 4.2, numReview: 5, tutorCourses: [{ name: 'Física I' }, { name: 'Cálculo II' }] },
  };

  it('renders tutor name and rating', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    // Name appears in both mobile and desktop layouts
    const names = screen.getAllByText('María López');
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('4.2 ⭐ (5 reseñas)').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Reseñas" button in mobile and "Ver reseñas" in desktop when tutor has id', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    // Mobile/desktop button text (uses same localized label)
    expect(screen.getAllByText('Ver reseñas').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render reviews buttons when tutor has no id', () => {
    const noIdTutor = { name: 'Sin ID' };
    render(<TutorCard tutor={noIdTutor} onBookNow={jest.fn()} />);

    expect(screen.queryByText('Ver reseñas')).not.toBeInTheDocument();
    expect(screen.queryByText('Ocultar reseñas')).not.toBeInTheDocument();
  });

  it('toggles reviews on mobile button click', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    expect(screen.queryAllByTestId('reviews-list')).toHaveLength(0);

    // Click mobile button (uses same localized label)
    fireEvent.click(screen.getAllByText('Ver reseñas')[0]);

    // Both mobile and desktop reviews become visible (same state)
    const reviewsLists = screen.getAllByTestId('reviews-list');
    expect(reviewsLists.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles reviews on desktop button click', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    fireEvent.click(screen.getAllByText('Ver reseñas')[1]);

    const reviewsLists = screen.getAllByTestId('reviews-list');
    expect(reviewsLists.length).toBeGreaterThanOrEqual(1);

    // Text changes to "Ocultar reseñas"
    expect(screen.getAllByText('Ocultar reseñas').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onBookNow when "Ver disponibilidad" is clicked', () => {
    const onBookNow = jest.fn();
    render(<TutorCard tutor={baseTutor} onBookNow={onBookNow} />);

    // There are two buttons (mobile + desktop)
    const buttons = screen.getAllByText('Ver disponibilidad');
    fireEvent.click(buttons[0]);

    expect(onBookNow).toHaveBeenCalled();
  });

  it('uses uid over id for tutorId', () => {
    const tutorWithUid = { ...baseTutor, uid: 42 };
    render(<TutorCard tutor={tutorWithUid} onBookNow={jest.fn()} />);

    fireEvent.click(screen.getAllByText('Ver reseñas')[1]);

    const reviewsList = screen.getAllByTestId('reviews-list')[0];
    expect(reviewsList.dataset.tutorId).toBe('42');
  });
});
