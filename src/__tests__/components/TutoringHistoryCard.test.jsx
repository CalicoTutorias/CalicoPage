/**
 * Component tests — TutoringHistoryCard
 *
 * Layers:
 *   - Interaction (RTL + userEvent): rate button, "Ver Detalles" external link
 *   - DOM snapshot: stable structural pin for past, upcoming, and ratable states
 *
 * NOT covered here:
 *   - Pixel/visual regression — see `e2e/visual-regression/*.spec.ts` (Playwright)
 *
 * The component renders human-readable Spanish labels directly (no i18n hook),
 * so no provider wrapping is needed.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TutoringHistoryCard from '@/app/components/TutoringHistoryCard/TutoringHistoryCard';

// Pin formatDate / formatPrice / status colors so snapshots and date assertions
// don't drift with the test runner's locale / wall-clock.
jest.mock('@/app/services/utils/TutoringHistoryService', () => ({
  TutoringHistoryService: {
    formatDate: () => '15 de abril de 2026, 10:00 a. m.',
    formatPrice: (price) => (price ? `$${Number(price).toLocaleString('es-CO')}` : '—'),
    getPaymentStatusColor: (s) => ({
      paid:    { bg: '#e6f9ed', text: '#0f5132', border: '#bce5d0' },
      pending: { bg: '#fff4e0', text: '#7a4b00', border: '#ffd699' },
    }[s] || { bg: '#eee', text: '#333', border: '#ccc' }),
    translatePaymentStatus: (s) => ({ paid: 'Pagado', pending: 'Pendiente' }[s] || s),
  },
}));

// ─── fixtures ───────────────────────────────────────────────────────

function makeBaseSession(overrides = {}) {
  return {
    id: 'sess_1',
    tutorName: 'Carlos Tutor',
    tutorEmail: 'carlos@test.co',
    course: 'Cálculo I',
    price: 50000,
    scheduledDateTime: new Date('2026-04-15T15:00:00.000Z'),
    endDateTime: new Date('2026-04-15T16:00:00.000Z'),
    paymentStatus: 'pending',
    status: 'Accepted',
    tutorProfilePicture: null,
    calicoCalendarHtmlLink: null,
    pendingReview: null,
    ...overrides,
  };
}

const PAST_END = new Date('2026-04-01T16:00:00.000Z');
const FUTURE_END = new Date('2030-01-01T16:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Rendering / structure ──────────────────────────────────────────

describe('TutoringHistoryCard — rendering', () => {
  it('test_should_render_tutor_name_email_course_and_price', () => {
    render(<TutoringHistoryCard session={makeBaseSession()} />);

    expect(screen.getByText('Carlos Tutor')).toBeInTheDocument();
    expect(screen.getByText('carlos@test.co')).toBeInTheDocument();
    expect(screen.getByText('Cálculo I')).toBeInTheDocument();
    expect(screen.getByText('$50.000')).toBeInTheDocument();
  });

  it('test_should_translate_status_Completed_to_Spanish', () => {
    render(<TutoringHistoryCard session={makeBaseSession({ status: 'Completed' })} />);
    expect(screen.getByText('Completada')).toBeInTheDocument();
  });

  it('test_should_translate_status_Canceled_Pending_and_Rejected', () => {
    // The status text lives in `.status-indicator`. Pending also produces
    // "Pendiente" in the payment pill, so we query inside the indicator only.
    const statusIn = (container) =>
      container.querySelector('.status-indicator').textContent.trim();

    const { rerender, container } = render(
      <TutoringHistoryCard session={makeBaseSession({ status: 'Canceled' })} />,
    );
    expect(statusIn(container)).toBe('Cancelada');

    rerender(<TutoringHistoryCard session={makeBaseSession({ status: 'Pending' })} />);
    expect(statusIn(container)).toBe('Pendiente');

    rerender(<TutoringHistoryCard session={makeBaseSession({ status: 'Rejected' })} />);
    expect(statusIn(container)).toBe('Rechazada');
  });

  it('test_should_render_initials_icon_when_tutor_has_no_profile_picture', () => {
    const { container } = render(<TutoringHistoryCard session={makeBaseSession()} />);
    expect(container.querySelector('.tutor-avatar img')).toBeNull();
    expect(container.querySelector('.tutor-avatar svg')).not.toBeNull();
  });

  it('test_should_render_image_when_tutorProfilePicture_is_provided', () => {
    render(
      <TutoringHistoryCard
        session={makeBaseSession({ tutorProfilePicture: 'https://cdn.test/p.png' })}
      />,
    );
    const img = screen.getByAltText('Carlos Tutor');
    expect(img).toHaveAttribute('src', 'https://cdn.test/p.png');
  });
});

// ─── Interaction — Rate button ──────────────────────────────────────

describe('TutoringHistoryCard — rate interaction', () => {
  it('test_should_show_rate_button_only_when_session_ended_and_pending_review_has_no_score', () => {
    render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: PAST_END,
          pendingReview: { id: 'r1', score: null },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /calificar/i })).toBeInTheDocument();
  });

  it('test_should_hide_rate_button_when_session_is_still_upcoming', () => {
    render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: FUTURE_END,
          pendingReview: { id: 'r1', score: null },
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: /calificar/i })).not.toBeInTheDocument();
  });

  it('test_should_hide_rate_button_when_review_already_has_a_score', () => {
    render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: PAST_END,
          pendingReview: { id: 'r1', score: 5 },
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: /calificar/i })).not.toBeInTheDocument();
  });

  it('test_should_call_onRateClick_with_the_session_when_rate_button_pressed', async () => {
    const user = userEvent.setup();
    const onRateClick = jest.fn();
    const session = makeBaseSession({
      endDateTime: PAST_END,
      pendingReview: { id: 'r1', score: null },
    });

    render(<TutoringHistoryCard session={session} onRateClick={onRateClick} />);
    await user.click(screen.getByRole('button', { name: /calificar/i }));

    expect(onRateClick).toHaveBeenCalledTimes(1);
    expect(onRateClick).toHaveBeenCalledWith(session);
  });

  it('test_should_not_throw_when_rate_button_clicked_without_onRateClick_prop', async () => {
    const user = userEvent.setup();
    render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: PAST_END,
          pendingReview: { id: 'r1', score: null },
        })}
      />,
    );
    await expect(
      user.click(screen.getByRole('button', { name: /calificar/i })),
    ).resolves.not.toThrow();
  });
});

// ─── Interaction — "Ver Detalles" external link ─────────────────────

describe('TutoringHistoryCard — view details interaction', () => {
  it('test_should_open_calendar_link_in_new_tab_when_button_clicked', async () => {
    const user = userEvent.setup();
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <TutoringHistoryCard
        session={makeBaseSession({
          calicoCalendarHtmlLink: 'https://calendar.google.com/event?eid=abc',
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /ver detalles/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://calendar.google.com/event?eid=abc',
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('test_should_hide_view_details_button_when_no_calendar_link_present', () => {
    render(<TutoringHistoryCard session={makeBaseSession()} />);
    expect(screen.queryByRole('button', { name: /ver detalles/i })).not.toBeInTheDocument();
  });
});

// ─── DOM snapshots — structural regression pins ────────────────────

describe('TutoringHistoryCard — DOM snapshots', () => {
  it('test_should_match_snapshot_for_upcoming_session', () => {
    const { asFragment } = render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: FUTURE_END,
          status: 'Accepted',
        })}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('test_should_match_snapshot_for_past_completed_session_with_calendar_link', () => {
    const { asFragment } = render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: PAST_END,
          status: 'Completed',
          paymentStatus: 'paid',
          calicoCalendarHtmlLink: 'https://calendar.google.com/event?eid=abc',
        })}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('test_should_match_snapshot_for_past_session_in_ratable_state', () => {
    const { asFragment } = render(
      <TutoringHistoryCard
        session={makeBaseSession({
          endDateTime: PAST_END,
          status: 'Completed',
          paymentStatus: 'paid',
          pendingReview: { id: 'r1', score: null },
        })}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
