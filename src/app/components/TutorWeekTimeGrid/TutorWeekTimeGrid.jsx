"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import "./TutorWeekTimeGrid.css";

const START_HOUR = 6;
const END_HOUR = 22;
const PIXELS_PER_HOUR = 48;
const NUM_HOURS = END_HOUR - START_HOUR;
const BODY_HEIGHT_PX = NUM_HOURS * PIXELS_PER_HOUR;

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

  const hours = useMemo(
    () => Array.from({ length: NUM_HOURS }, (_, i) => START_HOUR + i),
    []
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
    for (let dow = 0; dow < 7; dow++) {
      map.set(
        dow,
        (blocks || [])
          .filter((b) => b.dayOfWeek === dow)
          .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
      );
    }
    return map;
  }, [blocks]);

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
    const startFromGrid = startMin - START_HOUR * 60;
    const durMin = Math.max(endMin - startMin, 15);
    const topPx = (startFromGrid / 60) * PIXELS_PER_HOUR;
    const heightPx = Math.max((durMin / 60) * PIXELS_PER_HOUR, 22);
    return { topPx, heightPx };
  }, []);

  const layoutDatedSlot = useCallback((slot) => {
    const startMin = hhmmToMinutes(slot.startTime);
    const endMin = hhmmToMinutes(slot.endTime);
    const startFromGrid = startMin - START_HOUR * 60;
    const durMin = Math.max(endMin - startMin, 15);
    const topPx = (startFromGrid / 60) * PIXELS_PER_HOUR;
    const heightPx = Math.max((durMin / 60) * PIXELS_PER_HOUR, 22);
    return { topPx, heightPx };
  }, []);

  const [editModal, setEditModal] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const openEditRecurringBlock = useCallback((block) => {
    setEditError("");
    setEditModal({
      id: block.id,
      dayOfWeek: block.dayOfWeek,
      label: block.label?.trim?.() || "",
      startTime: apiTimeToHHMMInput(block.startTime),
      endTime: apiTimeToHHMMInput(block.endTime),
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
    if (editSaving) return;
    setEditModal(null);
    setEditError("");
  }, [editSaving]);

  useEffect(() => {
    if (!editModal) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeEditModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editModal, closeEditModal]);

  const submitEditModal = useCallback(async () => {
    if (!editModal) return;
    const sm = hhmmInputToMinutes(editModal.startTime);
    const em = hhmmInputToMinutes(editModal.endTime);
    if (em <= sm) {
      setEditError(t("tutorAvailability.editInvalidTimes"));
      return;
    }
    setEditSaving(true);
    setEditError("");
    const trimmed = editModal.label.trim();
    const res = await AvailabilityService.updateAvailability(editModal.id, {
      dayOfWeek: Number(editModal.dayOfWeek),
      startTime: editModal.startTime,
      endTime: editModal.endTime,
      label: trimmed === "" ? null : trimmed,
    });
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
        <div className="tutor-week-time-grid__sheet-scroll">
        <div className="tutor-week-time-grid__header-row">
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
        </div>

        <div className="tutor-week-time-grid__body-wrap">
          <div className="tutor-week-time-grid__labels" style={{ height: BODY_HEIGHT_PX }}>
            {hours.map((h) => (
              <div key={h} className="tutor-week-time-grid__hour-label">
                {formatHourLabel(h, locale)}
              </div>
            ))}
          </div>

          <div className="tutor-week-time-grid__columns">
            {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
              <div
                key={dow}
                className="tutor-week-time-grid__col"
                style={{ height: BODY_HEIGHT_PX }}
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

                  return (
                    <div
                      key={block.id}
                      className="tutor-week-time-grid__block tutor-week-time-grid__block--recurring"
                      style={{ top: topPx, height: heightPx }}
                    >
                      <button
                        type="button"
                        className="tutor-week-time-grid__block-edit-hit"
                        aria-label={t("tutorAvailability.editBlockAria")}
                        title={t("tutorAvailability.editBlockAria")}
                        onClick={() => openEditRecurringBlock(block)}
                      />
                      <div className="tutor-week-time-grid__block-inner">
                        <span className="tutor-week-time-grid__block-time">{timeStr}</span>
                        {labelStr ? (
                          <span className="tutor-week-time-grid__block-label">{labelStr}</span>
                        ) : null}
                      </div>
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
                  return (
                    <div
                      key={`dated-${slot.id || si}-${slot.date}`}
                      className={`tutor-week-time-grid__block tutor-week-time-grid__block--dated${
                        canEdit ? " tutor-week-time-grid__block--dated-editable" : ""
                      }`}
                      style={{ top: topPx, height: heightPx }}
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

            <label className="tutor-week-time-grid__modal-field">
              <span>{t("tutorAvailability.editDayOfWeekLabel")}</span>
              <select
                className="tutor-week-time-grid__modal-input"
                value={editModal.dayOfWeek}
                onChange={(e) =>
                  setEditModal((m) =>
                    m ? { ...m, dayOfWeek: Number(e.target.value) } : m
                  )
                }
                disabled={editSaving}
              >
                {dayOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

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
                disabled={editSaving}
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
                  disabled={editSaving}
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
                  disabled={editSaving}
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
                className="tutor-week-time-grid__modal-btn tutor-week-time-grid__modal-btn--ghost"
                onClick={closeEditModal}
                disabled={editSaving}
              >
                {t("tutorAvailability.cancel")}
              </button>
              <button
                type="button"
                className="tutor-week-time-grid__modal-btn tutor-week-time-grid__modal-btn--primary"
                onClick={submitEditModal}
                disabled={editSaving}
              >
                {editSaving ? t("tutorAvailability.savingEdit") : t("tutorAvailability.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
