"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Trash2, Plus, Repeat, CalendarDays } from "lucide-react";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import "./TutorWeekTimeGrid.css";

/* Rango visible por defecto. Si algún bloque empieza antes o termina después,
   el rango se amplía (ver `hourRange`) en vez de dibujar el bloque sobre la
   cabecera o fuera de la columna. */
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;
const PIXELS_PER_HOUR = 48;

function startOfWeekSunday(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a, b) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function sameWeek(a, b) {
  return startOfWeekSunday(a).getTime() === startOfWeekSunday(b).getTime();
}

function timeToMinutesSinceMidnightUTC(value) {
  if (value == null) return 0;
  if (typeof value === "string") {
    const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      return h * 60 + (Number.isNaN(min) ? 0 : min);
    }
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return 0;
  return dt.getUTCHours() * 60 + dt.getUTCMinutes();
}

function minutesToHHMM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function apiTimeToHHMMInput(value) {
  return minutesToHHMM(timeToMinutesSinceMidnightUTC(value));
}

function hhmmInputToMinutes(s) {
  if (!s || typeof s !== "string") return 0;
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function slotStartEndForInput(slot) {
  const st = slot?.startTime;
  const et = slot?.endTime;
  const clean = (x) =>
    typeof x === "string" ? x.slice(0, 5) : apiTimeToHHMMInput(x);
  return { startTime: clean(st), endTime: clean(et) };
}

function blockTimeRangeKey(block) {
  const s = timeToMinutesSinceMidnightUTC(block.startTime);
  const e = timeToMinutesSinceMidnightUTC(block.endTime);
  return `${minutesToHHMM(s)}-${minutesToHHMM(e)}`;
}

function slotTimeRangeKey(slot) {
  return `${slot.startTime || "00:00"}-${slot.endTime || "00:00"}`;
}

function hhmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return 0;
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/**
 * Reparte en carriles los intervalos que se solapan dentro de una columna
 * (como Google Calendar): dos bloques a la misma hora se pintan lado a lado
 * en vez de uno encima del otro, donde el de abajo quedaba inalcanzable.
 *
 * @param {Array<{ key: string, start: number, end: number }>} items minutos
 * @returns {Map<string, { lane: number, lanes: number }>}
 */
export function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map();
  let cluster = [];
  let laneEnds = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const it of cluster) result.set(it.key, { lane: it.lane, lanes });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    cluster.push({ ...it, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}

function formatHourLabel(h, locale) {
  const d = new Date(Date.UTC(2000, 0, 1, h, 0, 0));
  return d.toLocaleTimeString(locale === "en" ? "en-US" : "es-ES", {
    hour: "numeric",
    minute: "2-digit",
    hour12: locale === "en",
  });
}

/** 6 rows × 7 cols, Sunday-first, aligned with column index 0 = Sunday */
function buildMonthWeeks(anchorDate) {
  const y = anchorDate.getFullYear();
  const m = anchorDate.getMonth();
  const first = new Date(y, m, 1);
  const pad = first.getDay();
  const start = new Date(y, m, 1 - pad);
  const cells = [];
  const cur = new Date(start);
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7));
  }
  return { weeks, displayMonth: m, displayYear: y };
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonthsFirstDay(d, delta) {
  const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return x;
}

