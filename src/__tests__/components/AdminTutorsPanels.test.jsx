/**
 * Tutores → Reclutamiento y Materias → Solicitudes de materia.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RecruitmentPanel from '@/app/home/admin/tutors/_components/RecruitmentPanel';
import CourseRequestsPanel from '@/app/home/admin/courses/_components/CourseRequestsPanel';
import { AdminService } from '@/app/services/core/AdminService';

const en = require('@/lib/i18n/locales/en.json');
const r = en.admin.tutors.recruitment;
const cr = en.admin.courses.courseRequests;

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = {
    getRecruitmentDemand: jest.fn(),
    listPendingCourseRequests: jest.fn(),
    setTutorCourseStatus: jest.fn(),
  };
  return { __esModule: true, AdminService, default: AdminService };
});
// El detalle de suscripciones tiene su propio fetch; aquí no interesa.
jest.mock('@/app/home/admin/tutors/_components/CourseNotifySubscriptions', () => () => null);

const demandRow = (over) => ({
  courseId: 'c', courseCode: 'X', courseName: 'X', waiting: 1, oldestAt: '2026-11-01T00:00:00.000Z',
  approvedTutors: 0, pendingRequests: 0, listedTutors: 0, needsTutor: true, ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('RecruitmentPanel', () => {
  it('labels each course by what is missing: a tutor, availability, or nothing', async () => {
    AdminService.getRecruitmentDemand.mockResolvedValue({
      success: true,
      items: [
        demandRow({ courseId: 'a', courseCode: 'MATE1203', waiting: 5, pendingRequests: 1 }),
        demandRow({ courseId: 'b', courseCode: 'FISI1018', waiting: 2, approvedTutors: 1 }),
        demandRow({ courseId: 'c', courseCode: 'ISIS1221', listedTutors: 1, approvedTutors: 1, needsTutor: false }),
      ],
    });
    render(<RecruitmentPanel />);

    const row = (code) => screen.getByText(code).closest('tr');
    await screen.findByText('MATE1203');
    expect(within(row('MATE1203')).getByText(r.state.needsTutor)).toBeInTheDocument();
    expect(within(row('FISI1018')).getByText(r.state.noAvailability)).toBeInTheDocument();
    expect(within(row('ISIS1221')).getByText(r.state.covered)).toBeInTheDocument();
    expect(screen.getByText('2 courses without a visible tutor · 7 students waiting')).toBeInTheDocument();

    expect(within(row('MATE1203')).getByRole('link', { name: '1 to review' }))
      .toHaveAttribute('href', '/home/admin/courses?tab=courseRequests');
  });

  it('says all caught up when nobody is waiting', async () => {
    AdminService.getRecruitmentDemand.mockResolvedValue({ success: true, items: [] });
    render(<RecruitmentPanel />);
    expect(await screen.findByText(r.empty)).toBeInTheDocument();
  });
});

describe('CourseRequestsPanel', () => {
  const REQ = {
    tutorId: 't1', tutorName: 'Laura', tutorEmail: 'laura@uniandes.edu.co', tutorActive: true,
    courseId: 'c1', courseCode: 'MATE1203', courseName: 'Cálculo Diferencial',
    experience: 'Monitora 2 semestres', workSampleUrl: null, waitingStudents: 4, courseNeedsTutor: true,
  };

  it('approves a request through the audited endpoint and removes it from the list', async () => {
    AdminService.listPendingCourseRequests.mockResolvedValue({ success: true, requests: [REQ] });
    AdminService.setTutorCourseStatus.mockResolvedValue({ success: true });
    render(<CourseRequestsPanel />);

    expect(await screen.findByText('4 students waiting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: cr.approve }));

    await waitFor(() => expect(AdminService.setTutorCourseStatus).toHaveBeenCalledWith('t1', 'c1', 'Approved'));
    expect(await screen.findByText('MATE1203 approved for Laura.')).toBeInTheDocument();
    expect(screen.queryByText('Cálculo Diferencial')).not.toBeInTheDocument();
  });

  it('keeps the request and shows an error when saving fails', async () => {
    AdminService.listPendingCourseRequests.mockResolvedValue({ success: true, requests: [REQ] });
    AdminService.setTutorCourseStatus.mockResolvedValue({ success: false });
    render(<CourseRequestsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: cr.reject }));
    expect(await screen.findByText(cr.errors.decide)).toBeInTheDocument();
    expect(screen.getByText('Cálculo Diferencial')).toBeInTheDocument();
  });
});
