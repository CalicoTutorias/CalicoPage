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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TutorWeekTimeGrid, { layoutLanes } from '@/app/components/TutorWeekTimeGrid/TutorWeekTimeGrid';
import { AvailabilityService } from '@/app/services/core/AvailabilityService';

jest.mock('@/app/services/core/AvailabilityService', () => ({
  AvailabilityService: { deleteAvailability: jest.fn(), updateAvailability: jest.fn() },
}));

const LABELS = {
  'tutorAvailability.editBlockTitle': 'Editar horario',
  'tutorAvailability.removingBlock': 'Quitando...',
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
    // El tooltip vive en la etiqueta «Google»: el bloque entero no captura el
    // puntero para no tapar los controles de la base que tiene debajo.
    expect(screen.getByText('Google')).toHaveAttribute('title', 'Calculado desde Google Calendar');

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

describe('TutorWeekTimeGrid — bloques superpuestos en carriles', () => {
  it('reparte en carriles dos bloques editables a la misma hora (ninguno queda tapado)', () => {
    // El caso real: bloque manual recurrente y su copia sincronizada de una
    // sola vez, misma hora, misma columna. Antes el morado tapaba al verde.
    const syncedCopy = { ...syncedOneTime, startTime: '08:00:00', endTime: '12:00:00' };
    renderGrid({ blocks: [manualRecurring, syncedCopy], syncMode: 'available' });

    const [a, b] = screen.getAllByText('08:00–12:00').map((el) => el.closest('.tutor-week-time-grid__block'));
    expect(a.style.getPropertyValue('--lanes')).toBe('2');
    expect(b.style.getPropertyValue('--lanes')).toBe('2');
    expect(a.style.getPropertyValue('--lane')).not.toBe(b.style.getPropertyValue('--lane'));
    expect(a).toHaveClass('tutor-week-time-grid__block--narrow');
    // Ambos conservan sus controles.
    expect(screen.getAllByLabelText('Editar bloque')).toHaveLength(2);
  });

  it('en modo «ocupado» la franja calculada no entra en los carriles: va a todo el ancho sobre la base', () => {
    renderGrid({ syncMode: 'busy' });

    const base = screen.getByText('Base').closest('.tutor-week-time-grid__block');
    const derived = screen.getByText('Google').closest('.tutor-week-time-grid__block');
    expect(base.style.getPropertyValue('--lanes')).toBe('');
    expect(derived.style.getPropertyValue('--lanes')).toBe('');
    expect(base).not.toHaveClass('tutor-week-time-grid__block--narrow');
  });

  it('bloques que no se solapan no comparten carril', () => {
    const later = { ...manualRecurring, id: 'manual-2', startTime: '13:00:00', endTime: '15:00:00' };
    renderGrid({ blocks: [manualRecurring, later], syncMode: 'available' });

    const a = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block');
    expect(a.style.getPropertyValue('--lanes')).toBe('');
  });
});

describe('layoutLanes', () => {
  it('asigna carriles por grupo de solapamiento y reutiliza carriles libres', () => {
    const lanes = layoutLanes([
      { key: 'a', start: 480, end: 720 },
      { key: 'b', start: 480, end: 720 },
      { key: 'c', start: 600, end: 660 },
      { key: 'd', start: 780, end: 840 }, // aparte
    ]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 3 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 3 });
    expect(lanes.get('c')).toEqual({ lane: 2, lanes: 3 });
    expect(lanes.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});

describe('TutorWeekTimeGrid — rango de horas', () => {
  it('amplía la cuadrícula para que un bloque fuera de 06:00–22:00 no se dibuje fuera de ella', () => {
    const early = { ...manualRecurring, id: 'early', startTime: '05:00:00', endTime: '07:00:00' };
    const late = { ...manualRecurring, id: 'late', dayOfWeek: 2, startTime: '21:00:00', endTime: '23:30:00' };
    const { container } = renderGrid({ blocks: [early, late], syncMode: 'available' });

    const labels = container.querySelectorAll('.tutor-week-time-grid__hour-label');
    // 05:00 … 23:00 → 19 horas visibles; la columna mide 19 × 48 px.
    expect(labels).toHaveLength(19);
    const col = container.querySelector('.tutor-week-time-grid__col');
    expect(col.style.height).toBe(`${19 * 48}px`);
    const block = screen.getByText('05:00–07:00').closest('.tutor-week-time-grid__block');
    expect(block.style.top).toBe('0px');
  });

  it('mantiene 06:00–22:00 cuando todos los bloques caben', () => {
    const { container } = renderGrid({ syncMode: 'available' });
    expect(container.querySelectorAll('.tutor-week-time-grid__hour-label')).toHaveLength(16);
  });
});

describe('TutorWeekTimeGrid — borrar desde el modal de edición', () => {
  it('el modal ofrece «Quitar bloque», borra y recarga', async () => {
    const onReload = jest.fn();
    AvailabilityService.deleteAvailability.mockResolvedValue({ success: true });
    renderGrid({ blocks: [manualRecurring], syncMode: 'available', onReload });

    fireEvent.click(screen.getByLabelText('Editar bloque'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Dentro del modal hay un botón de quitar además de la papelera del bloque.
    const dialog = screen.getByRole('dialog');
    const removeBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.includes('Quitar bloque'));
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn);

    await waitFor(() => expect(AvailabilityService.deleteAvailability).toHaveBeenCalledWith('manual-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onReload).toHaveBeenCalled();
  });

  it('si el borrado falla, el modal sigue abierto y muestra el error', async () => {
    AvailabilityService.deleteAvailability.mockResolvedValue({ success: false, error: 'No se pudo' });
    renderGrid({ blocks: [manualRecurring], syncMode: 'available' });

    fireEvent.click(screen.getByLabelText('Editar bloque'));
    const dialog = screen.getByRole('dialog');
    const removeBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.includes('Quitar bloque'));
    fireEvent.click(removeBtn);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
