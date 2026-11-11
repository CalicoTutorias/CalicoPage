/**
 * TutorSessionsPanel — the tutor home's Today / Upcoming / History box: a
 * session in progress keeps its Meet button on the row, and a click on the row
 * opens the session detail (link, attachments, materials).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorSessionsPanel from '@/app/components/TutorSessionsPanel/TutorSessionsPanel';
import { TutoringSessionService } from '@/app/services/core/TutoringSessionService';

jest.mock('@/app/services/core/TutoringSessionService', () => ({
  TutoringSessionService: { getTutorSessions: jest.fn() },
}));
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, vars) => (vars?.count != null ? `${key}:${vars.count}` : key),
    locale: 'es',
    formatDate: () => 'mié 11 nov',
  }),
}));
jest.mock('@/app/components/SessionDetailView/SessionDetailView', () => function SessionDetailMock({ session }) {
  return <div data-testid="detail">{session.id}</div>;
});

const MINUTE = 60_000;

function session(id, startOffsetMin, { minutes = 60, status = 'Accepted', course = 'Cálculo' } = {}) {
  const start = new Date(Date.now() + startOffsetMin * MINUTE);
  return {
    id,
    status,
    startTimestamp: start.toISOString(),
    endTimestamp: new Date(start.getTime() + minutes * MINUTE).toISOString(),
    googleMeetLink: `https://meet.google.com/${id}`,
    course: { name: course },
    participants: [{ student: { name: 'Ana' } }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('keeps the Meet button on a session in progress and opens the detail on click', async () => {
  TutoringSessionService.getTutorSessions.mockResolvedValue([session('live', -10, { course: 'Física' })]);

  render(<TutorSessionsPanel />);

  const join = await screen.findByRole('link', { name: /tutorHome.sessionsPanel.joinMeet/ });
  expect(join).toHaveAttribute('href', 'https://meet.google.com/live');
  expect(screen.getByText('tutorHome.sessionsPanel.phase.live')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'tutorHome.sessionsPanel.openDetail' }));
  expect(screen.getByTestId('detail')).toHaveTextContent('live');
});

it('switches to the history tab and lists past sessions there', async () => {
  TutoringSessionService.getTutorSessions.mockResolvedValue([
    session('old', -3 * 24 * 60, { course: 'Álgebra' }),
  ]);

  render(<TutorSessionsPanel />);

  fireEvent.click(await screen.findByRole('tab', { name: /tutorHome.sessionsPanel.tabs.history/ }));

  expect(screen.getByText('Álgebra')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /joinMeet/ })).not.toBeInTheDocument();
});
