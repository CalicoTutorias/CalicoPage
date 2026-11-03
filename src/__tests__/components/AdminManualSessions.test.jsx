/**
 * Admin manual sessions page: course first, then its tutors, then only that
 * tutor's slots, with the amount derived from the course; afterwards the list
 * is where the payment proof is uploaded and looked at.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminManualSessionsPage from '@/app/home/admin/manual-sessions/page';
import { AdminService } from '@/app/services/core/AdminService';
import { UserService } from '@/app/services/core/UserService';

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  const value = {
    t,
    locale: 'en',
    formatCurrency: (n) => `$${n}`,
    formatDate: (d) => `D(${new Date(d).toISOString().slice(0, 10)})`,
    formatDateTime: (d) => `DT(${new Date(d).toISOString().slice(0, 16)})`,
  };
  return { useI18n: () => value };
});

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = {
    listManualSessions: jest.fn(),
    listManualSessionTutors: jest.fn(),
    getManualSessionAvailability: jest.fn(),
    createManualSession: jest.fn(),
    uploadManualPaymentProof: jest.fn(),
    getManualPaymentProofUrl: jest.fn(),
  };
  return { __esModule: true, AdminService, default: AdminService };
});

jest.mock('@/app/services/core/UserService', () => ({
  __esModule: true,
  UserService: { getAllCourses: jest.fn() },
}));

const COURSE = { id: 'c1', code: 'ISIS1225', name: 'Estructuras de Datos', basePrice: '50000', aliases: [] };
const AVAILABILITY = {
  success: true,
  timeZone: 'America/Bogota',
  days: [
    {
      date: '2026-11-09',
      slots: [
        { startTimestamp: '2026-11-09T15:00:00.000Z', time: '10:00', durations: [60, 90, 120] },
        { startTimestamp: '2026-11-09T17:00:00.000Z', time: '12:00', durations: [60] },
      ],
    },
    { date: '2026-11-16', slots: [{ startTimestamp: '2026-11-16T15:00:00.000Z', time: '10:00', durations: [60] }] },
  ],
};

function row(overrides = {}) {
  return {
    id: 's1',
    status: 'Accepted',
    startTimestamp: '2026-11-09T15:00:00.000Z',
    endTimestamp: '2026-11-09T16:30:00.000Z',
    meetLink: 'https://meet.google.com/abc',
    course: { id: 'c1', code: 'ISIS1225', name: 'Estructuras de Datos' },
    tutor: { id: 't1', name: 'Laura Tutora' },
    student: { name: 'Anónimo', external: true, phoneNumber: '+57 300 123 4567', email: 'alguien@gmail.com' },
    payment: { status: 'pending', amount: 75000, hasProof: false, proofUploadedAt: null },
    ...overrides,
  };
}

const label = (name) => screen.findByLabelText(name);

async function chooseCourse() {
  fireEvent.change(await screen.findByPlaceholderText('Search the course by name or code'), { target: { value: 'estructuras' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Choose Estructuras de Datos' }));
}

async function chooseTutor() {
  const select = await label('Tutor');
  await within(select).findByRole('option', { name: 'Laura Tutora' });
  fireEvent.change(select, { target: { value: 't1' } });
}

async function chooseSlot({ date = '2026-11-09', start = '2026-11-09T15:00:00.000Z', duration } = {}) {
  const dateSelect = await label('Date');
  await within(dateSelect).findByRole('option', { name: `D(${date})` });
  fireEvent.change(dateSelect, { target: { value: date } });
  fireEvent.change(await label('Start time'), { target: { value: start } });
  if (duration) fireEvent.change(await label('Duration'), { target: { value: String(duration) } });
}

function fillContact() {
  fireEvent.change(screen.getByLabelText('Student phone'), { target: { value: '+57 300 123 4567' } });
  fireEvent.change(screen.getByLabelText('Student email'), { target: { value: 'alguien@gmail.com' } });
}

beforeEach(() => {
  jest.clearAllMocks();
  UserService.getAllCourses.mockResolvedValue({ success: true, courses: [COURSE] });
  AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [], total: 0 });
  AdminService.listManualSessionTutors.mockResolvedValue({ success: true, tutors: [{ id: 't1', name: 'Laura Tutora' }] });
  AdminService.getManualSessionAvailability.mockResolvedValue(AVAILABILITY);
  AdminService.createManualSession.mockResolvedValue({
    success: true,
    session: row(),
    emails: { student: true, tutor: true },
    calendarWarning: null,
  });
});

describe('form', () => {
  it('test_should_not_ask_for_a_name_an_amount_or_a_payment_status', async () => {
    render(<AdminManualSessionsPage />);

    await screen.findByPlaceholderText('Search the course by name or code');
    expect(screen.queryByLabelText(/student name/i)).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByLabelText(/payment status/i)).toBeNull();
  });

  it('test_should_require_the_phone_and_the_email', async () => {
    render(<AdminManualSessionsPage />);

    expect(await label('Student phone')).toBeRequired();
    expect(await label('Student email')).toBeRequired();
  });

  it('test_should_keep_tutor_and_date_locked_until_the_previous_answer', async () => {
    render(<AdminManualSessionsPage />);

    expect(await label('Tutor')).toBeDisabled();
    expect(await label('Date')).toBeDisabled();
    expect(AdminService.listManualSessionTutors).not.toHaveBeenCalled();
  });

  it('test_should_load_only_the_tutors_of_the_chosen_course', async () => {
    render(<AdminManualSessionsPage />);

    await chooseCourse();

    await waitFor(() => expect(AdminService.listManualSessionTutors).toHaveBeenCalledWith('c1'));
    expect(await within(await label('Tutor')).findByRole('option', { name: 'Laura Tutora' })).toBeInTheDocument();
  });

  it('test_should_say_so_when_no_tutor_teaches_the_course', async () => {
    AdminService.listManualSessionTutors.mockResolvedValue({ success: true, tutors: [] });
    render(<AdminManualSessionsPage />);

    await chooseCourse();

    expect(await screen.findByText('No tutor teaches this course right now.')).toBeInTheDocument();
  });

  it('test_should_offer_only_the_days_and_times_of_the_chosen_tutor', async () => {
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await waitFor(() => expect(AdminService.getManualSessionAvailability).toHaveBeenCalledWith('t1'));

    const dateSelect = await label('Date');
    await within(dateSelect).findByRole('option', { name: 'D(2026-11-09)' });
    expect(within(dateSelect).getAllByRole('option').map((o) => o.value)).toEqual(['', '2026-11-09', '2026-11-16']);

    fireEvent.change(dateSelect, { target: { value: '2026-11-09' } });
    expect(within(await label('Start time')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select a time', '10:00', '12:00']);
  });

  it('test_should_say_so_when_the_tutor_has_no_availability', async () => {
    AdminService.getManualSessionAvailability.mockResolvedValue({ success: true, timeZone: 'America/Bogota', days: [] });
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();

    expect(await screen.findByText('This tutor has no free slots in the next 60 days.')).toBeInTheDocument();
  });

  it('test_should_offer_only_the_durations_that_fit_the_chosen_time', async () => {
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot({ start: '2026-11-09T17:00:00.000Z' });

    expect(within(await label('Duration')).getAllByRole('option').map((o) => o.value)).toEqual(['60']);
  });

  it('test_should_compute_the_amount_from_the_course_price_and_the_duration', async () => {
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();
    expect(await screen.findByText('$50000')).toBeInTheDocument();

    fireEvent.change(await label('Duration'), { target: { value: '90' } });
    expect(await screen.findByText('$75000')).toBeInTheDocument();
  });

  it('test_should_clear_the_tutor_and_slot_when_the_course_changes', async () => {
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();

    fireEvent.click(screen.getByRole('button', { name: 'Change course' }));

    expect((await label('Tutor')).value).toBe('');
    expect((await label('Date')).value).toBe('');
    expect(await label('Date')).toBeDisabled();
  });

  it('test_should_block_a_course_without_price', async () => {
    UserService.getAllCourses.mockResolvedValue({ success: true, courses: [{ ...COURSE, basePrice: '0' }] });
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();
    fillContact();

    expect(await screen.findByText(/This course has no price/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register session' })).toBeDisabled();
  });

  it('test_should_send_only_what_the_server_needs_and_refresh_the_list', async () => {
    render(<AdminManualSessionsPage />);
    await waitFor(() => expect(AdminService.listManualSessions).toHaveBeenCalledTimes(1));

    await chooseCourse();
    await chooseTutor();
    await chooseSlot({ duration: 90 });
    fillContact();
    fireEvent.change(screen.getByLabelText('Internal notes'), { target: { value: 'Paga por Nequi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register session' }));

    await waitFor(() => expect(AdminService.createManualSession).toHaveBeenCalledWith({
      tutorId: 't1',
      courseId: 'c1',
      student: { phoneNumber: '+57 300 123 4567', email: 'alguien@gmail.com' },
      startTimestamp: '2026-11-09T15:00:00.000Z',
      durationMinutes: 90,
      notes: 'Paga por Nequi',
    }));

    expect(await screen.findByText('We sent the link to alguien@gmail.com and to the tutor.')).toBeInTheDocument();
    await waitFor(() => expect(AdminService.listManualSessions).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Student email').value).toBe('');
  });

  it('test_should_warn_when_the_email_could_not_be_sent', async () => {
    AdminService.createManualSession.mockResolvedValue({
      success: true,
      session: row(),
      emails: { student: false, tutor: true },
      calendarWarning: null,
    });
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();
    fillContact();
    fireEvent.click(screen.getByRole('button', { name: 'Register session' }));

    expect(await screen.findByText(/the email to alguien@gmail.com could not be sent/)).toBeInTheDocument();
    expect(screen.queryByText(/We sent the link/)).toBeNull();
  });

  it('test_should_not_claim_the_link_was_sent_when_there_is_no_meet_link', async () => {
    AdminService.createManualSession.mockResolvedValue({
      success: true,
      session: row({ meetLink: null }),
      emails: { student: true, tutor: true },
      calendarWarning: null,
    });
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();
    fillContact();
    fireEvent.click(screen.getByRole('button', { name: 'Register session' }));

    expect(await screen.findByText('We sent the email to alguien@gmail.com and to the tutor, but without a link.')).toBeInTheDocument();
    expect(screen.getByText(/the Google Meet link could not be created/)).toBeInTheDocument();
    expect(screen.queryByText(/We sent the link/)).toBeNull();
  });

  it('test_should_show_the_email_as_the_server_stores_it', async () => {
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();
    fillContact();
    fireEvent.change(screen.getByLabelText('Student email'), { target: { value: 'Alguien@Gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register session' }));

    expect(await screen.findByText('We sent the link to alguien@gmail.com and to the tutor.')).toBeInTheDocument();
  });

  it('test_should_reload_the_slots_when_the_chosen_one_was_taken', async () => {
    AdminService.createManualSession.mockResolvedValue({ success: false, error: 'SLOT_NOT_AVAILABLE' });
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    await chooseTutor();
    await chooseSlot();
    fillContact();
    fireEvent.click(screen.getByRole('button', { name: 'Register session' }));

    expect(await screen.findByText('That slot is no longer available. Choose another.')).toBeInTheDocument();
    await waitFor(() => expect(AdminService.getManualSessionAvailability).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Student email').value).toBe('alguien@gmail.com');
  });

  it('test_should_offer_a_retry_when_the_tutors_fail_to_load', async () => {
    AdminService.listManualSessionTutors.mockResolvedValueOnce({ success: false, status: 500 });
    render(<AdminManualSessionsPage />);

    await chooseCourse();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await within(await label('Tutor')).findByRole('option', { name: 'Laura Tutora' })).toBeInTheDocument();
  });
});

describe('list and payment proof', () => {
  const uploadInput = () => document.querySelector('input[type="file"]');
  const image = (name = 'pago.png', type = 'image/png') => new File(['x'], name, { type });

  it('test_should_show_the_contact_of_the_student_and_a_pending_payment', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [row()], total: 1 });
    render(<AdminManualSessionsPage />);

    expect(await screen.findByText('alguien@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('+57 300 123 4567')).toBeInTheDocument();
    expect(screen.getByText('Anónimo')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('test_should_mark_the_row_paid_after_uploading_the_proof', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [row()], total: 1 });
    AdminService.uploadManualPaymentProof.mockResolvedValue({
      success: true,
      session: row({ payment: { status: 'paid', amount: 75000, hasProof: true, proofUploadedAt: '2026-11-09T17:00:00.000Z' } }),
    });
    render(<AdminManualSessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Upload proof for Estructuras de Datos' }));
    const file = image();
    fireEvent.change(uploadInput(), { target: { files: [file] } });

    await waitFor(() => expect(AdminService.uploadManualPaymentProof).toHaveBeenCalledWith('s1', file));
    expect(await screen.findByText('Paid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View proof' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload proof for Estructuras de Datos' })).toBeNull();
  });

  it('test_should_refuse_a_file_that_is_not_an_image_without_uploading', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [row()], total: 1 });
    render(<AdminManualSessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Upload proof for Estructuras de Datos' }));
    fireEvent.change(uploadInput(), { target: { files: [image('pago.pdf', 'application/pdf')] } });

    expect(await screen.findByText('The proof must be a PNG, JPG or WebP image.')).toBeInTheDocument();
    expect(AdminService.uploadManualPaymentProof).not.toHaveBeenCalled();
  });

  it('test_should_keep_the_row_pending_when_the_upload_fails', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [row()], total: 1 });
    AdminService.uploadManualPaymentProof.mockResolvedValue({ success: false, error: 'UPLOAD_FAILED' });
    render(<AdminManualSessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Upload proof for Estructuras de Datos' }));
    fireEvent.change(uploadInput(), { target: { files: [image()] } });

    expect(await screen.findByText('The file upload failed. Check your connection and try again.')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('test_should_not_offer_the_upload_on_a_canceled_session', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [row({ status: 'Canceled' })], total: 1 });
    render(<AdminManualSessionsPage />);

    expect(await screen.findByText('Canceled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload proof/ })).toBeNull();
  });

  it('test_should_show_a_completed_session_after_the_proof', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: true, sessions: [row()], total: 1 });
    AdminService.uploadManualPaymentProof.mockResolvedValue({
      success: true,
      session: row({ status: 'Completed', payment: { status: 'paid', amount: 75000, hasProof: true, proofUploadedAt: '2026-11-09T17:00:00.000Z' } }),
    });
    render(<AdminManualSessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Upload proof for Estructuras de Datos' }));
    fireEvent.change(uploadInput(), { target: { files: [image()] } });

    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('test_should_open_the_signed_url_when_viewing_the_proof', async () => {
    AdminService.listManualSessions.mockResolvedValue({
      success: true,
      total: 1,
      sessions: [row({ payment: { status: 'paid', amount: 75000, hasProof: true, proofUploadedAt: '2026-11-09T17:00:00.000Z' } })],
    });
    AdminService.getManualPaymentProofUrl.mockResolvedValue({ success: true, url: 'https://s3.example/get' });
    const tab = { location: { href: '' }, close: jest.fn(), opener: 'parent' };
    const open = jest.spyOn(window, 'open').mockReturnValue(tab);
    render(<AdminManualSessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'View proof' }));

    await waitFor(() => expect(tab.location.href).toBe('https://s3.example/get'));
    expect(tab.opener).toBeNull();
    open.mockRestore();
  });

  it('test_should_close_the_tab_and_explain_when_the_proof_cannot_be_opened', async () => {
    AdminService.listManualSessions.mockResolvedValue({
      success: true,
      total: 1,
      sessions: [row({ payment: { status: 'paid', amount: 75000, hasProof: true, proofUploadedAt: null } })],
    });
    AdminService.getManualPaymentProofUrl.mockResolvedValue({ success: false, error: 'PROOF_NOT_FOUND' });
    const tab = { location: { href: '' }, close: jest.fn(), opener: 'parent' };
    const open = jest.spyOn(window, 'open').mockReturnValue(tab);
    render(<AdminManualSessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'View proof' }));

    expect(await screen.findByText('This session has no proof.')).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
  });

  it('test_should_offer_a_retry_when_the_list_fails_to_load', async () => {
    AdminService.listManualSessions.mockResolvedValueOnce({ success: false, status: 500 });
    render(<AdminManualSessionsPage />);

    expect(await screen.findByText('Could not load the registered sessions.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('There are no manual sessions yet.')).toBeInTheDocument();
  });

  it('test_should_show_the_rate_limit_message_on_a_429', async () => {
    AdminService.listManualSessions.mockResolvedValue({ success: false, status: 429 });
    render(<AdminManualSessionsPage />);

    expect(await screen.findByText('Too many requests in a row. Wait a minute and try again.')).toBeInTheDocument();
  });
});
