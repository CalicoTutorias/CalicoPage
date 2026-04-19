/**
 * Unit tests for ModernTutorCard with reviews toggle
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModernTutorCard from '@/app/components/ModernTutorCard/ModernTutorCard';

// Mock TutorReviewsList to isolate card logic
jest.mock('@/app/components/TutorReviewsList/TutorReviewsList', () => {
  return function MockTutorReviewsList({ tutorId, isOpen }) {
    if (!isOpen) return null;
    return <div data-testid="reviews-list" data-tutor-id={tutorId}>Reviews visible</div>;
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ModernTutorCard', () => {
  const baseTutor = {
    id: 10,
    name: 'Carlos García',
    rating: 4.7,
    description: 'Tutor de cálculo',
  };

  it('renders tutor name and rating', () => {
    render(<ModernTutorCard tutor={baseTutor} course="Cálculo" />);

    expect(screen.getByText('Carlos García')).toBeInTheDocument();
    expect(screen.getByText('4.7')).toBeInTheDocument();
  });

  it('renders "Ver reseñas" button when tutor has id', () => {
    render(<ModernTutorCard tutor={baseTutor} course="Cálculo" />);

    expect(screen.getByText('Ver reseñas')).toBeInTheDocument();
  });

  it('does not render "Ver reseñas" button when tutor has no id', () => {
    const noIdTutor = { name: 'Sin ID', rating: 3.0 };
    render(<ModernTutorCard tutor={noIdTutor} course="Cálculo" />);

    expect(screen.queryByText('Ver reseñas')).not.toBeInTheDocument();
  });

  it('toggles reviews list when button is clicked', () => {
    render(<ModernTutorCard tutor={baseTutor} course="Cálculo" />);

    // Initially hidden
    expect(screen.queryByTestId('reviews-list')).not.toBeInTheDocument();

    // Click to show
    fireEvent.click(screen.getByText('Ver reseñas'));
    expect(screen.getByTestId('reviews-list')).toBeInTheDocument();
    expect(screen.getByText('Ocultar reseñas')).toBeInTheDocument();

    // Click to hide
    fireEvent.click(screen.getByText('Ocultar reseñas'));
    expect(screen.queryByTestId('reviews-list')).not.toBeInTheDocument();
    expect(screen.getByText('Ver reseñas')).toBeInTheDocument();
  });

  it('passes correct tutorId to TutorReviewsList', () => {
    render(<ModernTutorCard tutor={baseTutor} course="Cálculo" />);

    fireEvent.click(screen.getByText('Ver reseñas'));

    const reviewsList = screen.getByTestId('reviews-list');
    expect(reviewsList.dataset.tutorId).toBe('10');
  });

  it('calls onReservar when "Reservar" button is clicked', () => {
    const onReservar = jest.fn();
    render(<ModernTutorCard tutor={baseTutor} course="Cálculo" onReservar={onReservar} />);

    fireEvent.click(screen.getByText('Reservar'));

    expect(onReservar).toHaveBeenCalledWith(baseTutor);
  });

  it('uses uid as tutorId when available', () => {
    const tutorWithUid = { ...baseTutor, uid: 99 };
    render(<ModernTutorCard tutor={tutorWithUid} course="Cálculo" />);

    fireEvent.click(screen.getByText('Ver reseñas'));

    const reviewsList = screen.getByTestId('reviews-list');
    expect(reviewsList.dataset.tutorId).toBe('99');
  });
});
