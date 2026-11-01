/**
 * Register page: passwords never reach localStorage, leftovers from older
 * versions are not restored, and the return target survives the whole flow.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from '@/app/auth/register/page';
import { AuthService } from '@/app/services/utils/AuthService';

const mockPush = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => mockSearch,
}));

jest.mock('@/app/services/utils/AuthService', () => ({
  AuthService: { register: jest.fn() },
}));

const STORAGE_KEY = 'register_form_data';
const SECRET = 'Secreta123!';
const CAREER = '11111111-1111-4111-8111-111111111111';
const TARGET = '/eventos/repaso-x?asistencia=abc123';

const passwordInputs = () => Array.from(document.querySelectorAll('input[type="password"]'));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockSearch = new URLSearchParams();
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({ success: true, majors: [{ id: CAREER, name: 'Ingeniería' }] }),
  });
});

it('never stores the passwords the person types', async () => {
  render(<RegisterPage />);
  const [password, confirm] = passwordInputs();

  fireEvent.change(password, { target: { value: SECRET } });
  fireEvent.change(confirm, { target: { value: SECRET } });

  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());
  expect(localStorage.getItem(STORAGE_KEY)).not.toContain(SECRET);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).not.toHaveProperty('password');
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).not.toHaveProperty('confirmPassword');
});

it('wipes passwords an older version left behind, while keeping the rest of the form', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Ana', password: SECRET, confirmPassword: SECRET }));
  render(<RegisterPage />);

  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toContain(SECRET));
  passwordInputs().forEach((input) => expect(input.value).toBe(''));
  expect(screen.getByDisplayValue('Ana')).toBeInTheDocument();
});

it('keeps the return target on the link back to login', () => {
  mockSearch = new URLSearchParams({ returnTo: TARGET });
  render(<RegisterPage />);
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  expect(hrefs).toContain(`/auth/login?returnTo=${encodeURIComponent(TARGET)}`);
});

it('ignores an off-site target', () => {
  mockSearch = new URLSearchParams({ returnTo: 'https://evil.example' });
  render(<RegisterPage />);
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  expect(hrefs).toContain('/auth/login');
  expect(AuthService.register).not.toHaveBeenCalled();
});
