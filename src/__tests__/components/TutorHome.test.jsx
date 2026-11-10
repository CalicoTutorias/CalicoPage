/**
 * TutorHome — the course tiles show how many tutors students really see for each
 * course, as the API reports it (they used to show a random number).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TutorHome from '@/app/components/TutorHome/TutorHome';
import { authFetch } from '@/app/services/authFetch';

jest.mock('@/app/services/authFetch', () => ({ authFetch: jest.fn() }));
jest.mock('@/app/services/core/TutoringSessionService', () => ({
  TutoringSessionService: { getTutorSessions: jest.fn(() => Promise.resolve([])) },
}));
jest.mock('@/app/context/SecureAuthContext', () => ({
  useAuth: () => ({ user: { isLoggedIn: true, uid: 'tutor-1' } }),
}));
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => ({ 'boxCourse.tutor': 'tutor', 'boxCourse.tutors': 'tutors', 'tutorCourses.status.paused': 'Paused' }[key] ?? key),
    locale: 'en',
  }),
}));
jest.mock('@/app/components/Welcome/Welcome', () => () => null);
jest.mock('@/app/components/NewsFeed/NewsFeed', () => () => null);
jest.mock('@/app/components/GoogleCalendarButton/GoogleCalendarButton', () => () => null);
jest.mock('@/app/components/TutoringSummary/TutoringSummary', () => () => null);

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
