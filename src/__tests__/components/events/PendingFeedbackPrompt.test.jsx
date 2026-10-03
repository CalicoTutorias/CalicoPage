/**
 * PendingFeedbackPrompt — once-per-local-day nudge for event surveys and
 * session reviews. Strings come from en.json via the global i18n mock.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PendingFeedbackPrompt from '@/app/components/Events/PendingFeedbackPrompt';
import { EventService } from '@/app/services/core/EventService';

jest.mock('@/app/services/core/EventService', () => {
  const EventService = { getPendingFeedback: jest.fn(), submitSurvey: jest.fn() };
  return { __esModule: true, EventService, default: EventService };
});

jest.mock('@/app/components/ReviewModal/ReviewModal', () => ({
  __esModule: true,
  default: ({ session, onClose }) => (
    <div>
      <p>review-modal-{session.id}</p>
      <button onClick={onClose}>close-review</button>
    </div>
  ),
}));

jest.mock('@/app/context/SecureAuthContext', () => ({
  useAuth: () => ({ user: { isLoggedIn: true, id: 'u1', name: 'Ana' } }),
}));

const KEY = 'calico_feedback_prompt_dismissed_u1';
const surveyItem = (id = 'e1') => ({
  type: 'event_survey',
  event: { id, slug: `ev-${id}`, title: `Evento ${id}`, endsAt: '2026-10-02T20:00:00Z', tutors: [] },
});
const reviewItem = (id = 's1') => ({
  type: 'session_review',
  session: { id, pendingReview: { id: 'r1', status: 'pending', rating: null } },
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date(2026, 9, 3, 10, 0, 0));
});

afterEach(() => jest.useRealTimers());

describe('PendingFeedbackPrompt', () => {
  it('does not fetch when it was dismissed today', () => {
    localStorage.setItem(KEY, '2026-10-03');
    render(<PendingFeedbackPrompt />);
    expect(EventService.getPendingFeedback).not.toHaveBeenCalled();
  });

  it('fetches again when the dismissal was on a previous day', async () => {
    localStorage.setItem(KEY, '2026-10-02');
    EventService.getPendingFeedback.mockResolvedValue({ success: true, item: null });
    render(<PendingFeedbackPrompt />);
    await waitFor(() => expect(EventService.getPendingFeedback).toHaveBeenCalledTimes(1));
  });

  it('shows the survey for an event item and stores today on "Not now"', async () => {
    EventService.getPendingFeedback.mockResolvedValue({ success: true, item: surveyItem() });
    render(<PendingFeedbackPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(localStorage.getItem(KEY)).toBe('2026-10-03');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument());
  });

  it('renders the review modal for a session item', async () => {
    EventService.getPendingFeedback.mockResolvedValue({ success: true, item: reviewItem() });
    render(<PendingFeedbackPrompt />);
    expect(await screen.findByText('review-modal-s1')).toBeInTheDocument();
  });

  it('treats a review that is still pending after close as dismissed', async () => {
    EventService.getPendingFeedback.mockResolvedValue({ success: true, item: reviewItem() });
    render(<PendingFeedbackPrompt />);
    fireEvent.click(await screen.findByText('close-review'));
    await waitFor(() => expect(localStorage.getItem(KEY)).toBe('2026-10-03'));
    expect(screen.queryByText('review-modal-s1')).not.toBeInTheDocument();
  });

  it('shows the next item after a review is answered, without dismissing the day', async () => {
    EventService.getPendingFeedback
      .mockResolvedValueOnce({ success: true, item: reviewItem('s1') })
      .mockResolvedValueOnce({ success: true, item: reviewItem('s2') });
    render(<PendingFeedbackPrompt />);
    fireEvent.click(await screen.findByText('close-review'));
    expect(await screen.findByText('review-modal-s2')).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('fetches and shows the next item after a survey is submitted', async () => {
    EventService.getPendingFeedback
      .mockResolvedValueOnce({ success: true, item: surveyItem('e1') })
      .mockResolvedValueOnce({ success: true, item: reviewItem('s9') });
    EventService.submitSurvey.mockResolvedValue({ success: true });
    render(<PendingFeedbackPrompt />);
    // "No" attendance submits right away.
    fireEvent.click(await screen.findByRole('button', { name: 'No' }));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(await screen.findByText('review-modal-s9')).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
