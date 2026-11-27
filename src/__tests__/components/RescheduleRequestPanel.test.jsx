/**
 * RescheduleRequestPanel — the "Cambio de horario" card of the session detail:
 * what each person sees (answer, wait, or propose) and what it sends.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RescheduleRequestPanel from '@/app/components/RescheduleRequest/RescheduleRequestPanel';
import { SessionRescheduleService } from '@/app/services/core/SessionRescheduleService';

jest.mock('@/app/services/core/SessionRescheduleService', () => ({
  SessionRescheduleService: {
    getForSession: jest.fn(),
    propose: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    withdraw: jest.fn(),
  },
}));
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    locale: 'es',
    formatDateTime: (d) => new Date(d).toISOString(),
  }),
}));

const DAY = 24 * 60 * 60_000;
// Two days ahead at 15:00 UTC = 10:00 in Bogotá, lasting 1 h 30.
const start = new Date(Math.floor(Date.now() / DAY) * DAY + 2 * DAY + 15 * 60 * 60_000);
const session = {
  id: 'session-1',
  tutorId: 'tutor-1',
  status: 'Accepted',
  startTimestamp: start.toISOString(),
  endTimestamp: new Date(start.getTime() + 90 * 60_000).toISOString(),
};

function openRequest(overrides = {}) {
  const toStart = new Date(start.getTime() + DAY);
  return {
    id: 'req-1',
    fromStart: session.startTimestamp,
    fromEnd: session.endTimestamp,
    toStart: toStart.toISOString(),
    toEnd: new Date(toStart.getTime() + 90 * 60_000).toISOString(),
    requestedBy: 'student',
    requestedByName: 'Sara',
    message: 'Se me cruzó un parcial',
    mine: false,
    canRespond: true,
    canWithdraw: false,
    ...overrides,
  };
}

function state(data) {
  SessionRescheduleService.getForSession.mockResolvedValue({ success: true, role: 'tutor', request: null, canPropose: false, ...data });
}

beforeEach(() => jest.clearAllMocks());

describe('RescheduleRequestPanel', () => {
  it('renders nothing when there is no proposal and none can be made', async () => {
    state({});
    const { container } = render(<RescheduleRequestPanel session={session} isTutor />);
    await waitFor(() => expect(SessionRescheduleService.getForSession).toHaveBeenCalledWith('session-1'));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the proposal cannot be read', async () => {
    SessionRescheduleService.getForSession.mockResolvedValue({ success: false, code: 'INTERNAL_ERROR' });
    const { container } = render(<RescheduleRequestPanel session={session} />);
    await waitFor(() => expect(SessionRescheduleService.getForSession).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('whoever must answer sees the note and accepts: the parent re-reads the session', async () => {
    state({ request: openRequest() });
    SessionRescheduleService.accept.mockResolvedValue({
      success: true, calendar: 'updated', session: { id: 'session-1', startTimestamp: openRequest().toStart },
    });
    const onChanged = jest.fn();
    render(<RescheduleRequestPanel session={session} isTutor onChanged={onChanged} />);

    expect(await screen.findByText(/reschedule\.incoming .*Sara/)).toBeInTheDocument();
    expect(screen.getByText('Se me cruzó un parcial')).toBeInTheDocument();
    expect(screen.queryByText('reschedule.withdraw')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'reschedule.accept' }));

    await waitFor(() => expect(SessionRescheduleService.accept).toHaveBeenCalledWith('session-1', 'req-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('reschedule.accepted');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('warns when the session moved but its calendar event did not', async () => {
    state({ request: openRequest() });
    SessionRescheduleService.accept.mockResolvedValue({
      success: true, calendar: 'failed', session: { id: 'session-1', startTimestamp: openRequest().toStart },
    });
    render(<RescheduleRequestPanel session={session} isTutor />);

    fireEvent.click(await screen.findByRole('button', { name: 'reschedule.accept' }));
    expect(await screen.findByRole('status')).toHaveTextContent('reschedule.acceptedCalendarFailed');
  });

  it('declining says so and shows the refusal code when the server refuses', async () => {
    state({ request: openRequest() });
    SessionRescheduleService.decline.mockResolvedValue({ success: false, code: 'REQUEST_NOT_PENDING' });
    const onChanged = jest.fn();
    render(<RescheduleRequestPanel session={session} isTutor onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'reschedule.decline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('reschedule.errors.REQUEST_NOT_PENDING');
    expect(onChanged).not.toHaveBeenCalled();
    // The card reads the proposal again: it probably changed.
    await waitFor(() => expect(SessionRescheduleService.getForSession).toHaveBeenCalledTimes(2));
  });

  it('whoever proposed waits and can only take it back', async () => {
    state({ role: 'organizer', request: openRequest({ mine: true, canRespond: false, canWithdraw: true }) });
    SessionRescheduleService.withdraw.mockResolvedValue({ success: true });
    render(<RescheduleRequestPanel session={session} />);

    expect(await screen.findByText(/reschedule\.mine/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'reschedule.accept' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'reschedule.withdraw' }));
    await waitFor(() => expect(SessionRescheduleService.withdraw).toHaveBeenCalledWith('session-1', 'req-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('reschedule.withdrawn');
  });

  it('a guest only reads that a change is proposed', async () => {
    state({ role: 'guest', request: openRequest({ message: null, canRespond: false }) });
    render(<RescheduleRequestPanel session={session} />);

    expect(await screen.findByText('reschedule.guestNotice')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('proposes the typed Bogotá date and time as a UTC instant, with the note', async () => {
    state({ role: 'organizer', canPropose: true });
    SessionRescheduleService.propose.mockResolvedValue({ success: true, emailSent: true, request: openRequest({ mine: true }) });
    const onChanged = jest.fn();
    render(<RescheduleRequestPanel session={session} onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'reschedule.open' }));

    // The form starts on the session's own time, in Bogotá: 10:00.
    const date = screen.getByLabelText('reschedule.dateLabel');
    const time = screen.getByLabelText('reschedule.timeLabel');
    expect(time).toHaveValue('10:00');
    const submit = screen.getByRole('button', { name: 'reschedule.send' });
    expect(submit).toBeDisabled(); // same time as now

    const newDay = new Date(start.getTime() + 3 * DAY).toISOString().slice(0, 10);
    fireEvent.change(date, { target: { value: newDay } });
    fireEvent.change(time, { target: { value: '16:30' } });
    fireEvent.change(screen.getByLabelText('reschedule.noteLabel'), { target: { value: '  Tengo parcial ' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(SessionRescheduleService.propose).toHaveBeenCalledTimes(1));
    const [sessionId, sentStart, note] = SessionRescheduleService.propose.mock.calls[0];
    expect(sessionId).toBe('session-1');
    // 16:30 in Bogotá (UTC−5) is 21:30 UTC.
    expect(sentStart.toISOString()).toBe(`${newDay}T21:30:00.000Z`);
    expect(note).toBe('Tengo parcial');
    expect(await screen.findByRole('status')).toHaveTextContent('reschedule.sent');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('does not let a past time be sent', async () => {
    state({ role: 'tutor', canPropose: true });
    render(<RescheduleRequestPanel session={session} isTutor />);

    fireEvent.click(await screen.findByRole('button', { name: 'reschedule.open' }));
    fireEvent.change(screen.getByLabelText('reschedule.dateLabel'), { target: { value: '2020-01-01' } });

    expect(screen.getByRole('button', { name: 'reschedule.send' })).toBeDisabled();
    expect(screen.getByText(/reschedule\.errors\.START_IN_PAST/)).toBeInTheDocument();
  });
});
