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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TutorWeekTimeGrid, { layoutLanes } from '@/app/components/TutorWeekTimeGrid/TutorWeekTimeGrid';
import { AvailabilityService } from '@/app/services/core/AvailabilityService';

jest.mock('@/app/services/core/AvailabilityService', () => ({
  AvailabilityService: { deleteAvailability: jest.fn(), updateAvailability: jest.fn(), createAvailability: jest.fn() },
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

describe('TutorWeekTimeGrid — crear bloques como en Google Calendar', () => {
  // jsdom no calcula layout. Cada columna mide 100 px de ancho (día n en
  // x = n·100) y la hora h está en y = (h − 6)·48 desde el inicio por defecto.
  const yAt = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return ((h * 60 + m - 6 * 60) / 60) * 48;
  };
  const at = (hhmm, dow = 2, extra = {}) => ({
    pointerType: 'mouse', button: 0, pointerId: 1, clientY: yAt(hhmm), clientX: dow * 100 + 50, ...extra,
  });

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
    AvailabilityService.createAvailability.mockReset().mockResolvedValue({ success: true });
    AvailabilityService.updateAvailability.mockReset();
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      const dow = this.dataset?.dow;
      const left = dow != null ? Number(dow) * 100 : 0;
      return { top: 0, left, right: dow != null ? left + 100 : 0, bottom: 0, width: dow != null ? 100 : 0, height: 0 };
    });
  });
  afterEach(() => HTMLElement.prototype.getBoundingClientRect.mockRestore());

  const column = (container, dow) => container.querySelectorAll('.tutor-week-time-grid__col')[dow];
  const editor = () => screen.queryByRole('dialog', { name: 'tutorAvailability.quickEditorTitle' });
  const timeOf = (id) => `${document.getElementById(id).value}:${document.getElementById(`${id}-minute`).value}`;
  const dayChip = (dow) => within(editor()).getByRole('button', {
    name: new Date(2024, 0, 7 + dow).toLocaleDateString('es-ES', { weekday: 'short' }),
  });

  function renderCreatable(props = {}) {
    const onCreateRange = jest.fn();
    const onReload = jest.fn();
    const utils = renderGrid({ syncMode: 'available', onCreateRange, onReload, ...props });
    return { ...utils, onCreateRange, onReload };
  }

  function createDraft(container, from, to, dow = 2) {
    const col = column(container, dow);
    fireEvent.pointerDown(col, at(from, dow));
    if (to) fireEvent.pointerMove(col, at(to, dow));
    fireEvent.pointerUp(col, at(to || from, dow));
    fireEvent.click(col, at(to || from, dow)); // el clic que sigue al arrastre no crea otro
    return col;
  }

  it('presionar y arrastrar deja un borrador en la cuadrícula y abre la tarjeta al lado', () => {
    const { container, onCreateRange } = renderCreatable();
    const col = column(container, 2);

    fireEvent.pointerDown(col, at('08:07'));
    fireEvent.pointerMove(col, at('10:34'));
    expect(screen.getByText('08:00–10:30')).toBeInTheDocument();
    expect(editor()).toBeNull(); // la tarjeta aparece al soltar
    fireEvent.pointerUp(col, at('10:34'));

    expect(editor()).toBeInTheDocument();
    expect(timeOf('quick-start')).toBe('08:00');
    expect(timeOf('quick-end')).toBe('10:30');
    expect(screen.getByText('08:00–10:30')).toBeInTheDocument(); // el borrador sigue en la cuadrícula
    expect(onCreateRange).not.toHaveBeenCalled();
  });

  it('un clic sin arrastrar deja un borrador de 1 h', () => {
    const { container } = renderCreatable();
    createDraft(container, '14:00');
    expect(screen.getByText('14:00–15:00')).toBeInTheDocument();
    expect(timeOf('quick-end')).toBe('15:00');
  });

  it('con el dedo un toque deja el borrador (arrastrar sigue desplazando la página)', () => {
    const { container } = renderCreatable();
    const col = column(container, 2);
    fireEvent.pointerDown(col, at('09:20', 2, { pointerType: 'touch' }));
    expect(container.querySelector('.tutor-week-time-grid__draft')).toBeNull();
    fireEvent.click(col, { clientY: yAt('09:20') });
    expect(screen.getByText('09:20–10:20')).toBeInTheDocument();
    expect(editor()).toBeInTheDocument();
  });

  it('presionar sobre un bloque guardado no crea borrador', () => {
    renderCreatable();
    const block = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block');
    fireEvent.pointerDown(block, at('09:00', 1));
    fireEvent.pointerUp(block, at('09:00', 1));
    fireEvent.click(block, at('09:00', 1));
    expect(document.querySelector('.tutor-week-time-grid__draft')).toBeNull();
  });

  it('arrastrar el borde inferior del borrador cambia su duración y la tarjeta lo refleja', () => {
    const { container } = renderCreatable();
    const col = createDraft(container, '14:00');

    fireEvent.pointerDown(container.querySelector('.tutor-week-time-grid__draft-resize'), at('15:00'));
    fireEvent.pointerMove(col, at('16:44'));
    fireEvent.pointerUp(col, at('16:44'));

    expect(screen.getByText('14:00–16:40')).toBeInTheDocument();
    expect(timeOf('quick-end')).toBe('16:40');
  });

  it('arrastrar el borrador lo mueve de hora y de día', () => {
    const { container } = renderCreatable();
    const col = createDraft(container, '14:00');

    fireEvent.pointerDown(container.querySelector('.tutor-week-time-grid__draft--editing'), at('14:30'));
    fireEvent.pointerMove(col, at('16:30', 4)); // jueves
    fireEvent.pointerUp(col, at('16:30', 4));

    const moved = column(container, 4).querySelector('.tutor-week-time-grid__draft--editing');
    expect(moved).toHaveTextContent('16:00–17:00');
    expect(column(container, 2).querySelector('.tutor-week-time-grid__draft')).toBeNull();
    expect(dayChip(4)).toHaveAttribute('aria-pressed', 'true');
    expect(dayChip(2)).toHaveAttribute('aria-pressed', 'false');
  });

  it('cambiar la hora en la tarjeta (24 h) mueve el borrador', () => {
    const { container } = renderCreatable();
    createDraft(container, '14:00');
    fireEvent.change(document.getElementById('quick-end'), { target: { value: '17' } });
    expect(screen.getByText('14:00–17:00')).toBeInTheDocument();
  });

  it('guarda un bloque por cada día marcado y los demás días se ven como fantasma', async () => {
    const { container, onReload } = renderCreatable();
    createDraft(container, '14:00', '15:50');
    fireEvent.click(dayChip(4));
    fireEvent.change(screen.getByLabelText('tutorAvailability.blockLabelLabel'), { target: { value: 'Cálculo' } });
    expect(column(container, 4).querySelector('.tutor-week-time-grid__draft--ghost')).toHaveTextContent('14:00–15:50');

    fireEvent.click(within(editor()).getByText('tutorAvailability.save'));

    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(AvailabilityService.createAvailability.mock.calls.map(([b]) => b)).toEqual([
      { recurring: true, startTime: '14:00', endTime: '15:50', label: 'Cálculo', dayOfWeek: 2 },
      { recurring: true, startTime: '14:00', endTime: '15:50', label: 'Cálculo', dayOfWeek: 4 },
    ]);
    expect(editor()).toBeNull();
    expect(container.querySelector('.tutor-week-time-grid__draft')).toBeNull();
  });

  it('si un día falla, avisa y saca de la lista los días ya guardados', async () => {
    AvailabilityService.createAvailability
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, code: 'OVERLAP' });
    const { container, onReload } = renderCreatable();
    createDraft(container, '14:00');
    fireEvent.click(dayChip(4));
    fireEvent.click(dayChip(5));

    fireEvent.click(within(editor()).getByText('tutorAvailability.save'));

    expect(await within(editor()).findByRole('alert')).toHaveTextContent('tutorAvailability.editOverlapError');
    expect(onReload).toHaveBeenCalled(); // el martes sí se guardó
    expect(dayChip(4)).toHaveAttribute('aria-pressed', 'true'); // el que falló sigue marcado
  });

  it('«una sola vez» en una semana pasada no se guarda', () => {
    const { container } = renderCreatable(); // la semana del test es septiembre de 2026
    createDraft(container, '14:00');
    fireEvent.click(within(editor()).getByText('tutorAvailability.onceOption'));
    fireEvent.click(within(editor()).getByText('tutorAvailability.save'));
    expect(within(editor()).getByRole('alert')).toHaveTextContent('tutorAvailability.validationNoPast');
    expect(AvailabilityService.createAvailability).not.toHaveBeenCalled();
  });

  it('«Más opciones» pasa el borrador al modal completo', () => {
    const { container, onCreateRange } = renderCreatable();
    createDraft(container, '14:00');
    fireEvent.click(dayChip(4));
    fireEvent.click(within(editor()).getByText('tutorAvailability.moreOptions'));
    expect(onCreateRange).toHaveBeenCalledWith({
      recurring: true, startTime: '14:00', endTime: '15:00', label: '', daysOfWeek: [2, 4],
    });
    expect(editor()).toBeNull();
  });

  it('Esc, la X o un clic afuera descartan el borrador', () => {
    const { container } = renderCreatable();
    createDraft(container, '14:00');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(editor()).toBeNull();

    createDraft(container, '14:00');
    fireEvent.click(screen.getByLabelText('tutorAvailability.closeQuickEditor'));
    expect(editor()).toBeNull();

    createDraft(container, '14:00');
    fireEvent.pointerDown(document.body);
    expect(editor()).toBeNull();
    expect(container.querySelector('.tutor-week-time-grid__draft')).toBeNull();
  });

  it('arrastrar el borde inferior de un bloque guardado cambia su duración y recarga', async () => {
    AvailabilityService.updateAvailability.mockResolvedValue({ success: true });
    const { container, onReload } = renderCreatable({ blocks: [manualRecurring] });
    const handle = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block').querySelector('.tutor-week-time-grid__block-resize');
    const monday = column(container, 1);

    fireEvent.pointerDown(handle, at('12:00', 1));
    fireEvent.pointerMove(monday, at('13:05', 1));
    expect(screen.getByText('08:00–13:00')).toBeInTheDocument();
    fireEvent.pointerUp(monday, at('13:05', 1));

    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(AvailabilityService.updateAvailability).toHaveBeenCalledWith('manual-1', {
      startTime: '08:00', endTime: '13:00', label: null, recurring: true, dayOfWeek: 1, specificDate: null,
    });
  });

  it('si el nuevo largo de un bloque guardado choca con otro, avisa y no recarga', async () => {
    AvailabilityService.updateAvailability.mockResolvedValue({ success: false, code: 'OVERLAP' });
    const { container, onReload } = renderCreatable({ blocks: [manualRecurring] });
    const handle = screen.getByText('08:00–12:00').closest('.tutor-week-time-grid__block').querySelector('.tutor-week-time-grid__block-resize');
    const monday = column(container, 1);

    fireEvent.pointerDown(handle, at('12:00', 1));
    fireEvent.pointerMove(monday, at('15:00', 1));
    fireEvent.pointerUp(monday, at('15:00', 1));

    expect(await screen.findByRole('alert')).toHaveTextContent('tutorAvailability.editOverlapError');
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
  });
});
