/**
 * EventForm (admin create/edit) — client-side validation reuses
 * validateEventDraft, and a valid submit converts the Bogotá wall-clock
 * inputs to UTC and keeps the tutors in the order they were picked.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventForm from '@/app/home/admin/eventos/_components/EventForm';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { AdminService } from '@/app/services/core/AdminService';
import { TutorSearchService } from '@/app/services/utils/TutorSearchService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { create: jest.fn(), update: jest.fn(), uploadCover: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

jest.mock('@/app/services/core/AdminService', () => {
  const AdminService = { listApprovedTutors: jest.fn() };
  return { __esModule: true, AdminService, default: AdminService };
});

jest.mock('@/app/services/utils/TutorSearchService', () => ({
  TutorSearchService: { getMaterias: jest.fn() },
}));

const errors = en.admin.events.form.errors;
const TUTORS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Ana Tutor', email: 'ana@calico.test' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Bruno Tutor', email: 'bruno@calico.test' },
];

function setup() {
  const onSaved = jest.fn();
  render(<EventForm onSaved={onSaved} onCancel={jest.fn()} />);
  return { onSaved };
}

/** Fill every required field with valid values; tutors picked Bruno first, then Ana. */
async function fillValid() {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Repaso parcial 2 Cálculo' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Repasamos los temas del parcial.' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-10-18T18:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-10-18T20:00' } });
  fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '20000' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Add Bruno Tutor' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add Ana Tutor' }));
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: en.admin.events.form.actions.create }));

beforeEach(() => {
  jest.clearAllMocks();
  AdminService.listApprovedTutors.mockResolvedValue({ ok: true, success: true, tutors: TUTORS, total: 2 });
  TutorSearchService.getMaterias.mockResolvedValue([]);
  AdminEventService.create.mockResolvedValue({ success: true, event: { id: 'ev-1', slug: 'repaso-ab12' } });
});

describe('EventForm', () => {
  it('Virtual + "Paste a link" with an empty URL shows MEETING_URL_REQUIRED and does not create', async () => {
    setup();
    await fillValid();
    fireEvent.click(screen.getByLabelText('Paste a link'));
    expect(screen.getByLabelText('Meeting link')).toHaveValue('');

    submit();

    expect(await screen.findByText(errors.MEETING_URL_REQUIRED)).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('price 1600 with 10 % off for the first registrant shows EARLY_BIRD_BELOW_MINIMUM', async () => {
    setup();
    await fillValid();
    fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '1600' } });
    fireEvent.click(screen.getByLabelText('Early-bird discount'));
    fireEvent.change(screen.getByLabelText('First registrants'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '10' } });

    submit();

    const prefix = errors.EARLY_BIRD_BELOW_MINIMUM.split('{min}')[0];
    expect(await screen.findByText((text) => text.startsWith(prefix))).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('a valid submit sends UTC instants converted from Colombia time and the tutors in the chosen order', async () => {
    const { onSaved } = setup();
    await fillValid();

    submit();

    await waitFor(() => expect(AdminEventService.create).toHaveBeenCalledTimes(1));
    expect(AdminEventService.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Repaso parcial 2 Cálculo',
      startsAt: '2026-10-18T23:00:00.000Z',
      endsAt: '2026-10-19T01:00:00.000Z',
      tutorIds: [TUTORS[1].id, TUTORS[0].id],
      modality: 'Virtual',
      autoMeet: true,
      price: 20000,
      earlyBirdSlots: null,
      earlyBirdPercent: null,
      isListed: true,
    }));
    const payload = AdminEventService.create.mock.calls[0][0];
    expect(payload).not.toHaveProperty('coverImageKey');
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev-1' }), {}));
  });

  it('an empty price is an error, never a free event', async () => {
    setup();
    await fillValid();
    fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '' } });

    submit();

    expect(await screen.findByText(errors.PRICE_INVALID)).toBeInTheDocument();
    expect(AdminEventService.create).not.toHaveBeenCalled();
  });

  it('shows a server VALIDATION_ERROR rule next to its field', async () => {
    AdminEventService.create.mockResolvedValue({
      success: false, code: 'VALIDATION_ERROR', rule: 'TUTOR_NOT_APPROVED', field: 'tutorIds', status: 400,
    });
    setup();
    await fillValid();

    submit();

    expect(await screen.findByText(errors.TUTOR_NOT_APPROVED)).toBeInTheDocument();
  });
});
