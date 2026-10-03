/**
 * StudentEventsSection — upcoming confirmed events + suggestions on the
 * student home. Strings come from en.json via the global i18n mock.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import StudentEventsSection from '@/app/components/Events/StudentEventsSection';
import { EventService } from '@/app/services/core/EventService';

jest.mock('@/app/services/core/EventService', () => {
  const EventService = { getMyEvents: jest.fn(), listPublic: jest.fn() };
  return { __esModule: true, EventService, default: EventService };
});

jest.mock('@/app/components/Events/EventCard', () => ({
  __esModule: true,
  default: ({ event }) => <div>card-{event.title}</div>,
}));

const NOW = new Date('2026-10-03T15:00:00Z');
const iso = (minutes) => new Date(NOW.getTime() + minutes * 60000).toISOString();
const ev = (id, startMin, durMin = 60) => ({
  id,
  slug: id,
  title: `Evento ${id}`,
  startsAt: iso(startMin),
  endsAt: iso(startMin + durMin),
  modality: 'Virtual',
});
const reg = (event, extra = {}) => ({
  id: `r-${event.id}`,
  status: 'Confirmed',
  meetingUrl: 'https://meet.example/x',
  event,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe('StudentEventsSection', () => {
  it('excludes registered events from the suggestions and caps them at 3', async () => {
    EventService.getMyEvents.mockResolvedValue({ success: true, registrations: [reg(ev('mine', 600))] });
    EventService.listPublic.mockResolvedValue({
      success: true,
      events: [ev('mine', 600), ev('a', 700), ev('b', 800), ev('c', 900), ev('d', 1000)],
    });
    render(<StudentEventsSection />);
    expect(await screen.findByText('card-Evento a')).toBeInTheDocument();
    expect(screen.getByText('card-Evento c')).toBeInTheDocument();
    expect(screen.queryByText('card-Evento mine')).not.toBeInTheDocument();
    expect(screen.queryByText('card-Evento d')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all events/i })).toHaveAttribute('href', '/eventos');
  });

  it('renders nothing when both lists are empty', async () => {
    EventService.getMyEvents.mockResolvedValue({ success: true, registrations: [] });
    EventService.listPublic.mockResolvedValue({ success: true, events: [] });
    const { container } = render(<StudentEventsSection />);
    await waitFor(() => expect(EventService.listPublic).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Join" only within 15 minutes of the start (or while live)', async () => {
    EventService.getMyEvents.mockResolvedValue({
      success: true,
      registrations: [
        reg(ev('soon', 10)),
        reg(ev('live', -20)),
        reg(ev('later', 16)),
        reg(ev('over', -90)),
        reg(ev('pending', 5), { status: 'Pending' }),
      ],
    });
    EventService.listPublic.mockResolvedValue({ success: true, events: [] });
    render(<StudentEventsSection />);
    await screen.findByText('Evento soon');
    expect(screen.getAllByRole('link', { name: 'Join' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'View event' })).toHaveLength(1);
    expect(screen.queryByText('Evento over')).not.toBeInTheDocument();
    expect(screen.queryByText('Evento pending')).not.toBeInTheDocument();
    // Sorted by start: live, soon, later.
    const titles = screen.getAllByText(/^Evento /).map((n) => n.textContent);
    expect(titles).toEqual(['Evento live', 'Evento soon', 'Evento later']);
  });
});
