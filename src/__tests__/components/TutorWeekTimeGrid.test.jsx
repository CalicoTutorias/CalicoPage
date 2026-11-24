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

  it('rotula las horas igual en cualquier zona horaria (Colombia no corre las etiquetas 5 h)', () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = 'America/Bogota';
    try {
      const { container } = renderGrid({ syncMode: 'available' });
      const labels = [...container.querySelectorAll('.tutor-week-time-grid__hour-label')].map((el) => el.textContent);
      expect(labels[0]).toBe('6:00');
      expect(labels[2]).toBe('8:00');
    } finally {
      process.env.TZ = previousTZ;
    }
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

describe('TutorWeekTimeGrid — crear y redimensionar arrastrando (como Google Calendar)', () => {
  // jsdom no calcula layout: la columna empieza en y=0 y cada hora mide 48 px
  // desde las 06:00 (inicio por defecto de la cuadrícula).
  const yAt = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return ((h * 60 + m - 6 * 60) / 60) * 48;
  };
  const mouse = (hhmm) => ({ pointerType: 'mouse', button: 0, pointerId: 1, clientY: yAt(hhmm) });

  // jsdom no trae PointerEvent: sin esto los eventos llegan sin button/clientY.
  beforeAll(() => {
    if (!window.PointerEvent) {
      window.PointerEvent = class PointerEvent extends MouseEvent {
        constructor(type, init = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
          this.pointerType = init.pointerType ?? 'mouse';
        }
      };
    }
  });

  beforeEach(() => {
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
  });
  afterEach(() => HTMLElement.prototype.getBoundingClientRect.mockRestore());

  const column = (container, dow) => container.querySelectorAll('.tutor-week-time-grid__col')[dow];

  it('presionar y arrastrar en un hueco marca la franja (pasos de 10 min) y la entrega al soltar', () => {
    const onCreateRange = jest.fn();
    const { container } = renderGrid({ syncMode: 'available', onCreateRange });
    const tuesday = column(container, 2);

    fireEvent.pointerDown(tuesday, mouse('08:07'));
    fireEvent.pointerMove(tuesday, mouse('10:34'));
    expect(screen.getByText('08:00–10:30')).toBeInTheDocument(); // borrador visible
    fireEvent.pointerUp(tuesday, mouse('10:34'));
    fireEvent.click(tuesday, mouse('10:34')); // el clic que sigue al arrastre no crea otra

    expect(onCreateRange).toHaveBeenCalledTimes(1);
    expect(onCreateRange).toHaveBeenCalledWith({ dayOfWeek: 2, startTime: '08:00', endTime: '10:30' });
    expect(screen.queryByText('08:00–10:30')).not.toBeInTheDocument();
  });

  it('un clic sin arrastrar marca 1 h, el mínimo que acepta la API', () => {
    const onCreateRange = jest.fn();
    const { container } = renderGrid({ syncMode: 'available', onCreateRange });
    const tuesday = column(container, 2);

    fireEvent.pointerDown(tuesday, mouse('14:00'));
    fireEvent.pointerUp(tuesday, mouse('14:00'));

    expect(onCreateRange).toHaveBeenCalledWith({ dayOfWeek: 2, startTime: '14:00', endTime: '15:00' });
  });

  it('con el dedo un toque marca 1 h (arrastrar sigue desplazando la página)', () => {
    const onCreateRange = jest.fn();
    const { container } = renderGrid({ syncMode: 'available', onCreateRange });
    const tuesday = column(container, 2);

    fireEvent.pointerDown(tuesday, { ...mouse('09:20'), pointerType: 'touch' });
    expect(container.querySelector('.tutor-week-time-grid__draft')).toBeNull();
    fireEvent.click(tuesday, { clientY: yAt('09:20') });

    expect(onCreateRange).toHaveBeenCalledWith({ dayOfWeek: 2, startTime: '09:20', endTime: '10:20' });
  });

  it('presionar sobre un bloque existente no crea una franja nueva', () => {
    const onCreateRange = jest.fn();
    renderGrid({ syncMode: 'available', onCreateRange });
    const block = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block');

    fireEvent.pointerDown(block, mouse('09:00'));
    fireEvent.pointerUp(block, mouse('09:00'));
    fireEvent.click(block, mouse('09:00'));

    expect(onCreateRange).not.toHaveBeenCalled();
  });

  it('arrastrar el borde inferior de un bloque cambia su duración y recarga', async () => {
    AvailabilityService.updateAvailability.mockResolvedValue({ success: true });
    const onReload = jest.fn();
    const { container } = renderGrid({ syncMode: 'available', onReload, blocks: [manualRecurring] });
    const block = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block');
    const handle = block.querySelector('.tutor-week-time-grid__block-resize');
    const monday = column(container, 1);

    fireEvent.pointerDown(handle, mouse('12:00'));
    fireEvent.pointerMove(monday, mouse('13:05'));
    expect(screen.getByText('08:00–13:00')).toBeInTheDocument(); // vista previa
    fireEvent.pointerUp(monday, mouse('13:05'));

    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(AvailabilityService.updateAvailability).toHaveBeenCalledWith('manual-1', {
      startTime: '08:00',
      endTime: '13:00',
      label: null,
      recurring: true,
      dayOfWeek: 1,
      specificDate: null,
    });
  });

  it('si el nuevo largo choca con otro bloque, avisa y no recarga', async () => {
    AvailabilityService.updateAvailability.mockResolvedValue({ success: false, code: 'OVERLAP' });
    const onReload = jest.fn();
    const { container } = renderGrid({ syncMode: 'available', onReload, blocks: [manualRecurring] });
    const handle = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block').querySelector('.tutor-week-time-grid__block-resize');
    const monday = column(container, 1);

    fireEvent.pointerDown(handle, mouse('12:00'));
    fireEvent.pointerMove(monday, mouse('15:00'));
    fireEvent.pointerUp(monday, mouse('15:00'));

    expect(await screen.findByRole('alert')).toHaveTextContent('tutorAvailability.editOverlapError');
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument(); // vuelve a su largo real
  });
});
