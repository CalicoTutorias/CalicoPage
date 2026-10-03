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
});
