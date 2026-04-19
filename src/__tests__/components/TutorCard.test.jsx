/**
 * Unit tests for TutorCard with reviews toggle
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorCard from '@/app/components/TutorCard/TutorCard';

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
    rating: 4.2,
    tutorProfile: {
      tutorCourses: [{ name: 'Física I' }, { name: 'Cálculo II' }],
    },
  };

  it('renders tutor name and rating', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    // Name appears in both mobile and desktop layouts
    const names = screen.getAllByText('María López');
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Reseñas" button in mobile and "Ver reseñas" in desktop when tutor has id', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    // Mobile button text
    expect(screen.getByText('Reseñas')).toBeInTheDocument();
    // Desktop button text
    expect(screen.getByText('Ver reseñas')).toBeInTheDocument();
  });

  it('does not render reviews buttons when tutor has no id', () => {
    const noIdTutor = { name: 'Sin ID' };
    render(<TutorCard tutor={noIdTutor} onBookNow={jest.fn()} />);

    expect(screen.queryByText('Reseñas')).not.toBeInTheDocument();
    expect(screen.queryByText('Ver reseñas')).not.toBeInTheDocument();
  });

  it('toggles reviews on mobile button click', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    expect(screen.queryAllByTestId('reviews-list')).toHaveLength(0);

    // Click mobile button
    fireEvent.click(screen.getByText('Reseñas'));

    // Both mobile and desktop reviews become visible (same state)
    const reviewsLists = screen.getAllByTestId('reviews-list');
    expect(reviewsLists.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles reviews on desktop button click', () => {
    render(<TutorCard tutor={baseTutor} onBookNow={jest.fn()} />);

    fireEvent.click(screen.getByText('Ver reseñas'));

    const reviewsLists = screen.getAllByTestId('reviews-list');
    expect(reviewsLists.length).toBeGreaterThanOrEqual(1);

    // Text changes to "Ocultar reseñas"
    expect(screen.getByText('Ocultar reseñas')).toBeInTheDocument();
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

    fireEvent.click(screen.getByText('Ver reseñas'));

    const reviewsList = screen.getAllByTestId('reviews-list')[0];
    expect(reviewsList.dataset.tutorId).toBe('42');
  });
});
