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

  it('after a successful create the submit stays disabled, so a second submit cannot duplicate the draft', async () => {
    const { onSaved } = setup();
    await fillValid();

    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const saving = screen.getByRole('button', { name: en.admin.events.form.actions.saving });
    expect(saving).toBeDisabled();
    fireEvent.submit(saving.closest('form'));
    expect(AdminEventService.create).toHaveBeenCalledTimes(1);
  });

  it('a pricing error clears once the price changes, not when another field does', async () => {
    setup();
    await fillValid();
    fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '1600' } });
    fireEvent.click(screen.getByLabelText('Early-bird discount'));
    fireEvent.change(screen.getByLabelText('First registrants'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '10' } });
    submit();
    const prefix = errors.EARLY_BIRD_BELOW_MINIMUM.split('{min}')[0];
    const priceError = () => screen.queryByText((text) => text.startsWith(prefix));
    expect(await screen.findByText((text) => text.startsWith(prefix))).toBeInTheDocument();
    expect(screen.getByLabelText('Price (COP)')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Otro título' } });
    expect(priceError()).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '2000' } });
    expect(priceError()).toBeNull();
    expect(screen.getByLabelText('Price (COP)')).toHaveAttribute('aria-invalid', 'false');
  });

  it('the early-bird toggle and its fields also clear the pricing error', async () => {
    setup();
    await fillValid();
    fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '1600' } });
    fireEvent.click(screen.getByLabelText('Early-bird discount'));
    fireEvent.change(screen.getByLabelText('First registrants'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '10' } });
    submit();
    const prefix = errors.EARLY_BIRD_BELOW_MINIMUM.split('{min}')[0];
    expect(await screen.findByText((text) => text.startsWith(prefix))).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '5' } });
    expect(screen.queryByText((text) => text.startsWith(prefix))).toBeNull();
  });

  it('previews a single early-bird slot in the singular', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Price (COP)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByLabelText('Early-bird discount'));
    fireEvent.change(screen.getByLabelText('First registrants'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '10' } });

    expect(screen.getByText(/^First registrant: .*1\.800.* · after that: .*2\.000/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('First registrants'), { target: { value: '3' } });
    expect(screen.getByText(/^First 3: .*1\.800/)).toBeInTheDocument();
  });

  it('modality and meeting radios are named by their visible labels', async () => {
    setup();
    const named = (name) => {
      const radio = screen.getByRole('radio', { name });
      expect(document.querySelector(`label[for="${radio.id}"]`)).toHaveTextContent(name);
      return radio;
    };

    expect(named('Virtual')).toBeChecked();
    expect(named('In person')).not.toBeChecked();
    expect(named('Generate a Google Meet automatically')).toBeChecked();
    fireEvent.click(named('Paste a link'));
    expect(screen.getByLabelText('Meeting link')).toBeInTheDocument();
  });

  it('a 429 from the admin rate limit shows the translated message, never the bare code', async () => {
    AdminEventService.create.mockResolvedValue({ success: false, error: null, status: 429 });
    setup();
    await fillValid();

    submit();

    expect(await screen.findByText(en.admin.events.errors.RATE_LIMITED)).toBeInTheDocument();
    expect(screen.queryByText('RATE_LIMITED')).toBeNull();
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

describe('EventForm — editing a Published event', () => {
  const STORED = {
    id: 'ev-9',
    slug: 'repaso-final-x1y2',
    title: 'Repaso final',
    description: 'Todo el semestre',
    coverImageUrl: 'https://cdn.example/event-images/a.webp',
    courseId: null,
    course: null,
    startsAt: '2026-11-02T22:30:00.000Z',
    endsAt: '2026-11-03T00:30:00.000Z',
    modality: 'Virtual',
    autoMeet: true,
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    location: null,
    price: 20000,
    earlyBirdSlots: 5,
    earlyBirdPercent: 10,
    isListed: true,
    status: 'Published',
    derivedStatus: 'published',
    tutors: [TUTORS[0], TUTORS[1]],
    stats: { confirmed: 0, pending: 0, canceled: 0, responses: 0 },
  };

  const renderEdit = (event) => {
    const onSaved = jest.fn();
    render(<EventForm event={event} onSaved={onSaved} onCancel={jest.fn()} />);
    return { onSaved };
  };
  const save = () => fireEvent.click(screen.getByRole('button', { name: en.admin.events.form.actions.save }));

  beforeEach(() => {
    AdminEventService.update.mockResolvedValue({ success: true, event: STORED });
  });

  it('saving unchanged keeps the cover, leaves out modality/autoMeet and round-trips the dates without a shift', async () => {
    const { onSaved } = renderEdit(STORED);
    expect(screen.getByLabelText('Starts')).toHaveValue('2026-11-02T17:30');

    save();

    await waitFor(() => expect(AdminEventService.update).toHaveBeenCalledTimes(1));
    const [id, payload] = AdminEventService.update.mock.calls[0];
    expect(id).toBe('ev-9');
    expect(payload).not.toHaveProperty('coverImageKey');
    expect(payload).not.toHaveProperty('modality');
    expect(payload).not.toHaveProperty('autoMeet');
    expect(payload.startsAt).toBe(STORED.startsAt);
    expect(payload.endsAt).toBe(STORED.endsAt);
    expect(payload.tutorIds).toEqual([TUTORS[0].id, TUTORS[1].id]);
    expect(payload).toEqual(expect.objectContaining({ price: 20000, earlyBirdSlots: 5, earlyBirdPercent: 10 }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: en.admin.events.form.actions.save })).toBeEnabled();
  });

  it('with registrations the price and early-bird are locked and left out of the PATCH', async () => {
    renderEdit({ ...STORED, stats: { confirmed: 3, pending: 0, canceled: 0, responses: 0 } });
    expect(screen.getByLabelText('Price (COP)')).toBeDisabled();

    save();

    await waitFor(() => expect(AdminEventService.update).toHaveBeenCalledTimes(1));
    const payload = AdminEventService.update.mock.calls[0][1];
    expect(payload).not.toHaveProperty('price');
    expect(payload).not.toHaveProperty('earlyBirdSlots');
    expect(payload).not.toHaveProperty('earlyBirdPercent');
  });

  it('INVALID_STATE from the API shows the translated "reload" message, not the server text', async () => {
    AdminEventService.update.mockResolvedValue({
      success: false, code: 'INVALID_STATE', error: 'Un evento cancelado no se puede editar', status: 409,
    });
    renderEdit(STORED);

    save();

    expect(await screen.findByText(en.admin.events.errors.INVALID_STATE)).toBeInTheDocument();
    expect(screen.queryByText('Un evento cancelado no se puede editar')).toBeNull();
  });
});
