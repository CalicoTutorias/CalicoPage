/**
 * SessionsPanel — the Today / Upcoming / History box of the tutor and student
 * homes: a session in progress keeps its Meet button on the row, a click on the
 * row opens the session detail, and a student sees which past sessions still
 * wait for their review.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionsPanel from '@/app/components/SessionsPanel/SessionsPanel';
import { TutoringSessionService } from '@/app/services/core/TutoringSessionService';

jest.mock('@/app/services/core/TutoringSessionService', () => ({
  TutoringSessionService: { getTutorSessions: jest.fn(), getStudentSessions: jest.fn() },
}));
jest.mock('@/app/context/SecureAuthContext', () => ({
  useAuth: () => ({ user: { uid: 'student-1' } }),
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

function session(id, startOffsetMin, { minutes = 60, status = 'Accepted', course = 'Cálculo', reviews = [] } = {}) {
  const start = new Date(Date.now() + startOffsetMin * MINUTE);
  return {
    id,
    status,
    startTimestamp: start.toISOString(),
    endTimestamp: new Date(start.getTime() + minutes * MINUTE).toISOString(),
    googleMeetLink: `https://meet.google.com/${id}`,
    course: { name: course },
    tutor: { name: 'Laura Tutora' },
    participants: [{ student: { name: 'Ana' } }],
    reviews,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tutor', () => {
  it('keeps the Meet button on a session in progress and opens the detail on click', async () => {
    TutoringSessionService.getTutorSessions.mockResolvedValue([session('live', -10, { course: 'Física' })]);

    render(<SessionsPanel role="tutor" />);

    const join = await screen.findByRole('link', { name: /sessionsPanel.joinMeet/ });
    expect(join).toHaveAttribute('href', 'https://meet.google.com/live');
    expect(screen.getByText('sessionsPanel.phase.live')).toBeInTheDocument();
    expect(screen.getByText(/sessionsPanel.student/)).toHaveTextContent('Ana');

    fireEvent.click(screen.getByRole('button', { name: 'sessionsPanel.openDetail' }));
    expect(screen.getByTestId('detail')).toHaveTextContent('live');
  });

  it('switches to the history tab and lists past sessions there', async () => {
    TutoringSessionService.getTutorSessions.mockResolvedValue([session('old', -3 * 24 * 60, { course: 'Álgebra' })]);

    render(<SessionsPanel role="tutor" />);

    fireEvent.click(await screen.findByRole('tab', { name: /sessionsPanel.tabs.history/ }));

    expect(screen.getByText('Álgebra')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /joinMeet/ })).not.toBeInTheDocument();
  });
});

describe('student', () => {
  it('loads the student sessions and shows the tutor on each row', async () => {
    TutoringSessionService.getStudentSessions.mockResolvedValue([session('soon', 5)]);

    render(<SessionsPanel role="student" />);

    expect(await screen.findByText(/sessionsPanel.tutor/)).toHaveTextContent('Laura Tutora');
    expect(TutoringSessionService.getTutorSessions).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /sessionsPanel.joinMeet/ })).toBeInTheDocument();
  });

  it('asks to rate a past session the student has not reviewed, and not one already reviewed', async () => {
    TutoringSessionService.getStudentSessions.mockResolvedValue([
      session('pending-review', -3 * 24 * 60, { course: 'Sin reseña' }),
      session('reviewed', -4 * 24 * 60, {
        course: 'Con reseña',
        reviews: [{ studentId: 'student-1', status: 'done' }],
      }),
    ]);

    render(<SessionsPanel role="student" />);
    fireEvent.click(await screen.findByRole('tab', { name: /sessionsPanel.tabs.history/ }));

    const rows = screen.getAllByRole('button', { name: 'sessionsPanel.openDetail' });
    expect(rows[0]).toHaveTextContent('sessionsPanel.reviewDue');
    expect(rows[1]).not.toHaveTextContent('sessionsPanel.reviewDue');
  });
});
