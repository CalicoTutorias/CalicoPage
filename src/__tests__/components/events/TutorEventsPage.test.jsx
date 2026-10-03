/**
 * Tutor "Mis eventos" — upcoming/past split by endsAt, canceled badge, empty state.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TutorEventosPage from '@/app/tutor/eventos/page';
import { EventService } from '@/app/services/core/EventService';

jest.mock('@/app/services/core/EventService', () => {
  const EventService = { getTutorEvents: jest.fn() };
  return { __esModule: true, EventService, default: EventService };
});

const hours = (h) => new Date(Date.now() + h * 3600000).toISOString();
const ev = (id, startH, endH, extra = {}) => ({
  id,
  slug: `slug-${id}`,
  title: `Evento ${id}`,
  startsAt: hours(startH),
  endsAt: hours(endH),
  modality: 'Virtual',
  location: null,
  meetingUrl: 'https://meet.example/x',
  status: 'Published',
  confirmedCount: 7,
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('Tutor events page', () => {
  it('splits upcoming and past by endsAt and shows the canceled badge', async () => {
    EventService.getTutorEvents.mockResolvedValue({
      success: true,
      events: [
        ev('live', -1, 1),
        ev('old', -48, -47),
        ev('gone', 24, 25, { status: 'Canceled' }),
      ],
    });
    render(<TutorEventosPage />);

    const upcoming = await screen.findByTestId('tutor-events-upcoming');
    const past = screen.getByTestId('tutor-events-past');
    expect(upcoming).toHaveTextContent('Evento live');
    expect(upcoming).toHaveTextContent('Evento gone');
    expect(upcoming).not.toHaveTextContent('Evento old');
    expect(past).toHaveTextContent('Evento old');
    expect(screen.getAllByText('Canceled')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Evento live/ })).toHaveAttribute('href', '/eventos/slug-live');
  });

  it('shows the empty state', async () => {
    EventService.getTutorEvents.mockResolvedValue({ success: true, events: [] });
    render(<TutorEventosPage />);
    await waitFor(() => expect(screen.getByText('You are not teaching any events yet')).toBeInTheDocument());
  });
});
