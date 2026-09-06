/**
 * Render tests — TutorWeekTimeGrid
 *
 * Cubre cómo se pintan los bloques según su origen y el modo de sincronización:
 *   - modo «disponible»: manual y sincronizado se editan igual; el sincronizado
 *     lleva la etiqueta «Google».
 *   - modo «ocupado»: el manual es la base (etiqueta «Base», editable) y el
 *     sincronizado es la disponibilidad calculada (solo lectura: sin editar ni
 *     borrar), dibujada encima de la base.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TutorWeekTimeGrid from '@/app/components/TutorWeekTimeGrid/TutorWeekTimeGrid';

jest.mock('@/app/services/core/AvailabilityService', () => ({
  AvailabilityService: { deleteAvailability: jest.fn(), updateAvailability: jest.fn() },
}));

const LABELS = {
  'tutorAvailability.baseBlockBadge': 'Base',
  'tutorAvailability.syncedBlockBadge': 'Google',
  'tutorAvailability.onceBlockBadge': 'Única vez',
  'tutorAvailability.editBlockAria': 'Editar bloque',
  'tutorAvailability.removeBlock': 'Quitar bloque',
  'tutorAvailability.derivedBlockTitle': 'Calculado desde Google Calendar',
};
const t = (key) => LABELS[key] ?? key;

// Semana del lunes 7 de septiembre de 2026 (anchor = miércoles 9).
const ANCHOR = new Date(2026, 8, 9, 12, 0, 0);

const manualRecurring = {
  id: 'manual-1',
  dayOfWeek: 1,
  startTime: '08:00:00',
  endTime: '12:00:00',
  recurring: true,
  specificDate: null,
  source: 'manual',
};

const syncedOneTime = {
  id: 'sync-1',
  dayOfWeek: 1,
  startTime: '10:00:00',
  endTime: '12:00:00',
  recurring: false,
  specificDate: '2026-09-07',
  source: 'calendar_sync',
};

function renderGrid(props = {}) {
  return render(
    <TutorWeekTimeGrid
      anchorDate={ANCHOR}
      blocks={[manualRecurring, syncedOneTime]}
      datedSlots={[]}
      locale="es"
      t={t}
      hideHead
      {...props}
    />,
  );
}

describe('TutorWeekTimeGrid — modo «eventos = disponible»', () => {
  it('pinta ambos bloques editables y etiqueta el sincronizado como Google', () => {
    renderGrid({ syncMode: 'available' });

    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('10:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.queryByText('Base')).not.toBeInTheDocument();
    // Los dos se pueden editar y borrar.
    expect(screen.getAllByLabelText('Editar bloque')).toHaveLength(2);
    expect(screen.getAllByLabelText('Quitar bloque')).toHaveLength(2);
  });
});

describe('TutorWeekTimeGrid — modo «eventos = ocupado»', () => {
  it('pinta el manual como base editable y el sincronizado como calculado de solo lectura', () => {
    const { container } = renderGrid({ syncMode: 'busy' });

    const base = screen.getByText('Base').closest('.tutor-week-time-grid__block');
    const derived = screen.getByText('Google').closest('.tutor-week-time-grid__block');

    expect(base).toHaveClass('tutor-week-time-grid__block--base');
    expect(base).toHaveTextContent('08:00–12:00');
    expect(derived).toHaveClass('tutor-week-time-grid__block--derived');
    expect(derived).toHaveClass('tutor-week-time-grid__block--synced');
    expect(derived).toHaveTextContent('10:00–12:00');
    expect(derived).toHaveAttribute('title', 'Calculado desde Google Calendar');

    // Solo la base se edita/borra; la franja calculada no tiene controles.
    expect(screen.getAllByLabelText('Editar bloque')).toHaveLength(1);
    expect(screen.getAllByLabelText('Quitar bloque')).toHaveLength(1);
    expect(derived.querySelector('.tutor-week-time-grid__block-del')).toBeNull();
    expect(derived.querySelector('.tutor-week-time-grid__block-edit-hit')).toBeNull();

    // Los dos viven en la misma columna (lunes), la calculada encima de la base.
    const column = base.closest('.tutor-week-time-grid__col');
    expect(column).toContainElement(derived);
    expect(container.querySelectorAll('.tutor-week-time-grid__block')).toHaveLength(2);
  });
});
