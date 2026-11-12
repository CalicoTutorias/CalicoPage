/**
 * TutorHome — the course tiles show how many tutors students really see for each
 * course, as the API reports it (they used to show a random number), and the
 * weekly figures come from GET /api/tutor/stats (they used to be a fixed 0).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TutorHome from '@/app/components/TutorHome/TutorHome';
import { authFetch } from '@/app/services/authFetch';
import { TutoringSessionService } from '@/app/services/core/TutoringSessionService';

jest.mock('@/app/services/authFetch', () => ({ authFetch: jest.fn() }));
jest.mock('@/app/services/core/TutoringSessionService', () => ({
  TutoringSessionService: {
    getTutorSessions: jest.fn(() => Promise.resolve([])),
    getTutorDashboardStats: jest.fn(() => Promise.resolve(null)),
  },
}));
jest.mock('@/app/context/SecureAuthContext', () => ({
  useAuth: () => ({ user: { isLoggedIn: true, uid: 'tutor-1' } }),
}));
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => ({ 'boxCourse.tutor': 'tutor', 'boxCourse.tutors': 'tutors', 'tutorCourses.status.paused': 'Paused' }[key] ?? key),
    locale: 'en',
    formatCurrency: (n) => `$${n}`,
  }),
}));
jest.mock('@/app/components/Welcome/Welcome', () => () => null);
jest.mock('@/app/components/NewsFeed/NewsFeed', () => () => null);
jest.mock('@/app/components/GoogleCalendarButton/GoogleCalendarButton', () => () => null);
jest.mock('@/app/components/SessionsPanel/SessionsPanel', () => () => null);

const tile = (id, name, availableTutorCount, status = 'Approved') => ({
  courseId: id, status, course: { id, name, availableTutorCount },
});

function mockCourses(courses) {
  authFetch.mockImplementation(async (url) => (
    url.startsWith('/api/tutor/courses')
      ? { ok: true, data: { success: true, courses } }
      : { ok: true, data: { success: true, profile: {} } }
  ));
}

const secondLine = (name) => screen.getByText(name).nextElementSibling;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TutorHome course tiles', () => {
  it('asks the API for the count and shows it as it comes', async () => {
    mockCourses([tile('c1', 'Cálculo', 3), tile('c2', 'Álgebra', 1), tile('c3', 'Física', 0)]);

    render(<TutorHome userName="Ana" />);

    expect(await screen.findByText('Cálculo')).toBeInTheDocument();
    expect(authFetch).toHaveBeenCalledWith('/api/tutor/courses?withTutorCount=1');
    expect(secondLine('Cálculo')).toHaveTextContent('3 tutors');
    expect(secondLine('Álgebra')).toHaveTextContent('1 tutor');
    expect(secondLine('Física')).toHaveTextContent('0 tutors');
  });

  it('a paused course says so instead of the count', async () => {
    mockCourses([tile('c1', 'Cálculo', 3, 'Paused')]);

    render(<TutorHome userName="Ana" />);

    await screen.findByText('Cálculo');
    expect(secondLine('Cálculo')).toHaveTextContent('Paused');
    expect(secondLine('Cálculo')).not.toHaveTextContent('3');
  });
});

describe('TutorHome weekly performance', () => {
  it('shows the figures the server computed, not zeros', async () => {
    mockCourses([]);
    TutoringSessionService.getTutorDashboardStats.mockResolvedValue({
      scheduled: 1, held: 2, totalEarnings: 59500, weeklySessions: 2, weeklyEarnings: 29750, studentRetention: 100,
    });

    render(<TutorHome userName="Ana" />);

    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.getByText('$29750')).toBeInTheDocument();
    expect(screen.getByText('$59500')).toBeInTheDocument();
  });

  it('shows a dash for retention while no session was held', async () => {
    mockCourses([]);
    TutoringSessionService.getTutorDashboardStats.mockResolvedValue({
      scheduled: 0, held: 0, totalEarnings: 0, weeklySessions: 0, weeklyEarnings: 0, studentRetention: null,
    });

    render(<TutorHome userName="Ana" />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});
