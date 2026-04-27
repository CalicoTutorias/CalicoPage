/**
 * Unit tests for ModernTutorCard - Unified Tutor Card Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModernTutorCard from '@/app/components/ModernTutorCard/ModernTutorCard';

// Mock i18n
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      const translations = {
        'tutorCard.tutorFallback': 'Tutor',
        'availability.tutorCard.reserve': 'Reservar',
      };
      return translations[key] || key;
    }
  })
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ModernTutorCard', () => {
  const baseTutor = {
    id: 10,
    name: 'Carlos García',
    profilePictureUrl: null,
    tutorProfile: {
      review: 4.7,
      bio: 'Tutor especializado en cálculo y análisis',
      tutorCourses: [
        {
          courseId: 'calc-101',
          experience: 'Enseño cálculo diferencial desde hace 5 años',
          course: { id: 'calc-101', name: 'Cálculo I' }
        }
      ]
    }
  };

  it('renders tutor name and rating', () => {
    render(<ModernTutorCard tutor={baseTutor} />);

    expect(screen.getByText('Carlos García')).toBeInTheDocument();
    expect(screen.getByText('4.7')).toBeInTheDocument();
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('displays bio when no course is selected', () => {
    render(<ModernTutorCard tutor={baseTutor} course={null} />);

    expect(screen.getByText('Tutor especializado en cálculo y análisis')).toBeInTheDocument();
  });

  it('displays experience when course is selected', () => {
    render(<ModernTutorCard tutor={baseTutor} course="calc-101" />);

    expect(screen.getByText('Enseño cálculo diferencial desde hace 5 años')).toBeInTheDocument();
  });

  it('displays "Reservar" button', () => {
    render(<ModernTutorCard tutor={baseTutor} />);

    expect(screen.getByText('Reservar')).toBeInTheDocument();
  });

  it('does NOT display reviews button', () => {
    render(<ModernTutorCard tutor={baseTutor} />);

    expect(screen.queryByText(/reseña|review/i)).not.toBeInTheDocument();
  });

  it('calls onReservar when "Reservar" button is clicked', () => {
    const onReservar = jest.fn();
    render(<ModernTutorCard tutor={baseTutor} onReservar={onReservar} />);

    fireEvent.click(screen.getByText('Reservar'));

    expect(onReservar).toHaveBeenCalledWith(baseTutor);
  });

  it('displays tutor name as fallback when name is missing', () => {
    const tutorNoName = { ...baseTutor, name: undefined };
    render(<ModernTutorCard tutor={tutorNoName} />);

    expect(screen.getByText('Tutor')).toBeInTheDocument();
  });

  it('displays initials in avatar', () => {
    render(<ModernTutorCard tutor={baseTutor} />);

    expect(screen.getByText('CG')).toBeInTheDocument();
  });

  it('handles tutor with no rating gracefully', () => {
    const tutorNoRating = {
      ...baseTutor,
      tutorProfile: { ...baseTutor.tutorProfile, review: 0 }
    };
    render(<ModernTutorCard tutor={tutorNoRating} />);

    // Should not show rating badge if rating is 0
    expect(screen.queryByText('★')).not.toBeInTheDocument();
  });

  it('finds correct course experience in tutorCourses array', () => {
    const tutorMultipleCourses = {
      ...baseTutor,
      tutorProfile: {
        ...baseTutor.tutorProfile,
        tutorCourses: [
          {
            courseId: 'calc-101',
            experience: 'Experiencia en cálculo I',
            course: { id: 'calc-101', name: 'Cálculo I' }
          },
          {
            courseId: 'algebra-101',
            experience: 'Experiencia en álgebra avanzada',
            course: { id: 'algebra-101', name: 'Álgebra I' }
          }
        ]
      }
    };

    render(<ModernTutorCard tutor={tutorMultipleCourses} course="algebra-101" />);

    expect(screen.getByText('Experiencia en álgebra avanzada')).toBeInTheDocument();
    expect(screen.queryByText('Experiencia en cálculo I')).not.toBeInTheDocument();
  });
});
