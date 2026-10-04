/**
 * Tutor "Mis eventos" — upcoming/past split by endsAt, canceled badge, empty state.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('lists Canceled events after the active ones (date order inside each group) without their meeting link', async () => {
    EventService.getTutorEvents.mockResolvedValue({
      success: true,
      events: [
        ev('canceledSoon', 2, 3, { status: 'Canceled', meetingUrl: 'https://meet.example/canceled-soon' }),
        ev('later', 48, 49),
        ev('canceledLater', 72, 73, { status: 'Canceled', meetingUrl: 'https://meet.example/canceled-later' }),
        ev('soon', 4, 5),
        ev('oldCanceled', -24, -23, { status: 'Canceled', meetingUrl: 'https://meet.example/old-canceled' }),
        ev('old', -48, -47),
      ],
    });
    render(<TutorEventosPage />);

    const titles = (list) => within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.replace('Canceled', ''));
    const upcoming = await screen.findByTestId('tutor-events-upcoming');
    expect(titles(upcoming)).toEqual(['Evento soon', 'Evento later', 'Evento canceledSoon', 'Evento canceledLater']);
    expect(titles(screen.getByTestId('tutor-events-past'))).toEqual(['Evento old', 'Evento oldCanceled']);

    expect(screen.queryByText(/meet\.example\/(canceled|old-canceled)/)).toBeNull();
    expect(screen.getAllByText(/meet\.example\/x/)).toHaveLength(3);
  });

  it('says "1 confirmed registration" in the singular and keeps the plural otherwise', async () => {
    EventService.getTutorEvents.mockResolvedValue({
      success: true,
      events: [ev('one', 4, 5, { confirmedCount: 1 }), ev('many', 24, 25)],
    });
    render(<TutorEventosPage />);

    expect(await screen.findByText(/^1 confirmed registration ·/)).toBeInTheDocument();
    expect(screen.getByText(/^7 confirmed registrations ·/)).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    EventService.getTutorEvents.mockResolvedValue({ success: true, events: [] });
    render(<TutorEventosPage />);
    await waitFor(() => expect(screen.getByText('You are not teaching any events yet')).toBeInTheDocument());
  });
});
