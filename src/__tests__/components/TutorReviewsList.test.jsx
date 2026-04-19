/**
 * Unit tests for TutorReviewsList component
 * Validates rendering states: loading, empty, with reviews.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TutorReviewsList from '@/app/components/TutorReviewsList/TutorReviewsList';

// Mock UserService
jest.mock('@/app/services/core/UserService', () => ({
  UserService: {
    getReviewsReceived: jest.fn(),
    getReviewStats: jest.fn(),
  },
}));

const { UserService } = require('@/app/services/core/UserService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TutorReviewsList', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TutorReviewsList tutorId={1} isOpen={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows loading state when fetching reviews', () => {
    // Never resolve to keep loading state
    UserService.getReviewsReceived.mockReturnValue(new Promise(() => {}));
    UserService.getReviewStats.mockReturnValue(new Promise(() => {}));

    render(<TutorReviewsList tutorId={1} isOpen={true} />);

    expect(screen.getByText('Cargando reseñas...')).toBeInTheDocument();
  });

  it('shows empty message when tutor has no reviews', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [],
      count: 0,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 0,
      count: 0,
    });

    render(<TutorReviewsList tutorId={1} isOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText('Este tutor aún no tiene reseñas.')).toBeInTheDocument();
    });
  });

  it('renders reviews with student name, rating stars, and comment', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [
        {
          id: 'r1',
          rating: 5,
          status: 'completed',
          comment: 'Excelente tutor, muy paciente.',
          student: { id: 1, name: 'Ana García', profilePictureUrl: null },
          session: { id: 's1', course: { name: 'Cálculo I' } },
        },
        {
          id: 'r2',
          rating: 4,
          status: 'completed',
          comment: 'Buen manejo del tema.',
          student: { id: 2, name: 'Luis Pérez', profilePictureUrl: 'https://example.com/photo.jpg' },
          session: { id: 's2', course: { name: 'Física I' } },
        },
      ],
      count: 2,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 4.5,
      count: 2,
    });

    render(<TutorReviewsList tutorId={10} isOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('2 reseñas')).toBeInTheDocument();
    });

    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('Excelente tutor, muy paciente.')).toBeInTheDocument();
    expect(screen.getByText('Cálculo I')).toBeInTheDocument();

    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByText('Buen manejo del tema.')).toBeInTheDocument();
    expect(screen.getByText('Física I')).toBeInTheDocument();
  });

  it('shows singular "reseña" when count is 1', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [
        {
          id: 'r1',
          rating: 5,
          status: 'completed',
          comment: 'Genial',
          student: { id: 1, name: 'Ana' },
          session: { id: 's1', course: { name: 'Cálculo' } },
        },
      ],
      count: 1,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 5,
      count: 1,
    });

    render(<TutorReviewsList tutorId={10} isOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText('1 reseña')).toBeInTheDocument();
    });
  });

  it('filters out non-completed reviews', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [
        {
          id: 'r1',
          rating: 5,
          status: 'completed',
          comment: 'Visible review',
          student: { id: 1, name: 'Ana' },
          session: { id: 's1', course: { name: 'Cálculo' } },
        },
        {
          id: 'r2',
          rating: null,
          status: 'pending',
          comment: null,
          student: { id: 2, name: 'Pedro' },
          session: { id: 's2', course: { name: 'Física' } },
        },
      ],
      count: 2,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 5,
      count: 1,
    });

    render(<TutorReviewsList tutorId={10} isOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText('Visible review')).toBeInTheDocument();
    });

    expect(screen.queryByText('Pedro')).not.toBeInTheDocument();
  });

  it('does not refetch when closed and reopened (already loaded)', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [],
      count: 0,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 0,
      count: 0,
    });

    const { rerender } = render(
      <TutorReviewsList tutorId={10} isOpen={true} />
    );

    await waitFor(() => {
      expect(UserService.getReviewsReceived).toHaveBeenCalledTimes(1);
    });

    // Close
    rerender(<TutorReviewsList tutorId={10} isOpen={false} />);
    // Reopen
    rerender(<TutorReviewsList tutorId={10} isOpen={true} />);

    // Should not have fetched again
    expect(UserService.getReviewsReceived).toHaveBeenCalledTimes(1);
  });

  it('renders student avatar placeholder when no profile picture', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [
        {
          id: 'r1',
          rating: 4,
          status: 'completed',
          comment: 'Bueno',
          student: { id: 1, name: 'Carlos', profilePictureUrl: null },
          session: { id: 's1', course: { name: 'Cálculo' } },
        },
      ],
      count: 1,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 4,
      count: 1,
    });

    render(<TutorReviewsList tutorId={10} isOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText('C')).toBeInTheDocument(); // Initial of "Carlos"
    });
  });

  it('renders student profile picture when available', async () => {
    UserService.getReviewsReceived.mockResolvedValue({
      success: true,
      reviews: [
        {
          id: 'r1',
          rating: 5,
          status: 'completed',
          comment: 'Genial',
          student: { id: 1, name: 'María', profilePictureUrl: 'https://example.com/maria.jpg' },
          session: { id: 's1', course: { name: 'Cálculo' } },
        },
      ],
      count: 1,
    });
    UserService.getReviewStats.mockResolvedValue({
      success: true,
      average: 5,
      count: 1,
    });

    render(<TutorReviewsList tutorId={10} isOpen={true} />);

    await waitFor(() => {
      const img = screen.getByAltText('María');
      expect(img).toBeInTheDocument();
      expect(img.src).toBe('https://example.com/maria.jpg');
    });
  });
});
