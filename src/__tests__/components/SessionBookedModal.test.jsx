/**
 * Component tests — SessionBookedModal
 *
 * Layers:
 *   - Interaction (RTL + userEvent): close button, overlay click, content click,
 *     student vs tutor copy
 *   - DOM snapshot: stable structural pin for the booked-as-student variant
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionBookedModal from '@/app/components/SessionBookedModal/SessionBookedModal';

// i18n: pin only the keys this component reads. Inlined (not from helpers/)
// because jest.mock factories are hoisted above imports.
jest.mock('@/lib/i18n', () => {
  const overrides = {
    'availability.bookedModal.reservedTitle': '¡Tutoría reservada!',
    'availability.bookedModal.approvedTitle': '¡Tutoría aprobada!',
    'availability.bookedModal.thanksStudent': 'Gracias por reservar tu tutoría.',
    'availability.bookedModal.thanksTutor':   'Gracias por aceptar la tutoría.',
    'availability.bookedModal.statusStudent': 'Tu tutoría ha sido reservada.',
    'availability.bookedModal.statusTutor':   'Tu tutoría ha sido aprobada.',
    'availability.bookedModal.seeYou':        'Nos vemos el {date} a las {time}.',
    'availability.bookedModal.scheduled':     'Programada para el {date} a las {time}.',
    'availability.bookedModal.detailsYour':   'Detalles de tu tutoría',
    'availability.bookedModal.detailsApproved': 'Detalles de la tutoría',
    'availability.bookedModal.labels.student': 'Estudiante',
    'availability.bookedModal.labels.tutor':   'Tutor',
    'availability.bookedModal.labels.course':  'Materia',
    'availability.bookedModal.labels.date':    'Fecha',
    'availability.bookedModal.labels.time':    'Hora',
    'availability.bookedModal.labels.location':'Ubicación',
    'availability.bookedModal.meetingLink':    'Enlace de reunión',
    'availability.bookedModal.ok':             'Entendido',
    'common.tutor':   'tutor',
    'common.student': 'estudiante',
  };
  return {
    useI18n: () => ({
      t: (key, params) => {
        let out = overrides[key] ?? key;
        if (params && typeof out === 'string') {
          for (const [k, v] of Object.entries(params)) {
            out = out.replace(new RegExp(`{${k}}`, 'g'), String(v));
          }
        }
        return out;
      },
      locale: 'es',
    }),
  };
});

// Pin the timezone helpers so date/time strings are deterministic.
jest.mock('@/lib/utils/timezone', () => ({
  formatColombiaDate: () => '15 de abril de 2026',
  formatColombiaTme:  () => '10:00 a. m.',
}));

// next/image: render a plain <img> so jsdom can find it via alt text.
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...props} />;
  },
}));

// ─── fixtures ───────────────────────────────────────────────────────

function makeSessionData(overrides = {}) {
  return {
    scheduledDateTime: new Date('2026-04-15T15:00:00.000Z'),
    tutorName: 'Carlos Tutor',
    studentName: 'Laura Estudiante',
    studentEmail: 'laura@test.co',
    course: 'Cálculo I',
    location: 'Google Meet',
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Visibility ─────────────────────────────────────────────────────

describe('SessionBookedModal — visibility', () => {
  it('test_should_not_render_when_isOpen_is_false', () => {
    const { container } = render(
      <SessionBookedModal isOpen={false} onClose={jest.fn()} sessionData={makeSessionData()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('test_should_not_render_when_sessionData_is_null', () => {
    const { container } = render(
      <SessionBookedModal isOpen={true} onClose={jest.fn()} sessionData={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('test_should_render_when_open_with_session_data', () => {
    render(
      <SessionBookedModal isOpen={true} onClose={jest.fn()} sessionData={makeSessionData()} />,
    );
    expect(screen.getByRole('button', { name: /entendido/i })).toBeInTheDocument();
  });
});

// ─── Student vs Tutor copy ──────────────────────────────────────────

describe('SessionBookedModal — userType variants', () => {
  it('test_should_use_student_copy_by_default', () => {
    render(
      <SessionBookedModal isOpen={true} onClose={jest.fn()} sessionData={makeSessionData()} />,
    );
    expect(screen.getByRole('heading', { name: '¡Tutoría reservada!' })).toBeInTheDocument();
    expect(screen.getByText('Tu tutoría ha sido reservada.')).toBeInTheDocument();
    expect(screen.getByText('Tutor')).toBeInTheDocument();
    expect(screen.getByText('Carlos Tutor')).toBeInTheDocument();
  });

  it('test_should_use_tutor_copy_when_userType_is_tutor', () => {
    render(
      <SessionBookedModal
        isOpen={true}
        onClose={jest.fn()}
        sessionData={makeSessionData()}
        userType="tutor"
      />,
    );
    expect(screen.getByRole('heading', { name: '¡Tutoría aprobada!' })).toBeInTheDocument();
    expect(screen.getByText('Tu tutoría ha sido aprobada.')).toBeInTheDocument();
    expect(screen.getByText('Estudiante')).toBeInTheDocument();
    expect(screen.getByText('Laura Estudiante')).toBeInTheDocument();
  });

  it('test_should_fall_back_to_student_email_when_studentName_missing_for_tutor_view', () => {
    render(
      <SessionBookedModal
        isOpen={true}
        onClose={jest.fn()}
        sessionData={makeSessionData({ studentName: null })}
        userType="tutor"
      />,
    );
    expect(screen.getByText('laura@test.co')).toBeInTheDocument();
  });
});

// ─── Optional fields ────────────────────────────────────────────────

describe('SessionBookedModal — optional fields', () => {
  it('test_should_hide_location_row_when_location_is_missing', () => {
    render(
      <SessionBookedModal
        isOpen={true}
        onClose={jest.fn()}
        sessionData={makeSessionData({ location: null })}
      />,
    );
    expect(screen.queryByText('Ubicación')).not.toBeInTheDocument();
  });

  it('test_should_render_meet_link_when_provided', () => {
    render(
      <SessionBookedModal isOpen={true} onClose={jest.fn()} sessionData={makeSessionData()} />,
    );
    const link = screen.getByRole('link', { name: /meet\.google\.com/i });
    expect(link).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('test_should_hide_meet_link_section_when_no_link_present', () => {
    render(
      <SessionBookedModal
        isOpen={true}
        onClose={jest.fn()}
        sessionData={makeSessionData({ googleMeetLink: null })}
      />,
    );
    expect(screen.queryByText('Enlace de reunión')).not.toBeInTheDocument();
  });
});

// ─── Interaction — close ────────────────────────────────────────────

describe('SessionBookedModal — close behaviors', () => {
  it('test_should_call_onClose_when_OK_button_clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <SessionBookedModal isOpen={true} onClose={onClose} sessionData={makeSessionData()} />,
    );

    await user.click(screen.getByRole('button', { name: /entendido/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('test_should_call_onClose_when_overlay_clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { container } = render(
      <SessionBookedModal isOpen={true} onClose={onClose} sessionData={makeSessionData()} />,
    );

    await user.click(container.querySelector('.session-booked-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('test_should_not_call_onClose_when_modal_content_clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { container } = render(
      <SessionBookedModal isOpen={true} onClose={onClose} sessionData={makeSessionData()} />,
    );

    // Click on a label inside the modal — must not bubble up to the overlay handler
    await user.click(container.querySelector('.session-booked-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('test_should_call_onClose_when_cat_illustration_clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { container } = render(
      <SessionBookedModal isOpen={true} onClose={onClose} sessionData={makeSessionData()} />,
    );

    await user.click(container.querySelector('.cat-illustration'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── DOM snapshot ───────────────────────────────────────────────────

describe('SessionBookedModal — DOM snapshots', () => {
  it('test_should_match_snapshot_for_student_view', () => {
    const { asFragment } = render(
      <SessionBookedModal isOpen={true} onClose={jest.fn()} sessionData={makeSessionData()} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('test_should_match_snapshot_for_tutor_view_without_optional_fields', () => {
    const { asFragment } = render(
      <SessionBookedModal
        isOpen={true}
        onClose={jest.fn()}
        sessionData={makeSessionData({ location: null, googleMeetLink: null })}
        userType="tutor"
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
