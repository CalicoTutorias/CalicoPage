/**
 * «Agregar horario»: a weekly block can be created for several days at once.
 * A tester in «eventos = ocupado» mode had to add the same base block day by day.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UnifiedAvailability from '@/app/components/UnifiedAvailability/UnifiedAvailability';
import { AvailabilityService } from '@/app/services/core/AvailabilityService';

jest.mock('@/app/services/core/AvailabilityService', () => ({
  AvailabilityService: {
    getAvailabilityWithFallback: jest.fn(),
    createAvailability: jest.fn(),
    intelligentSync: jest.fn(),
    stopAutoSync: jest.fn(),
  },
}));
jest.mock('@/app/services/core/TutoringSessionService', () => ({
  TutoringSessionService: { getTutorSessions: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/app/services/integrations/CalendarService', () => ({
  __esModule: true,
  default: { getSchedule: jest.fn() },
}));
jest.mock('@/app/context/SecureAuthContext', () => ({ useAuth: () => ({ user: { id: 'tutor-1' } }) }));
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key, locale: 'es' }) }));
jest.mock('@/app/components/GoogleCalendarButton/GoogleCalendarButton', () => () => null);
jest.mock('@/app/components/CalendarPickerModal/CalendarPickerModal', () => () => null);
jest.mock('@/app/components/SessionDetailView/SessionDetailView', () => () => null);
// «Más opciones» of the grid draft hands it over (the grid's own tests cover the gesture).
jest.mock('@/app/components/TutorWeekTimeGrid/TutorWeekTimeGrid', () => (props) =>
  require('react').createElement(
    'button',
    {
      type: 'button',
      onClick: () => props.onCreateRange({
        daysOfWeek: [3, 5], recurring: true, startTime: '09:00', endTime: '11:20', label: 'Cálculo',
      }),
    },
    'mock-grid-range',
  ));
jest.mock('@/app/components/PageSectionHeader/PageSectionHeader', () => () => null);
jest.mock('@/app/components/SessionPreferencesCard/SessionPreferencesCard', () => () => null);

const CalendarService = jest.requireMock('@/app/services/integrations/CalendarService').default;

function mockLoad({ mode = 'busy', blocks = [] } = {}) {
  AvailabilityService.getAvailabilityWithFallback.mockResolvedValue({
    blocks,
    availabilitySlots: [],
    connected: true,
  });
  CalendarService.getSchedule.mockResolvedValue({ calendarSyncId: 'cal-1', calendarSyncMode: mode });
}

beforeEach(() => {
  jest.clearAllMocks();
  AvailabilityService.createAvailability.mockResolvedValue({ success: true });
  AvailabilityService.intelligentSync.mockResolvedValue({ success: true, mode: 'busy', total: 3, baseBlocks: 3 });
});

async function openAddModalFromBusyHint() {
  render(<UnifiedAvailability />);
  const hint = await screen.findByText('tutorAvailability.busyModeNoBaseHint');
  fireEvent.click(hint.parentElement.querySelector('button'));
  await screen.findByText('tutorAvailability.addAvailabilitySlot');
}

// 24 h selects: hour, then minute.
function setTime(id, hhmm) {
  const [h, m] = hhmm.split(':');
  fireEvent.change(document.getElementById(id), { target: { value: h } });
  fireEvent.change(document.getElementById(`${id}-minute`), { target: { value: m } });
}

function setTimes(start, end) {
  setTime('slot-start-time', start);
  setTime('slot-end-time', end);
}

const timeOf = (id) => `${document.getElementById(id).value}:${document.getElementById(`${id}-minute`).value}`;

function dayChip(dow) {
  const label = new Date(2024, 0, 7 + dow).toLocaleDateString('es-ES', { weekday: 'long' });
  return screen.getByRole('button', { name: label });
}

it('«Más opciones» of a grid draft opens «Agregar horario» with its days, times and name', async () => {
  mockLoad();
  render(<UnifiedAvailability />);
  fireEvent.click(await screen.findByText('mock-grid-range'));

  await screen.findByText('tutorAvailability.addAvailabilitySlot');
  expect(timeOf('slot-start-time')).toBe('09:00');
  expect(timeOf('slot-end-time')).toBe('11:20');
  expect(document.getElementById('slot-label')).toHaveValue('Cálculo');
  [3, 5].forEach((dow) => expect(dayChip(dow)).toHaveAttribute('aria-pressed', 'true'));
  [0, 1, 2, 4, 6].forEach((dow) => expect(dayChip(dow)).toHaveAttribute('aria-pressed', 'false'));
});

it('the busy-mode «no base hours» hint opens «Agregar horario»', async () => {
  mockLoad();
  await openAddModalFromBusyHint();
  expect(screen.getByRole('group', { name: 'tutorAvailability.daysOfWeekLabel' })).toBeInTheDocument();
});

it('creates one weekly block per selected day and syncs once', async () => {
  mockLoad();
  await openAddModalFromBusyHint();

  const today = new Date().getDay();
  // Today starts selected; pick Monday, Wednesday and Friday only.
  [1, 3, 5].forEach((dow) => { if (dow !== today) fireEvent.click(dayChip(dow)); });
  if (![1, 3, 5].includes(today)) fireEvent.click(dayChip(today));
  expect(dayChip(1)).toHaveAttribute('aria-pressed', 'true');

  setTimes('08:00', '12:00');
  fireEvent.click(screen.getByText('tutorAvailability.save'));

  await waitFor(() => expect(AvailabilityService.createAvailability).toHaveBeenCalledTimes(3));
  const days = AvailabilityService.createAvailability.mock.calls.map(([b]) => b.dayOfWeek).sort();
  expect(days).toEqual([1, 3, 5]);
  AvailabilityService.createAvailability.mock.calls.forEach(([b]) => {
    expect(b).toMatchObject({ recurring: true, startTime: '08:00', endTime: '12:00' });
  });
  await waitFor(() => expect(AvailabilityService.intelligentSync).toHaveBeenCalledTimes(1));
});

it('requires at least one day', async () => {
  mockLoad();
  await openAddModalFromBusyHint();
  fireEvent.click(dayChip(new Date().getDay())); // unselect the default day
  setTimes('08:00', '12:00');
  fireEvent.click(screen.getByText('tutorAvailability.save'));
  expect(await screen.findByText('tutorAvailability.validationDayRequired')).toBeInTheDocument();
  expect(AvailabilityService.createAvailability).not.toHaveBeenCalled();
});

it('on a partial failure, the days already saved leave the selection', async () => {
  mockLoad();
  await openAddModalFromBusyHint();
  const today = new Date().getDay();
  const other = (today + 1) % 7;
  fireEvent.click(dayChip(other));
  AvailabilityService.createAvailability
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: false, error: 'overlap' });

  setTimes('08:00', '12:00');
  fireEvent.click(screen.getByText('tutorAvailability.save'));

  expect(await screen.findByText('overlap')).toBeInTheDocument();
  expect(dayChip(today)).toHaveAttribute('aria-pressed', 'false');
  expect(dayChip(other)).toHaveAttribute('aria-pressed', 'true');
});
