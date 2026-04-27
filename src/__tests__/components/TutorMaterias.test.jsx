/**
 * Integration tests for TutorMaterias component
 * Tests: Course list display, filtering by status, add/remove course modal, loading/error/empty states
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TutorMaterias from '@/app/tutor/materias/page';
import * as authFetch from '@/app/services/authFetch';

// Mock dependencies
jest.mock('@/app/services/authFetch');
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, vars) => key, // Return key as string for testing
    locale: 'es',
  }),
}));

jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Plus: () => <div data-testid="icon-plus" />,
  Trash2: () => <div data-testid="icon-trash" />,
  Clock: () => <div data-testid="icon-clock" />,
  CheckCircle: () => <div data-testid="icon-check" />,
  XCircle: () => <div data-testid="icon-x-circle" />,
  Info: () => <div data-testid="icon-info" />,
}));

describe('TutorMaterias Component', () => {
  const mockCourses = [
    {
      tutorId: 'user-123',
      courseId: 'course-1',
      status: 'Approved',
      experience: '5 years',
      workSampleUrl: 'https://example.com/sample1.pdf',
      course: {
        id: 'course-1',
        name: 'Cálculo I',
        code: 'CALC101',
        basePrice: 50000,
        coursePrice: { price: 55000 },
      },
    },
    {
      tutorId: 'user-123',
      courseId: 'course-2',
      status: 'Pending',
      experience: '3 years',
      workSampleUrl: null,
      course: {
        id: 'course-2',
        name: 'Álgebra',
        code: 'ALG101',
        basePrice: 45000,
        coursePrice: null,
      },
    },
    {
      tutorId: 'user-123',
      courseId: 'course-3',
      status: 'Rejected',
      experience: '2 years',
      workSampleUrl: 'https://example.com/sample3.pdf',
      course: {
        id: 'course-3',
        name: 'Geometría',
        code: 'GEO101',
        basePrice: 40000,
        coursePrice: null,
      },
    },
  ];

  const mockAllCourses = [
    { id: 'course-4', name: 'Trigonometría', code: 'TRIG101', basePrice: 50000 },
    { id: 'course-5', name: 'Análisis', code: 'ANAL101', basePrice: 55000 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Loading State
  // ─────────────────────────────────────────────────────────────────────

  it('should show loading spinner while fetching courses', async () => {
    authFetch.authFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ success: true, tutorCourses: mockCourses }) }), 1000)
        )
    );

    const { rerender } = render(<TutorMaterias />);

    // Spinner should be visible initially
    expect(screen.queryByText(/loading|cargando/i)).toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Success State - Display Courses
  // ─────────────────────────────────────────────────────────────────────

  it('should display tutor courses after loading', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
      expect(screen.getByText('Álgebra')).toBeInTheDocument();
      expect(screen.getByText('Geometría')).toBeInTheDocument();
    });
  });

  it('should display correct status badge colors', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      const approvedBadge = screen.getByText(/Aprobado|Approved/);
      expect(approvedBadge.closest('span')).toHaveClass('bg-emerald-100', 'text-emerald-800');
    });
  });

  it('should display course code and pricing', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText('CALC101')).toBeInTheDocument();
      expect(screen.getByText('$55,000')).toBeInTheDocument(); // Custom price
      expect(screen.getByText('$45,000')).toBeInTheDocument(); // Base price
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Filter by Status
  // ─────────────────────────────────────────────────────────────────────

  it('should filter courses by status tab - Approved', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    // By default, "All" tab should be active, showing all courses
    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
      expect(screen.getByText('Álgebra')).toBeInTheDocument();
    });

    // Click Approved tab
    const approvedTab = screen.getByRole('button', { name: /approved|aprobado/i });
    fireEvent.click(approvedTab);

    // Should only show approved courses
    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
      expect(screen.queryByText('Álgebra')).not.toBeInTheDocument();
      expect(screen.queryByText('Geometría')).not.toBeInTheDocument();
    });
  });

  it('should filter courses by status tab - Pending', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    const pendingTab = screen.getByRole('button', { name: /pending|pendiente/i });
    fireEvent.click(pendingTab);

    await waitFor(() => {
      expect(screen.getByText('Álgebra')).toBeInTheDocument();
      expect(screen.queryByText('Cálculo I')).not.toBeInTheDocument();
      expect(screen.queryByText('Geometría')).not.toBeInTheDocument();
    });
  });

  it('should filter courses by status tab - Rejected', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    const rejectedTab = screen.getByRole('button', { name: /rejected|rechazado/i });
    fireEvent.click(rejectedTab);

    await waitFor(() => {
      expect(screen.getByText('Geometría')).toBeInTheDocument();
      expect(screen.queryByText('Cálculo I')).not.toBeInTheDocument();
      expect(screen.queryByText('Álgebra')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Empty State
  // ─────────────────────────────────────────────────────────────────────

  it('should display empty state when no courses exist', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: [] },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText(/no courses|sin cursos|no hay cursos/i)).toBeInTheDocument();
    });
  });

  it('should display empty state when tab has no matching courses', async () => {
    const filteredCourses = [mockCourses[0]]; // Only approved

    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: filteredCourses },
    });

    render(<TutorMaterias />);

    const pendingTab = screen.getByRole('button', { name: /pending|pendiente/i });
    fireEvent.click(pendingTab);

    await waitFor(() => {
      expect(screen.getByText(/no pending courses|sin cursos pendientes/i)).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Error State
  // ─────────────────────────────────────────────────────────────────────

  it('should display error message on API failure', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: false,
      data: { error: 'Failed to fetch courses' },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Add Course Modal
  // ─────────────────────────────────────────────────────────────────────

  it('should open add course modal when button clicked', async () => {
    authFetch.authFetch
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, courses: mockCourses },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, allCourses: mockAllCourses },
      });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add|agregar|\+/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/request new courses|solicitar nuevos cursos/i)).toBeInTheDocument();
    });
  });

  it('should allow adding course with experience and work sample', async () => {
    authFetch.authFetch
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, courses: mockCourses },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, allCourses: mockAllCourses },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, tutorCourses: [...mockCourses, mockAllCourses[0]] },
      });

    const { rerender } = render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
    });

    // Open modal
    const addButton = screen.getByRole('button', { name: /add|agregar/i });
    fireEvent.click(addButton);

    // Fill form
    const courseSelect = screen.getByRole('combobox', { name: /course|curso/i });
    fireEvent.change(courseSelect, { target: { value: 'course-4' } });

    const experienceInput = screen.getByRole('textbox', { name: /experience|experiencia/i });
    fireEvent.change(experienceInput, { target: { value: '5 years teaching trigonometry' } });

    const urlInput = screen.getByRole('textbox', { name: /work sample|evidencia/i });
    fireEvent.change(urlInput, { target: { value: 'https://example.com/trig-sample.pdf' } });

    // Submit
    const submitButton = screen.getByRole('button', { name: /submit|enviar|solicitar/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(authFetch.authFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tutor/courses'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('course-4'),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Remove Course
  // ─────────────────────────────────────────────────────────────────────

  it('should remove course when delete button clicked', async () => {
    authFetch.authFetch
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, courses: mockCourses },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true, courses: [mockCourses[0], mockCourses[2]] }, // Removed Álgebra
      });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
      expect(screen.getByText('Álgebra')).toBeInTheDocument();
    });

    // Find and click delete button for Álgebra course
    const algebra = screen.getByText('Álgebra');
    const deleteButton = within(algebra.closest('div')).getByRole('button', { name: /delete|trash/i });
    fireEvent.click(deleteButton);

    // Confirm deletion in modal
    const confirmButton = screen.getByRole('button', { name: /confirm|sí|yes/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(authFetch.authFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tutor/courses/course-2'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    // Course should be removed
    await waitFor(() => {
      expect(screen.queryByText('Álgebra')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Status Indicators
  // ─────────────────────────────────────────────────────────────────────

  it('should display correct status icon and color for each status', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      // Approved should have checkmark icon
      const approvedCard = screen.getByText('Cálculo I').closest('div');
      expect(within(approvedCard).getByTestId('icon-check')).toBeInTheDocument();

      // Pending should have clock icon
      const pendingCard = screen.getByText('Álgebra').closest('div');
      expect(within(pendingCard).getByTestId('icon-clock')).toBeInTheDocument();

      // Rejected should have x-circle icon
      const rejectedCard = screen.getByText('Geometría').closest('div');
      expect(within(rejectedCard).getByTestId('icon-x-circle')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Accessibility
  // ─────────────────────────────────────────────────────────────────────

  it('should have proper tab roles for status filters', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: mockCourses },
    });

    render(<TutorMaterias />);

    const tabs = screen.getAllByRole('button', { name: /(all|approved|pending|rejected|todo|aprobado|pendiente|rechazado)/i });
    
    expect(tabs.length).toBeGreaterThanOrEqual(4); // At least All, Approved, Pending, Rejected
  });

  it('should display course information accessibly', async () => {
    authFetch.authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, courses: [mockCourses[0]] },
    });

    render(<TutorMaterias />);

    await waitFor(() => {
      expect(screen.getByText('Cálculo I')).toBeInTheDocument();
      expect(screen.getByText('CALC101')).toBeInTheDocument();
      expect(screen.getByText(/5 years/i)).toBeInTheDocument();
    });
  });
});
