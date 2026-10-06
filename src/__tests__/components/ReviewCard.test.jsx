import React from 'react';
import { render, screen } from '@testing-library/react';
import ReviewCard from '@/app/components/TutorProfile/ReviewCard';

describe('ReviewCard', () => {
  it('shows the event title as the tag for event reviews', () => {
    render(
      <ReviewCard
        review={{ id: '1', rating: 5, comment: 'x', student: { name: 'Ana' }, course: null, session: null, event: { title: 'Repaso Cálculo' } }}
      />
    );
    expect(screen.getByText('Repaso Cálculo')).toBeInTheDocument();
  });

  it('prefers the event title over the course name when the event has a course', () => {
    render(
      <ReviewCard
        review={{ id: '2', rating: 4, comment: null, student: { name: 'Ana' }, course: { name: 'Cálculo Integral' }, session: null, event: { title: 'Repaso Parcial 2' } }}
      />
    );
    expect(screen.getByText('Repaso Parcial 2')).toBeInTheDocument();
    expect(screen.queryByText('Cálculo Integral')).not.toBeInTheDocument();
  });

  it('shows the course name for a session review', () => {
    render(
      <ReviewCard
        review={{ id: '3', rating: 5, comment: null, student: { name: 'Ana' }, course: null, session: { course: { name: 'Física I' } }, event: null }}
      />
    );
    expect(screen.getByText('Física I')).toBeInTheDocument();
  });
});
