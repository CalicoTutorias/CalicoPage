/**
 * PastEventCard — one event of the public history: attendance out of sign-ups,
 * the rating only from 3 ratings, and a mark when the viewer attended.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PastEventCard from '@/app/components/Events/PastEventCard';

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    locale: 'es',
  }),
}));

function event(results) {
  return {
    id: 'e1',
    slug: 'repaso-grafos',
    title: 'Repaso Parcial 3 – EDA: Grafos',
    startsAt: '2026-11-01T15:00:00.000Z',
    course: { code: 'ISIS1225' },
    tutors: [{ id: 't1', name: 'Adriahn Pardo' }],
    results,
  };
}

it('shows attendance, the average with its count, and links to the event page', () => {
  render(<PastEventCard event={event({ registered: 35, attended: 33, ratingCount: 33, ratingAverage: 4.6 })} />);

  expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('/eventos/repaso-grafos'));
  expect(screen.getByText(/events.past.attendance/)).toHaveTextContent('"attended":33,"registered":35');
  expect(screen.getByText(/events.past.rating_other/)).toHaveTextContent('"average":"4,6","count":33');
  expect(screen.getByText('ISIS1225 · Adriahn Pardo')).toBeInTheDocument();
  expect(screen.queryByText('events.past.youAttended')).not.toBeInTheDocument();
});

it('says there are few ratings instead of an average from one or two', () => {
  render(<PastEventCard event={event({ registered: 3, attended: 2, ratingCount: 2, ratingAverage: null })} />);

  expect(screen.getByText(/events.past.fewRatings/)).toHaveTextContent('"count":2');
});

it('marks an event the viewer attended', () => {
  render(<PastEventCard event={event({ registered: 3, attended: 3, ratingCount: 0, ratingAverage: null })} attended />);

  expect(screen.getByText('events.past.youAttended')).toBeInTheDocument();
  expect(screen.getByText('events.past.noRatings')).toBeInTheDocument();
});
