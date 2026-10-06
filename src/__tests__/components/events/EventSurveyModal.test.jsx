/**
 * EventSurveyModal — attended? → event stars → stars (+ optional comment) per
 * tutor. Strings come from en.json via the global setupTests i18n mock.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import EventSurveyModal from '@/app/components/Events/EventSurveyModal';
import { EventService } from '@/app/services/core/EventService';
import { useAuth } from '@/app/context/SecureAuthContext';

jest.mock('@/app/services/core/EventService', () => {
  const EventService = { submitSurvey: jest.fn() };
  return { __esModule: true, EventService, default: EventService };
});

const event = {
  slug: 'repaso-x',
  title: 'Repaso X',
  tutors: [
    { id: 't1', name: 'Ana', profilePictureUrl: null },
    { id: 't2', name: 'Luis', profilePictureUrl: null },
  ],
};

function setup(props = {}) {
  const onClose = jest.fn();
  const onSubmitted = jest.fn();
  render(<EventSurveyModal event={event} onClose={onClose} onSubmitted={onSubmitted} {...props} />);
  return { onClose, onSubmitted };
}

const rate = (groupName, stars) =>
  fireEvent.click(
    within(screen.getByRole('group', { name: groupName })).getByRole('button', {
      name: stars === 1 ? '1 star' : `${stars} stars`,
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  EventService.submitSurvey.mockResolvedValue({ success: true });
  useAuth.mockReturnValue({ user: { isLoggedIn: true, uid: 'u1' } });
});

describe('EventSurveyModal', () => {
  it('asks whether the person attended, as a dialog', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Did you attend Repaso X?')).toBeInTheDocument();
  });

  it('"No" submits { attended: false } and calls onSubmitted', async () => {
    const { onSubmitted } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(EventService.submitSurvey).toHaveBeenCalledWith('repaso-x', { attended: false });
  });

  it('keeps Submit disabled until the event and every tutor are rated', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const submit = screen.getByRole('button', { name: 'Submit answers' });
    expect(submit).toBeDisabled();

    rate('Event rating', 4);
    expect(submit).toBeDisabled();
    rate('Rating for Ana', 5);
    expect(submit).toBeDisabled();
    rate('Rating for Luis', 3);
    expect(submit).toBeEnabled();
  });

  it('marks the chosen star as pressed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    rate('Event rating', 4);
    const group = within(screen.getByRole('group', { name: 'Event rating' }));
    expect(group.getByRole('button', { name: '4 stars' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.getByRole('button', { name: '5 stars' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('with 2 tutors, sends exactly 2 tutorRatings with the chosen values', async () => {
    const { onSubmitted } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    rate('Event rating', 5);
    rate('Rating for Ana', 4);
    rate('Rating for Luis', 1);
    fireEvent.change(screen.getByLabelText('Comment for Ana (optional)'), {
      target: { value: '  Explicó muy bien  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

    await waitFor(() => expect(EventService.submitSurvey).toHaveBeenCalled());
    const [slug, payload] = EventService.submitSurvey.mock.calls[0];
    expect(slug).toBe('repaso-x');
    expect(payload.attended).toBe(true);
    expect(payload.eventRating).toBe(5);
    expect(payload.tutorRatings).toHaveLength(2);
    expect(payload.tutorRatings).toEqual([
      { tutorId: 't1', rating: 4, comment: 'Explicó muy bien' },
      { tutorId: 't2', rating: 1 },
    ]);

    expect(await screen.findByText('Thanks for your feedback!')).toBeInTheDocument();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('never shows a rating row for the viewer themself (a tutor of the event)', async () => {
    useAuth.mockReturnValue({ user: { isLoggedIn: true, uid: 't1' } });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(screen.queryByRole('group', { name: 'Rating for Ana' })).toBeNull();

    rate('Event rating', 5);
    rate('Rating for Luis', 4);
    const submit = screen.getByRole('button', { name: 'Submit answers' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(EventService.submitSurvey).toHaveBeenCalled());
    expect(EventService.submitSurvey.mock.calls[0][1].tutorRatings).toEqual([{ tutorId: 't2', rating: 4 }]);
  });

  it('shows a character counter for the optional comment', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.change(screen.getByLabelText('Comment for Luis (optional)'), { target: { value: 'Hola' } });
    expect(screen.getByText('4/1000')).toBeInTheDocument();
  });

  it('treats SURVEY_ALREADY_SUBMITTED as success', async () => {
    EventService.submitSurvey.mockResolvedValue({
      success: false, error: 'SURVEY_ALREADY_SUBMITTED', status: 409,
    });
    const { onSubmitted } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it('shows an error and stays open on any other failure', async () => {
    EventService.submitSurvey.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR', status: 500 });
    const { onSubmitted } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('the dismiss button uses dismissLabel and calls onClose', () => {
    const { onClose } = setup({ dismissLabel: 'Remind me tomorrow' });
    fireEvent.click(screen.getByRole('button', { name: 'Remind me tomorrow' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('the dismiss button defaults to "Close"', () => {
    const { onClose } = setup();
    // The header X is labelled "Close" too; the dismiss button is the text one.
    const buttons = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
