import { fireEvent, render, screen } from '@testing-library/react';
import ApplyTutorPage from '@/app/home/apply-tutor/page';

const mockAuth = { user: { isLoggedIn: true, isTutorApproved: false }, refreshUserData: jest.fn() };
jest.mock('@/app/context/SecureAuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

// Two courses share a name: the tester could not tell "Estática" from "Estática".
const COURSES = [
  { id: 'c1', name: 'Estadística', code: 'MATE2510' },
  { id: 'c2', name: 'Estática', code: 'IMEC1410' },
  { id: 'c3', name: 'Estática', code: 'ICYA1101' },
  { id: 'c4', name: 'Estrategia', code: 'ADMI3101' },
];

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, courses: COURSES }) });
});

async function openForm() {
  render(<ApplyTutorPage />);
  fireEvent.click(screen.getByRole('button', { name: /quiero aplicar/i }));
  await screen.findByText('IMEC1410');
}

it('shows each course code so same-name courses can be told apart', async () => {
  await openForm();
  expect(screen.getByText('IMEC1410')).toBeInTheDocument();
  expect(screen.getByText('ICYA1101')).toBeInTheDocument();
});

it('filters the course chips by name without accents, or by code', async () => {
  await openForm();
  const search = screen.getByRole('searchbox', { name: 'profile.applyTutor.searchCourses' });

  fireEvent.change(search, { target: { value: 'estatica' } });
  expect(screen.getByText('IMEC1410')).toBeInTheDocument();
  expect(screen.getByText('ICYA1101')).toBeInTheDocument();
  expect(screen.queryByText('ADMI3101')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'ICYA1101' } });
  expect(screen.getByText('ICYA1101')).toBeInTheDocument();
  expect(screen.queryByText('IMEC1410')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'zzzz' } });
  expect(screen.getByText('profile.applyTutor.noCoursesMatch')).toBeInTheDocument();
});
