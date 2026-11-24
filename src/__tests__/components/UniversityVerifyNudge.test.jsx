import { fireEvent, render, screen } from '@testing-library/react';
import UniversityVerifyNudge from '@/app/components/UniversityVerifyNudge/UniversityVerifyNudge';

const mockAuth = { user: { isLoggedIn: true, verifiedUniversity: null }, loading: false };
jest.mock('@/app/context/SecureAuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));

const KEY = 'calico_university_nudge_dismissed_at';

beforeEach(() => {
  window.localStorage.clear();
  mockAuth.user = { isLoggedIn: true, verifiedUniversity: null };
  mockAuth.loading = false;
});

it('invites a tutor without the badge, linking to the profile card', () => {
  render(<UniversityVerifyNudge role="tutor" />);
  expect(screen.getByText('university.nudge.tutorTitle')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /university.nudge.cta/ })).toHaveAttribute('href', '/home/profile#correo-universitario');
});

it('uses the student copy for students', () => {
  render(<UniversityVerifyNudge role="student" />);
  expect(screen.getByText('university.nudge.studentTitle')).toBeInTheDocument();
});

it('is silent once verified, or logged out', () => {
  mockAuth.user = { isLoggedIn: true, verifiedUniversity: 'uniandes' };
  const { container, rerender } = render(<UniversityVerifyNudge />);
  expect(container).toBeEmptyDOMElement();
  mockAuth.user = { isLoggedIn: false };
  rerender(<UniversityVerifyNudge />);
  expect(container).toBeEmptyDOMElement();
});

it('dismissing hides it and remembers it for 30 days', () => {
  const { container } = render(<UniversityVerifyNudge />);
  fireEvent.click(screen.getByRole('button', { name: 'university.nudge.dismiss' }));
  expect(container).toBeEmptyDOMElement();
  expect(Number(window.localStorage.getItem(KEY))).toBeGreaterThan(0);
});

it('comes back after 30 days', () => {
  window.localStorage.setItem(KEY, String(Date.now() - 31 * 86_400_000));
  render(<UniversityVerifyNudge />);
  expect(screen.getByText('university.nudge.studentTitle')).toBeInTheDocument();
});

it('stays hidden within the 30 days', () => {
  window.localStorage.setItem(KEY, String(Date.now() - 2 * 86_400_000));
  const { container } = render(<UniversityVerifyNudge />);
  expect(container).toBeEmptyDOMElement();
});
