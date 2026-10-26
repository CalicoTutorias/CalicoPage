/**
 * EventSurveyModal — attended? → how did you hear about it (everyone) → event
 * stars, would you recommend it, stars (+ optional comment) per tutor.
 * Strings come from en.json via the global setupTests i18n mock.
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

const heardFrom = (label) =>
  fireEvent.click(within(screen.getByRole('group', { name: 'How you heard about it' })).getByRole('button', { name: label }));
const recommend = (label) =>
  fireEvent.click(within(screen.getByRole('group', { name: 'Would you recommend it to a friend?' })).getByRole('button', { name: label }));
const submitButton = () => screen.getByRole('button', { name: 'Submit answers' });

/** Did not attend + how they heard about it, then submit. */
function answerNo(label = 'Social media (Instagram, TikTok…)') {
  fireEvent.click(screen.getByRole('button', { name: 'No' }));
  heardFrom(label);
  fireEvent.click(submitButton());
}

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

  it('"No" only asks how they heard about it, then submits { attended: false, heardFrom }', async () => {
    const { onSubmitted } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.getByText('How did you hear about Repaso X?')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Event rating' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Would you recommend it to a friend?' })).toBeNull();
    expect(submitButton()).toBeDisabled();

    heardFrom('A friend or classmate recommended it');
    fireEvent.click(submitButton());

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(EventService.submitSurvey).toHaveBeenCalledWith('repaso-x', { attended: false, heardFrom: 'friend' });
  });

  it('nothing but the attendance question until it is answered', () => {
    setup();
    expect(screen.queryByRole('group', { name: 'How you heard about it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit answers' })).toBeNull();
  });

  it('keeps Submit disabled until how they heard, the event, the recommendation and every tutor are answered', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const submit = submitButton();
    expect(submit).toBeDisabled();

    rate('Event rating', 4);
    rate('Rating for Ana', 5);
    rate('Rating for Luis', 3);
    expect(submit).toBeDisabled();
    heardFrom('Calico ads (poster, email or the website)');
    expect(submit).toBeDisabled();
    recommend('Maybe');
    expect(submit).toBeEnabled();
  });

  it('"Other" reveals an optional "where?" field', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.queryByLabelText('Where? (optional)')).toBeNull();
    heardFrom('Other');
    expect(screen.getByLabelText('Where? (optional)')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
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
    heardFrom('Other');
    fireEvent.change(screen.getByLabelText('Where? (optional)'), { target: { value: '  Afiche en el ML  ' } });
    recommend('Yes');
    fireEvent.click(submitButton());

    await waitFor(() => expect(EventService.submitSurvey).toHaveBeenCalled());
    const [slug, payload] = EventService.submitSurvey.mock.calls[0];
    expect(slug).toBe('repaso-x');
    expect(payload.attended).toBe(true);
    expect(payload.eventRating).toBe(5);
    expect(payload).toMatchObject({ heardFrom: 'other', heardFromDetail: 'Afiche en el ML', wouldRecommend: 'yes' });
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
    heardFrom('The course group chat (WhatsApp)');
    recommend('No');
    const submit = submitButton();
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
    answerNo();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it('shows an error and stays open on any other failure', async () => {
    EventService.submitSurvey.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR', status: 500 });
    const { onSubmitted } = setup();
    answerNo();
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
