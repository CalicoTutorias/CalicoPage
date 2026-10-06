/**
 * EventCard — public listing card. i18n comes from the global setupTests mock
 * (t reads en.json; formatCurrency formats COP with es-CO).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import EventCard from '@/app/components/Events/EventCard';

const baseEvent = {
  id: 'e1',
  slug: 'repaso-calculo-ab12',
  title: 'Repaso de Cálculo',
  description: 'Parcial 2',
  coverImageUrl: null,
  startsAt: '2026-10-10T23:00:00.000Z',
  endsAt: '2026-10-11T01:00:00.000Z',
  modality: 'Virtual',
  location: null,
  price: 0,
  earlyBird: null,
  status: 'Published',
  isListed: true,
  registrationOpen: true,
  hasEnded: false,
  course: null,
  tutors: [],
};

describe('EventCard', () => {
  it('renders "Free" for a price of 0 and links to the event page', () => {
    render(<EventCard event={baseEvent} />);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Repaso de Cálculo')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/eventos/repaso-calculo-ab12');
  });

  it('shows the original price struck through, the discounted price and the early-bird badge', () => {
    render(
      <EventCard
        event={{
          ...baseEvent,
          price: 20000,
          earlyBird: { slots: 10, percent: 20, remaining: 3, discountedPrice: 16000 },
        }}
      />,
    );
    const original = screen.getByText(/20\.000/);
    expect(original.closest('s')).not.toBeNull();
    const discounted = screen.getByText(/16\.000/);
    expect(discounted.closest('s')).toBeNull();
    expect(screen.getByText('3 spots left with 20% off')).toBeInTheDocument();
  });

  it('uses the singular badge when exactly one early-bird spot remains', () => {
    render(
      <EventCard
        event={{
          ...baseEvent,
          price: 20000,
          earlyBird: { slots: 10, percent: 20, remaining: 1, discountedPrice: 16000 },
        }}
      />,
    );
    expect(screen.getByText('1 spot left with 20% off')).toBeInTheDocument();
  });

  it('shows no badge (and no discount) when no early-bird spots remain', () => {
    render(
      <EventCard
        event={{
          ...baseEvent,
          price: 20000,
          earlyBird: { slots: 10, percent: 20, remaining: 0, discountedPrice: 16000 },
        }}
      />,
    );
    expect(screen.queryByText(/spots left/)).toBeNull();
    expect(screen.getByText(/20\.000/).closest('s')).toBeNull();
    expect(screen.queryByText(/16\.000/)).toBeNull();
  });

  it('shows the Colombia-time hint and the modality', () => {
    render(<EventCard event={{ ...baseEvent, modality: 'InPerson', location: 'ML-515' }} />);
    expect(screen.getByText(/Colombia time/)).toBeInTheDocument();
    expect(screen.getByText('In person')).toBeInTheDocument();
  });
});