export default function TutorWeekTimeGrid({
  anchorDate,
  blocks,
  datedSlots = [],
  locale,
  t,
  onReload,
  onAddForDay,
  onSelectDay,
  /** Ocultar título/hint propios cuando el padre (UnifiedAvailability) ya muestra cabecera de columna */
  hideHead = false,
  /**
   * Modo de sincronización con Google Calendar ('available' | 'busy'). En
   * 'busy' los bloques manuales se pintan como base (no se publican solos) y
   * los sincronizados como disponibilidad real de solo lectura.
   */
  syncMode = "available",
}) {
  const weekStart = useMemo(() => startOfWeekSunday(anchorDate), [anchorDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const weekDayISOs = useMemo(() => weekDays.map(toLocalISODate), [weekDays]);

  const { weeks, displayMonth, displayYear } = useMemo(
    () => buildMonthWeeks(anchorDate),
    [anchorDate]
  );

  const monthTitle = useMemo(() => {
    const d = new Date(displayYear, displayMonth, 1);
    return d.toLocaleDateString(locale === "en" ? "en-US" : "es-ES", {
      month: "long",
      year: "numeric",
    });
  }, [displayMonth, displayYear, locale]);

  const weekdayLabels = useMemo(() => {
    const localeStr = locale === "en" ? "en-US" : "es-ES";
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 7 + i);
      return d.toLocaleDateString(localeStr, { weekday: "narrow" });
    });
  }, [locale]);

  const dayOptions = useMemo(() => {
    const localeStr = locale === "en" ? "en-US" : "es-ES";
    return [0, 1, 2, 3, 4, 5, 6].map((dow) => {
      const d = new Date(2024, 0, 7 + dow);
      return {
        value: dow,
        label: d.toLocaleDateString(localeStr, { weekday: "long" }),
      };
    });
  }, [locale]);

  // Rango de horas visible: el por defecto ampliado hasta cubrir todos los
  // bloques, para que ninguno se dibuje fuera de la cuadrícula.
  const hourRange = useMemo(() => {
    let start = DEFAULT_START_HOUR;
    let end = DEFAULT_END_HOUR;
    for (const b of blocks || []) {
      const s = timeToMinutesSinceMidnightUTC(b.startTime);
      const e = timeToMinutesSinceMidnightUTC(b.endTime);
      if (e > s) {
        start = Math.min(start, Math.floor(s / 60));
        end = Math.max(end, Math.ceil(e / 60));
      }
    }
    for (const slot of datedSlots || []) {
      const s = hhmmToMinutes(slot?.startTime);
      const e = hhmmToMinutes(slot?.endTime);
      if (e > s) {
        start = Math.min(start, Math.floor(s / 60));
        end = Math.max(end, Math.ceil(e / 60));
      }
    }
    return { start: Math.max(0, start), end: Math.min(24, end) };
  }, [blocks, datedSlots]);

  const startHour = hourRange.start;
  const numHours = hourRange.end - hourRange.start;
  const bodyHeightPx = numHours * PIXELS_PER_HOUR;

  const hours = useMemo(
    () => Array.from({ length: numHours }, (_, i) => startHour + i),
    [numHours, startHour]
  );

  const rangeLabel = useMemo(() => {
    const a = weekDays[0];
    const b = weekDays[6];
    const localeStr = locale === "en" ? "en-US" : "es-ES";
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return `${a.toLocaleDateString(localeStr, { day: "numeric" })} – ${b.toLocaleDateString(localeStr, { day: "numeric", month: "long", year: "numeric" })}`;
    }
    return `${a.toLocaleDateString(localeStr, { day: "numeric", month: "short", year: "numeric" })} – ${b.toLocaleDateString(localeStr, { day: "numeric", month: "short", year: "numeric" })}`;
  }, [weekDays, locale]);

  const isToday = useCallback((d) => {
    const t0 = new Date();
    return sameDay(d, t0);
  }, []);

  const blocksByColumn = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < 7; i++) map.set(i, []);

    for (const b of (blocks || [])) {
      const isRecurring = b.recurring !== false;
      if (isRecurring) {
        // Recurring: place in the matching day-of-week column
        const list = map.get(b.dayOfWeek);
        if (list) list.push(b);
      } else if (b.specificDate) {
        // One-time: place in the column whose date matches specificDate
        const dateStr = typeof b.specificDate === 'string'
          ? b.specificDate.substring(0, 10)
          : new Date(b.specificDate).toISOString().substring(0, 10);
        const colIdx = weekDayISOs.indexOf(dateStr);
        if (colIdx >= 0) map.get(colIdx).push(b);
      }
    }

    for (let i = 0; i < 7; i++) {
      map.get(i).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }
    return map;
  }, [blocks, weekDayISOs]);

  /** Dated slots for visible week, grouped by column index */
  const datedByColumn = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < 7; i++) map.set(i, []);
    const isoSet = new Set(weekDayISOs);
    (datedSlots || []).forEach((slot) => {
      if (!slot?.date || !isoSet.has(slot.date)) return;
      const idx = weekDayISOs.indexOf(slot.date);
      if (idx < 0) return;
      const recurring = blocksByColumn.get(idx) || [];
      const rk = new Set(recurring.map(blockTimeRangeKey));
      if (rk.has(slotTimeRangeKey(slot))) return;
      map.get(idx).push(slot);
    });
    for (let i = 0; i < 7; i++) {
      const list = map.get(i);
      list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }
    return map;
  }, [datedSlots, weekDayISOs, blocksByColumn]);

  const layoutBlock = useCallback((block) => {
    const startMin = timeToMinutesSinceMidnightUTC(block.startTime);
    const endMin = timeToMinutesSinceMidnightUTC(block.endTime);
    const startFromGrid = startMin - startHour * 60;
    const durMin = Math.max(endMin - startMin, 15);
    const topPx = (startFromGrid / 60) * PIXELS_PER_HOUR;
    const heightPx = Math.max((durMin / 60) * PIXELS_PER_HOUR, 22);
    return { topPx, heightPx };
  }, [startHour]);

  const layoutDatedSlot = useCallback((slot) => {
    const startMin = hhmmToMinutes(slot.startTime);
    const endMin = hhmmToMinutes(slot.endTime);
    const startFromGrid = startMin - startHour * 60;
    const durMin = Math.max(endMin - startMin, 15);
    const topPx = (startFromGrid / 60) * PIXELS_PER_HOUR;
    const heightPx = Math.max((durMin / 60) * PIXELS_PER_HOUR, 22);
    return { topPx, heightPx };
  }, [startHour]);

  /**
   * Carriles por columna. En modo «ocupado» los bloques derivados no entran en
   * el reparto: se dibujan a todo el ancho sobre su base (lo que queda rayado
   * sin cubrir es tiempo ocupado en Google) y no capturan clics.
   */
  const lanesByColumn = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < 7; i++) {
      const items = [];
      for (const b of blocksByColumn.get(i) || []) {
        const isDerived = syncMode === "busy" && b.source === "calendar_sync";
        if (isDerived) continue;
        const start = timeToMinutesSinceMidnightUTC(b.startTime);
        const end = timeToMinutesSinceMidnightUTC(b.endTime);
        items.push({ key: `block:${b.id}`, start, end: Math.max(end, start + 15) });
      }
      (datedByColumn.get(i) || []).forEach((slot, si) => {
        const start = hhmmToMinutes(slot.startTime);
        const end = hhmmToMinutes(slot.endTime);
        items.push({ key: `dated:${slot.id || si}:${slot.date}`, start, end: Math.max(end, start + 15) });
      });
      map.set(i, layoutLanes(items));
    }
    return map;
  }, [blocksByColumn, datedByColumn, syncMode]);

  const laneStyle = useCallback((dow, key) => {
    const info = lanesByColumn.get(dow)?.get(key);
    if (!info || info.lanes <= 1) return { style: {}, narrow: false };
    return {
      style: { "--lane": info.lane, "--lanes": info.lanes },
      narrow: true,
    };
  }, [lanesByColumn]);

  const [editModal, setEditModal] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [editError, setEditError] = useState("");

  const openEditRecurringBlock = useCallback((block) => {
    const isRecurring = block.recurring !== false;
    const specificDate = block.specificDate
      ? (typeof block.specificDate === 'string'
          ? block.specificDate.substring(0, 10)
          : new Date(block.specificDate).toISOString().substring(0, 10))
      : "";
    setEditError("");
    setEditModal({
      id:           block.id,
      recurring:    isRecurring,
      dayOfWeek:    block.dayOfWeek,
      specificDate,
      label:        block.label?.trim?.() || "",
      startTime:    apiTimeToHHMMInput(block.startTime),
      endTime:      apiTimeToHHMMInput(block.endTime),
    });
  }, []);

  const openEditDatedSlot = useCallback((slot, dow) => {
    const id = slot?.availabilityBlockId;
    if (!id) return;
    const { startTime, endTime } = slotStartEndForInput(slot);
    const rawLabel = slot.label?.trim?.() || "";
    const titleStr = typeof slot.title === "string" ? slot.title.trim() : "";
    const titleAsLabel =
      titleStr && titleStr !== t("tutorAvailability.defaultSlotTitle")
        ? titleStr
        : "";
    setEditError("");
    setEditModal({
      id,
      dayOfWeek: dow,
      label: rawLabel || titleAsLabel,
      startTime,
      endTime,
    });
  }, [t]);

  const closeEditModal = useCallback(() => {
    if (editSaving || editDeleting) return;
    setEditModal(null);
    setEditError("");
  }, [editSaving, editDeleting]);

  useEffect(() => {
    if (!editModal) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeEditModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editModal, closeEditModal]);

  const deleteFromEditModal = useCallback(async () => {
    if (!editModal || editSaving || editDeleting) return;
    setEditDeleting(true);
    setEditError("");
    const r = await AvailabilityService.deleteAvailability(editModal.id);
    setEditDeleting(false);
    if (r.success) {
      setEditModal(null);
      onReload?.();
      return;
    }
    setEditError(r.error || t("tutorAvailability.editSaveError"));
  }, [editModal, editSaving, editDeleting, onReload, t]);

  const submitEditModal = useCallback(async () => {
    if (!editModal) return;
    const sm = hhmmInputToMinutes(editModal.startTime);
    const em = hhmmInputToMinutes(editModal.endTime);
    if (em <= sm) {
      setEditError(t("tutorAvailability.editInvalidTimes"));
      return;
    }
    if (!editModal.recurring && !editModal.specificDate) {
      setEditError("La fecha específica es requerida para bloques de una sola vez.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    const trimmed = editModal.label.trim();
    const updates = {
      startTime:  editModal.startTime,
      endTime:    editModal.endTime,
      label:      trimmed === "" ? null : trimmed,
      recurring:  editModal.recurring,
    };
    if (editModal.recurring) {
      updates.dayOfWeek    = Number(editModal.dayOfWeek);
      updates.specificDate = null;
    } else {
      updates.specificDate = editModal.specificDate || null;
    }
    const res = await AvailabilityService.updateAvailability(editModal.id, updates);
    setEditSaving(false);
    if (res.success) {
      setEditModal(null);
      setEditError("");
      onReload?.();
      return;
    }
    if (res.code === "OVERLAP") {
      setEditError(t("tutorAvailability.editOverlapError"));
    } else {
      setEditError(res.error || t("tutorAvailability.editSaveError"));
    }
  }, [editModal, onReload, t]);

  const goPrevMonth = () => onSelectDay?.(addMonthsFirstDay(anchorDate, -1));
  const goNextMonth = () => onSelectDay?.(addMonthsFirstDay(anchorDate, 1));

  return (
    <section className={`tutor-week-time-grid${hideHead ? ' tutor-week-time-grid--embedded' : ''}`} id="weekly-availability-editor">
      {!hideHead && (
        <div className="tutor-week-time-grid__head">
          <h3 className="tutor-week-time-grid__title">{t('tutorAvailability.weeklySectionTitle')}</h3>
          <p className="tutor-week-time-grid__hint">{t('tutorAvailability.weeklySectionHint')}</p>
        </div>
      )}

      <div className="tutor-week-time-grid__toolbar">
        <button
          type="button"
          className="tutor-week-time-grid__nav-btn"
          onClick={() => onSelectDay?.(addDays(anchorDate, -7))}
          aria-label={t("tutorAvailability.weekPrev")}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="tutor-week-time-grid__range">{rangeLabel}</span>
        <button
          type="button"
          className="tutor-week-time-grid__nav-btn"
          onClick={() => onSelectDay?.(addDays(anchorDate, 7))}
          aria-label={t("tutorAvailability.weekNext")}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="tutor-week-time-grid__today"
          onClick={() => onSelectDay?.(new Date())}
        >
          {t("tutorAvailability.weekToday")}
        </button>
      </div>

      <div className="tutor-week-time-grid__sheet">
        {/* Una sola grilla CSS para cabecera y columnas: cabecera (8 celdas) y
            cuerpo (8 celdas) comparten exactamente los mismos grid-template-columns,
            por construcción, en lugar de ser dos grids independientes que podían
            desincronizarse en mobile. */}
        <div className="tutor-week-time-grid__sheet-scroll">
          <div className="tutor-week-time-grid__corner" aria-hidden />
          {weekDays.map((d, i) => (
            <div
              key={i}
              className={`tutor-week-time-grid__day-head ${isToday(d) ? "tutor-week-time-grid__day-head--today" : ""}`}
            >
              <button
                type="button"
                className="tutor-week-time-grid__day-main"
                onClick={() => onSelectDay?.(d)}
              >
                <span className="tutor-week-time-grid__dow">
                  {d.toLocaleDateString(locale === "en" ? "en-US" : "es-ES", { weekday: "short" })}
                </span>
                <span className="tutor-week-time-grid__dom">{d.getDate()}</span>
              </button>
              <button
                type="button"
                className="tutor-week-time-grid__add-mini"
                onClick={() => onAddForDay?.(i)}
                title={t("tutorAvailability.addBlockForDay")}
                aria-label={t("tutorAvailability.addBlockForDay")}
              >
                <Plus size={14} />
              </button>
            </div>
          ))}

          <div className="tutor-week-time-grid__labels" style={{ height: bodyHeightPx }}>
            {hours.map((h) => (
              <div key={h} className="tutor-week-time-grid__hour-label">
                {formatHourLabel(h, locale)}
              </div>
            ))}
          </div>

          {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
              <div
                key={dow}
                className="tutor-week-time-grid__col"
                style={{ height: bodyHeightPx }}
              >
                <div className="tutor-week-time-grid__col-bg" aria-hidden />
                {(blocksByColumn.get(dow) || []).map((block) => {
                  const { topPx, heightPx } = layoutBlock(block);
                  const start = timeToMinutesSinceMidnightUTC(block.startTime);
                  const end = timeToMinutesSinceMidnightUTC(block.endTime);
                  const sh = Math.floor(start / 60);
                  const sm = start % 60;
                  const eh = Math.floor(end / 60);
                  const em = end % 60;
                  const timeStr = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}–${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                  const labelStr = block.label?.trim?.() || "";
                  const isRecurring = block.recurring !== false;
                  const isSynced = block.source === "calendar_sync";
                  // Modo «eventos = ocupado»: los manuales son la base (no se
                  // publican solos) y los sincronizados son la disponibilidad
                  // real, recalculada en cada sincronización: no se editan a
                  // mano, se cambia la base o el calendario de Google.
                  const isBase = syncMode === "busy" && !isSynced;
                  const isDerived = syncMode === "busy" && isSynced;
                  let badge = null;
                  if (isBase) badge = t("tutorAvailability.baseBlockBadge");
                  else if (isSynced) badge = t("tutorAvailability.syncedBlockBadge");
                  else if (!isRecurring) badge = t("tutorAvailability.onceBlockBadge");
                  const { style: lane, narrow } = laneStyle(dow, `block:${block.id}`);
                  const className = [
                    "tutor-week-time-grid__block",
                    isRecurring ? "tutor-week-time-grid__block--recurring" : "tutor-week-time-grid__block--one-time",
                    isSynced ? "tutor-week-time-grid__block--synced" : "",
                    isBase ? "tutor-week-time-grid__block--base" : "",
                    isDerived ? "tutor-week-time-grid__block--derived" : "",
                    narrow ? "tutor-week-time-grid__block--narrow" : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <div
                      key={block.id}
                      className={className}
                      style={{ top: topPx, height: heightPx, ...lane }}
                    >
                      {!isDerived && (
                        <button
                          type="button"
                          className="tutor-week-time-grid__block-edit-hit"
                          aria-label={t("tutorAvailability.editBlockAria")}
                          title={t("tutorAvailability.editBlockAria")}
                          onClick={() => openEditRecurringBlock(block)}
                        />
                      )}
                      <div className="tutor-week-time-grid__block-inner">
                        <span className="tutor-week-time-grid__block-time">{timeStr}</span>
                        {badge ? (
                          <span
                            className="tutor-week-time-grid__block-badge"
                            title={isDerived ? t("tutorAvailability.derivedBlockTitle") : undefined}
                          >
                            {badge}
                          </span>
                        ) : null}
                        {labelStr ? (
                          <span className="tutor-week-time-grid__block-label">{labelStr}</span>
                        ) : null}
                      </div>
                      {!isDerived && (
                        <button
                          type="button"
                          className="tutor-week-time-grid__block-del"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const r = await AvailabilityService.deleteAvailability(block.id);
                            if (r.success) onReload?.();
                          }}
                          title={t("tutorAvailability.removeBlock")}
                          aria-label={t("tutorAvailability.removeBlock")}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {(datedByColumn.get(dow) || []).map((slot, si) => {
                  const { topPx, heightPx } = layoutDatedSlot(slot);
                  const timeStr = `${slot.startTime}–${slot.endTime}`;
                  const canEdit = !!slot.availabilityBlockId;
                  const datedLabel =
                    slot.label?.trim?.() ||
                    (slot.title &&
                    String(slot.title).trim() &&
                    slot.title !== t("tutorAvailability.defaultSlotTitle")
                      ? String(slot.title).trim()
                      : "");
                  const { style: lane, narrow } = laneStyle(dow, `dated:${slot.id || si}:${slot.date}`);
                  return (
                    <div
                      key={`dated-${slot.id || si}-${slot.date}`}
                      className={`tutor-week-time-grid__block tutor-week-time-grid__block--dated${
                        canEdit ? " tutor-week-time-grid__block--dated-editable" : ""
                      }${narrow ? " tutor-week-time-grid__block--narrow" : ""}`}
                      style={{ top: topPx, height: heightPx, ...lane }}
                    >
                      {canEdit ? (
                        <button
                          type="button"
                          className="tutor-week-time-grid__block-edit-hit"
                          aria-label={t("tutorAvailability.editBlockAria")}
                          title={t("tutorAvailability.editBlockAria")}
                          onClick={() => openEditDatedSlot(slot, dow)}
                        />
                      ) : null}
                      <div className="tutor-week-time-grid__block-inner">
                        <span className="tutor-week-time-grid__block-time">{timeStr}</span>
                        {datedLabel ? (
                          <span className="tutor-week-time-grid__block-label">{datedLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
          ))}
        </div>
      </div>

      <p className="tutor-week-time-grid__scroll-hint" role="note">
        {t('tutorAvailability.weekGridScrollHint')}
      </p>

      {editModal ? (
        <div
          className="tutor-week-time-grid__modal-backdrop"
          role="presentation"
          onClick={closeEditModal}
        >
          <div
            className="tutor-week-time-grid__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutor-week-edit-block-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="tutor-week-edit-block-title" className="tutor-week-time-grid__modal-title">
              {t("tutorAvailability.editBlockTitle")}
            </h4>

            {/* Recurring toggle */}
            <div className="tutor-week-time-grid__modal-field">
              <span>{t("tutorAvailability.editRecurringTypeLabel")}</span>
              <div className="tutor-week-time-grid__modal-toggle">
                <button
                  type="button"
                  className={`tutor-week-time-grid__modal-toggle-btn${editModal.recurring ? ' tutor-week-time-grid__modal-toggle-btn--active' : ''}`}
                  onClick={() => setEditModal((m) => m ? { ...m, recurring: true } : m)}
                  disabled={editSaving || editDeleting}
                >
                  <Repeat size={13} />
                  {t("tutorAvailability.recurringOption")}
                </button>
                <button
                  type="button"
                  className={`tutor-week-time-grid__modal-toggle-btn${!editModal.recurring ? ' tutor-week-time-grid__modal-toggle-btn--active tutor-week-time-grid__modal-toggle-btn--once' : ''}`}
                  onClick={() => setEditModal((m) => m ? { ...m, recurring: false } : m)}
                  disabled={editSaving || editDeleting}
                >
                  <CalendarDays size={13} />
                  {t("tutorAvailability.onceOption")}
                </button>
              </div>
            </div>

            {/* Day selector — condicional */}
            {editModal.recurring ? (
              <label className="tutor-week-time-grid__modal-field">
                <span>{t("tutorAvailability.editDayOfWeekLabel")}</span>
                <select
                  className="tutor-week-time-grid__modal-input"
                  value={editModal.dayOfWeek}
                  onChange={(e) =>
                    setEditModal((m) => m ? { ...m, dayOfWeek: Number(e.target.value) } : m)
                  }
                  disabled={editSaving || editDeleting}
                >
                  {dayOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="tutor-week-time-grid__modal-field">
                <span>{t("tutorAvailability.editSpecificDateLabel")}</span>
                <input
                  type="date"
                  className="tutor-week-time-grid__modal-input"
                  value={editModal.specificDate || ""}
                  onChange={(e) =>
                    setEditModal((m) => m ? { ...m, specificDate: e.target.value } : m)
                  }
                  disabled={editSaving || editDeleting}
                />
              </label>
            )}

            <label className="tutor-week-time-grid__modal-field">
              <span>{t("tutorAvailability.editBlockNameLabel")}</span>
              <input
                type="text"
                className="tutor-week-time-grid__modal-input"
                maxLength={160}
                value={editModal.label}
                placeholder={t("tutorAvailability.editBlockNamePlaceholder")}
                onChange={(e) =>
                  setEditModal((m) => (m ? { ...m, label: e.target.value } : m))
                }
                disabled={editSaving || editDeleting}
              />
            </label>

            <div className="tutor-week-time-grid__modal-row">
              <label className="tutor-week-time-grid__modal-field tutor-week-time-grid__modal-field--half">
                <span>{t("tutorAvailability.startTimeLabel")}</span>
                <input
                  type="time"
                  className="tutor-week-time-grid__modal-input"
                  value={editModal.startTime}
                  onChange={(e) =>
                    setEditModal((m) => (m ? { ...m, startTime: e.target.value } : m))
                  }
                  disabled={editSaving || editDeleting}
                />
              </label>
              <label className="tutor-week-time-grid__modal-field tutor-week-time-grid__modal-field--half">
                <span>{t("tutorAvailability.endTimeLabel")}</span>
                <input
                  type="time"
                  className="tutor-week-time-grid__modal-input"
                  value={editModal.endTime}
                  onChange={(e) =>
                    setEditModal((m) => (m ? { ...m, endTime: e.target.value } : m))
                  }
                  disabled={editSaving || editDeleting}
                />
              </label>
            </div>

            {editError ? (
              <p className="tutor-week-time-grid__modal-error" role="alert">
                {editError}
              </p>
            ) : null}

            <div className="tutor-week-time-grid__modal-actions">
              <button
                type="button"
                className="tutor-week-time-grid__modal-btn tutor-week-time-grid__modal-btn--danger"
                onClick={deleteFromEditModal}
                disabled={editSaving || editDeleting}
              >
                <Trash2 size={14} aria-hidden="true" />
                {editDeleting ? t("tutorAvailability.removingBlock") : t("tutorAvailability.removeBlock")}
              </button>
              <div className="tutor-week-time-grid__modal-actions-main">
                <button
                  type="button"
                  className="tutor-week-time-grid__modal-btn tutor-week-time-grid__modal-btn--ghost"
                  onClick={closeEditModal}
                  disabled={editSaving || editDeleting}
                >
                  {t("tutorAvailability.cancel")}
                </button>
                <button
                  type="button"
                  className="tutor-week-time-grid__modal-btn tutor-week-time-grid__modal-btn--primary"
                  onClick={submitEditModal}
                  disabled={editSaving || editDeleting}
                >
                  {editSaving ? t("tutorAvailability.savingEdit") : t("tutorAvailability.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
