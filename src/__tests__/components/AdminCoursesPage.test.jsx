/**
 * Admin courses page — server-paginated table, debounced server search,
 * create/edit in a modal (edit sends only the changed fields) and the pending
 * suggestions section, now approved through the same modal.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminCoursesPage from '@/app/home/admin/courses/page';
import { AdminService } from '@/app/services/core/AdminService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = {
    listAdminCourses: jest.fn(),
    listCourseSuggestions: jest.fn(),
    createCourse: jest.fn(),
    updateCourse: jest.fn(),
    approveCourseSuggestion: jest.fn(),
    rejectCourseSuggestion: jest.fn(),
  };
  return { __esModule: true, AdminService, default: AdminService };
});

const c = en.admin.courses;
const CAREERS = [
  { id: 'career-isis', code: 'ISIS', name: 'Ingeniería de Sistemas' },
  { id: 'career-mate', code: 'MATE', name: 'Matemáticas' },
];
const COURSE = {
  id: 'course-1',
  code: 'ISIS1221',
  name: 'Introducción a la Programación',
  complexity: 'Introductory',
  basePrice: '40000',
  careerId: 'career-isis',
  career: CAREERS[0],
  aliases: ['IP'],
  approvedTutorCount: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve({ majors: CAREERS }) });
  AdminService.listAdminCourses.mockResolvedValue({ success: true, courses: [COURSE], total: 45 });
  AdminService.listCourseSuggestions.mockResolvedValue({
    success: true,
    suggestions: [{ id: 'sug-1', code: 'MATE1203', name: 'Cálculo Diferencial', requester: { name: 'Ana' } }],
  });
});

it('renders the first server page with pagination and the suggestions below', async () => {
  render(<AdminCoursesPage />);

  expect(await screen.findByText('ISIS1221')).toBeInTheDocument();
  expect(AdminService.listAdminCourses).toHaveBeenCalledWith({ search: undefined, limit: 20, offset: 0 });
  expect(screen.getByText('Page 1 of 3', { exact: false })).toBeInTheDocument();
  expect(await screen.findByText('Cálculo Diferencial')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: c.table.pagination.next }));
  await waitFor(() => expect(AdminService.listAdminCourses).toHaveBeenLastCalledWith({
    search: undefined, limit: 20, offset: 20,
  }));
});

it('searches on the server after the debounce and resets to the first page', async () => {
  render(<AdminCoursesPage />);
  await screen.findByText('ISIS1221');
  fireEvent.click(screen.getByRole('button', { name: c.table.pagination.next }));
  await waitFor(() => expect(AdminService.listAdminCourses).toHaveBeenLastCalledWith({
    search: undefined, limit: 20, offset: 20,
  }));

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  calculo ' } });
  // Debounced: nothing is fetched on the keystroke itself.
  expect(AdminService.listAdminCourses).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'calculo' }));

  await waitFor(() => expect(AdminService.listAdminCourses).toHaveBeenLastCalledWith({
    search: 'calculo', limit: 20, offset: 0,
  }), { timeout: 2000 });
});

it('edits a course in the modal and sends only the changed fields', async () => {
  AdminService.updateCourse.mockResolvedValue({
    success: true,
    course: { ...COURSE, name: 'Programación', aliases: ['IP', 'Intro'] },
  });
  render(<AdminCoursesPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit ISIS1221' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(c.fields.name), { target: { value: 'Programación' } });
  fireEvent.change(within(dialog).getByLabelText(c.fields.aliases), { target: { value: 'IP, Intro, ip' } });
  fireEvent.click(within(dialog).getByRole('button', { name: c.modal.save }));

  await waitFor(() => expect(AdminService.updateCourse).toHaveBeenCalledWith('course-1', {
    name: 'Programación',
    aliases: ['IP', 'Intro'],
  }));
  expect(await screen.findByText(c.flash.updated)).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Programación')).toBeInTheDocument();
});

it('creates a course from the modal and blocks a zero price client-side', async () => {
  AdminService.createCourse.mockResolvedValue({ success: true, course: { id: 'new' } });
  render(<AdminCoursesPage />);
  await screen.findByText('ISIS1221');

  fireEvent.click(screen.getByRole('button', { name: c.create }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(c.fields.code), { target: { value: 'mate1203' } });
  fireEvent.change(within(dialog).getByLabelText(c.fields.name), { target: { value: 'Cálculo Diferencial' } });
  fireEvent.change(within(dialog).getByLabelText(c.fields.career), { target: { value: 'career-mate' } });
  fireEvent.change(within(dialog).getByLabelText(c.fields.basePrice), { target: { value: '0' } });
  fireEvent.click(within(dialog).getByRole('button', { name: c.modal.create }));

  expect(await within(dialog).findByText(c.errors.invalidPrice)).toBeInTheDocument();
  expect(AdminService.createCourse).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText(c.fields.basePrice), { target: { value: '45.000' } });
  fireEvent.click(within(dialog).getByRole('button', { name: c.modal.create }));

  await waitFor(() => expect(AdminService.createCourse).toHaveBeenCalledWith({
    code: 'MATE1203',
    name: 'Cálculo Diferencial',
    complexity: 'Introductory',
    careerId: 'career-mate',
    basePrice: 45000,
    aliases: [],
  }));
  expect(await screen.findByText(c.flash.created)).toBeInTheDocument();
});

it('shows a duplicate code from the API inside the modal', async () => {
  AdminService.updateCourse.mockResolvedValue({ success: false, error: 'COURSE_EXISTS' });
  render(<AdminCoursesPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit ISIS1221' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(c.fields.code), { target: { value: 'ISIS1222' } });
  fireEvent.click(within(dialog).getByRole('button', { name: c.modal.save }));

  expect(await within(dialog).findByText(c.errors.courseExists)).toBeInTheDocument();
});

it('approves a suggestion through the modal with career and price', async () => {
  AdminService.approveCourseSuggestion.mockResolvedValue({ success: true });
  render(<AdminCoursesPage />);

  fireEvent.click(await screen.findByRole('button', { name: c.suggestions.approve }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText(c.fields.code)).toHaveValue('MATE1203');
  expect(within(dialog).queryByLabelText(c.fields.aliases)).toBeNull();

  fireEvent.change(within(dialog).getByLabelText(c.fields.career), { target: { value: 'career-mate' } });
  fireEvent.change(within(dialog).getByLabelText(c.fields.basePrice), { target: { value: '40000' } });
  fireEvent.click(within(dialog).getByRole('button', { name: c.modal.approve }));

  await waitFor(() => expect(AdminService.approveCourseSuggestion).toHaveBeenCalledWith('sug-1', {
    code: 'MATE1203',
    name: 'Cálculo Diferencial',
    complexity: 'Introductory',
    careerId: 'career-mate',
    basePrice: 40000,
  }));
  expect(await screen.findByText(c.flash.approved)).toBeInTheDocument();
});
