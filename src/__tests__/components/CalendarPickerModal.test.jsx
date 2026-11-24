/**
 * CalendarPickerModal — busy mode takes several calendars (university +
 * personal), available mode takes exactly one.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CalendarPickerModal from '@/app/components/CalendarPickerModal/CalendarPickerModal';

// Stable `t`, like the real (memoized) one: loadCalendars depends on it.
const mockT = (key) => key;
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: mockT }) }));
jest.mock('@/app/services/integrations/CalendarService', () => ({
  __esModule: true,
  default: { listCalendars: jest.fn(), selectCalendars: jest.fn(), setSyncMode: jest.fn() },
}));

const CalendarService = jest.requireMock('@/app/services/integrations/CalendarService').default;

const CALENDARS = [
  { id: 'personal', summary: 'Personal', primary: true },
  { id: 'uni', summary: 'Uniandes' },
];

beforeEach(() => {
  jest.clearAllMocks();
  CalendarService.listCalendars.mockResolvedValue(CALENDARS);
  CalendarService.selectCalendars.mockResolvedValue({ success: true });
  CalendarService.setSyncMode.mockResolvedValue({ success: true });
});

function renderPicker(props = {}) {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(<CalendarPickerModal isOpen onClose={onClose} onSaved={onSaved} {...props} />);
  return { onSaved, onClose };
}

const option = (name) => screen.getByRole('option', { name: new RegExp(name) });

it('busy mode: ticks several calendars and saves them all', async () => {
  const { onSaved, onClose } = renderPicker({ currentIds: ['personal'], currentMode: 'busy' });
  await screen.findByText('Uniandes');
  expect(screen.getByText('calendarPicker.whichCalendarsBusy')).toBeInTheDocument();

  fireEvent.click(option('Uniandes'));
  expect(option('Personal')).toHaveAttribute('aria-selected', 'true');
  expect(option('Uniandes')).toHaveAttribute('aria-selected', 'true');

  fireEvent.click(screen.getByText('calendarPicker.save'));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(CalendarService.selectCalendars).toHaveBeenCalledWith(['personal', 'uni']);
  expect(onSaved).toHaveBeenCalledWith({ calendarIds: ['personal', 'uni'], calendarName: 'Personal, Uniandes', mode: 'busy' });
  expect(onClose).toHaveBeenCalled();
});

it('available mode: picking a calendar replaces the selection', async () => {
  renderPicker({ currentIds: ['personal'], currentMode: 'available' });
  await screen.findByText('Uniandes');

  fireEvent.click(option('Uniandes'));
  expect(option('Personal')).toHaveAttribute('aria-selected', 'false');
  expect(option('Uniandes')).toHaveAttribute('aria-selected', 'true');
});

it('switching from busy to available keeps only the first calendar', async () => {
  renderPicker({ currentIds: ['personal', 'uni'], currentMode: 'busy' });
  await screen.findByText('Uniandes');

  fireEvent.click(screen.getByLabelText(/calendarPicker.modeAvailableLabel/));
  expect(option('Personal')).toHaveAttribute('aria-selected', 'true');
  expect(option('Uniandes')).toHaveAttribute('aria-selected', 'false');
});

it('a failed save keeps the modal open with an error', async () => {
  CalendarService.selectCalendars.mockResolvedValue(null);
  const { onSaved, onClose } = renderPicker({ currentIds: ['personal'], currentMode: 'busy' });
  await screen.findByText('Uniandes');

  fireEvent.click(screen.getByText('calendarPicker.save'));

  expect(await screen.findByRole('alert')).toHaveTextContent('calendarPicker.saveError');
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
