"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Edit2, Save, X, Bell, Calendar as CalendarIcon } from "lucide-react";
import "./UnifiedAvailability.css";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import { useI18n } from "../../../lib/i18n";
import { useTutorAvailability } from "../../hooks/useTutorAvailability";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import TutoringDetailsModal from "../TutoringDetailsModal/TutoringDetailsModal";
import TutorApprovalModal from "../TutorApprovalModal/TutorApprovalModal";

// ── Constants ────────────────────────────────────────────────────────────────

/** Display order: Monday first. Values match DB dayOfWeek (0=Sun … 6=Sat). */
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

const START_HOUR = 6;
const END_HOUR = 22;
const SLOT_COUNT = END_HOUR - START_HOUR; // 16 hourly slots

const DAY_LABELS = {
  es: { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" },
  en: { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" },
};

// ── Conversion helpers ────────────────────────────────────────────────────────

/**
 * Extract the hour (0-23) from a time value that may arrive in two formats:
 *   - ISO string from Prisma DateTime @db.Time(): "1970-01-01T08:00:00.000Z"
 *   - Plain time string:                          "08:00" or "08:00:00"
 */
function parseHour(timeValue) {
  const s = String(timeValue);
  const tIdx = s.indexOf("T");
  if (tIdx !== -1) return parseInt(s.slice(tIdx + 1, tIdx + 3), 10); // ISO
  return parseInt(s.slice(0, 2), 10);                                  // HH:MM
}

function blocksToCells(availabilities) {
  const cells = new Set();
  for (const block of availabilities) {
    const startH = parseHour(block.startTime);
    const endH = parseHour(block.endTime);
    for (let h = startH; h < endH; h++) {
      const idx = h - START_HOUR;
      if (idx >= 0 && idx < SLOT_COUNT) cells.add(`${block.dayOfWeek}-${idx}`);
    }
  }
  return cells;
}

function cellsToBlocks(cells, dayOfWeek) {
  const indices = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (cells.has(`${dayOfWeek}-${i}`)) indices.push(i);
  }
  const blocks = [];
  let i = 0;
  while (i < indices.length) {
    let j = i;
    while (j + 1 < indices.length && indices[j + 1] === indices[j] + 1) j++;
    blocks.push({
      startTime: `${String(indices[i] + START_HOUR).padStart(2, "0")}:00`,
      endTime: `${String(indices[j] + START_HOUR + 1).padStart(2, "0")}:00`,
    });
    i = j + 1;
  }
  return blocks;
}

// Human-readable API error messages
const API_ERRORS = {
  TUTOR_NOT_APPROVED:
    "Tu cuenta aún no está aprobada como tutor. Contacta al administrador.",
  OVERLAP: "Hay bloques de horario solapados. Revisa la disponibilidad.",
};

function friendlyError(apiError) {
  return API_ERRORS[apiError] ?? `Error al guardar: ${apiError ?? "Intenta de nuevo."}`;
}

// ── WeeklyGrid ────────────────────────────────────────────────────────────────

function WeeklyGrid({ draft, editMode, locale, onCellMouseDown, onCellMouseEnter, onCellTouchStart }) {
  const today = new Date().getDay();
  const labels = DAY_LABELS[locale] ?? DAY_LABELS.es;

  return (
    <div className="weekly-grid-container" role="grid" aria-label="Horario semanal">
      {/* Sticky header row */}
      <div className="weekly-grid-header">
        <div className="grid-time-spacer" />
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            role="columnheader"
            className={`grid-day-header${day === today ? " today" : ""}`}
          >
            {labels[day]}
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="weekly-grid-body">
        {Array.from({ length: SLOT_COUNT }, (_, slotIdx) => {
          const hour = START_HOUR + slotIdx;
          return (
            <div key={slotIdx} className="grid-row" role="row">
              <div className="grid-time-label" role="rowheader">
                {String(hour).padStart(2, "0")}:00
              </div>
              {WEEK_DAYS.map((day) => {
                const cellKey = `${day}-${slotIdx}`;
                const isSelected = draft.has(cellKey);
                return (
                  <div
                    key={cellKey}
                    role="gridcell"
                    aria-selected={isSelected}
                    /* data-cellkey is used by the touchmove handler to identify
                       which cell the finger is over via document.elementFromPoint */
                    data-cellkey={cellKey}
                    className={`grid-cell${isSelected ? " selected" : ""}${editMode ? " editable" : ""}`}
                    onMouseDown={editMode ? (e) => onCellMouseDown(e, cellKey) : undefined}
                    onMouseEnter={editMode ? () => onCellMouseEnter(cellKey) : undefined}
                    onTouchStart={editMode ? (e) => onCellTouchStart(e, cellKey) : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UnifiedAvailability() {
  const { locale } = useI18n();
  const { availabilities, schedule, sessions, pendingSessions, loading, error, reload } =
    useTutorAvailability();

  // Grid state
  const [draft, setDraft] = useState(new Set());
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Refs for drag — avoids stale closures in global event listeners
  const isDragging = useRef(false);
  const dragMode = useRef("add"); // "add" | "remove"
  const editModeRef = useRef(false);

  // Session UI state
  const [activeTab, setActiveTab] = useState("upcoming");
  const [selectedSession, setSelectedSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPendingSession, setSelectedPendingSession] = useState(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);

  // Keep editModeRef in sync (used by global touchmove handler)
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  // Keep draft in sync with DB data
  useEffect(() => {
    setDraft(blocksToCells(availabilities));
  }, [availabilities]);

  // Global pointer/touch end events + touch-drag support
  useEffect(() => {
    const endDrag = () => {
      isDragging.current = false;
    };

    /**
     * Handle touch drag across cells.
     * We use document.elementFromPoint because onTouchMove fires on the
     * element where the touch *started*, not where the finger currently is.
     */
    const handleTouchMove = (e) => {
      if (!isDragging.current || !editModeRef.current) return;
      e.preventDefault(); // prevent page scroll while selecting cells
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cellKey = el?.dataset?.cellkey;
      if (!cellKey) return;
      setDraft((prev) => {
        const next = new Set(prev);
        if (dragMode.current === "add") next.add(cellKey);
        else next.delete(cellKey);
        return next;
      });
    };

    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
    // passive: false is required to be able to call preventDefault()
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchend", endDrag);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []); // run once — refs are used inside to avoid stale closures

  // ── Derived session lists ─────────────────────────────────────────────────

  const upcomingSessions = useMemo(() => {
    const now = new Date();
    return sessions
      .filter((s) => new Date(s.scheduledStart) > now && s.status !== "Canceled")
      .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
  }, [sessions]);

  const pastSessions = useMemo(
    () =>
      sessions.filter(
        (s) => new Date(s.scheduledStart) <= new Date() || s.status === "Canceled"
      ),
    [sessions]
  );

  const futurePendingSessions = useMemo(
    () => pendingSessions.filter((s) => new Date(s.scheduledStart) > new Date()),
    [pendingSessions]
  );

  // ── Grid interaction handlers ─────────────────────────────────────────────

  const handleCellMouseDown = useCallback((e, cellKey) => {
    e.preventDefault();
    isDragging.current = true;
    setDraft((prev) => {
      const next = new Set(prev);
      if (prev.has(cellKey)) {
        dragMode.current = "remove";
        next.delete(cellKey);
      } else {
        dragMode.current = "add";
        next.add(cellKey);
      }
      return next;
    });
  }, []);

  const handleCellMouseEnter = useCallback((cellKey) => {
    if (!isDragging.current) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (dragMode.current === "add") next.add(cellKey);
      else next.delete(cellKey);
      return next;
    });
  }, []);

  // Touch equivalent of mouseDown (starts the drag session)
  const handleCellTouchStart = useCallback((e, cellKey) => {
    // Don't preventDefault here — let the browser's native scroll work
    // unless the user is in edit mode, which is checked in the global touchmove.
    isDragging.current = true;
    setDraft((prev) => {
      const next = new Set(prev);
      if (prev.has(cellKey)) {
        dragMode.current = "remove";
        next.delete(cellKey);
      } else {
        dragMode.current = "add";
        next.add(cellKey);
      }
      return next;
    });
  }, []);

  // ── Edit mode handlers ────────────────────────────────────────────────────

  const handleEdit = () => {
    setSaveError(null);
    setEditMode(true);
  };

  const handleCancel = () => {
    setDraft(blocksToCells(availabilities));
    setSaveError(null);
    setEditMode(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const results = await Promise.all(
        [0, 1, 2, 3, 4, 5, 6].map((day) =>
          AvailabilityService.bulkReplaceDay(day, cellsToBlocks(draft, day))
        )
      );
      // Surface the first API error with a human-readable message
      const failed = results.find((r) => !r.success);
      if (failed) {
        setSaveError(friendlyError(failed.error));
        return;
      }
      await reload();
      setEditMode(false);
    } catch (err) {
      setSaveError(friendlyError(err.message));
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatSessionDateTime = (dateTime) => {
    const d = new Date(dateTime);
    const localeStr = locale === "en" ? "en-US" : "es-ES";
    return {
      date: d.toLocaleDateString(localeStr, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      time: d.toLocaleTimeString(localeStr, { hour: "2-digit", minute: "2-digit" }),
    };
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="unified-availability-loading">
        <div className="loading-spinner" />
        <p>Cargando disponibilidad...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="unified-availability-loading">
        <p className="save-error">{error}</p>
        <button className="edit-slots-btn" onClick={reload}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="unified-availability">
      <div className="unified-header">
        <h1 className="unified-title">Mi Disponibilidad</h1>
        <GoogleCalendarButton />
      </div>

      <div className="unified-content">
        {/* ── Left: weekly grid ── */}
        <div className="availability-section">
          <div className="availability-card">
            <div className="availability-card-header">
              <div>
                <h3>Horario semanal</h3>
                <p className="edit-hint">
                  {editMode
                    ? "Toca o arrastra para seleccionar / deseleccionar horas"
                    : "Las celdas naranja son tus horas disponibles"}
                </p>
              </div>

              <div className="edit-controls">
                {editMode ? (
                  <>
                    <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
                      <X size={15} /> Cancelar
                    </button>
                    <button className="save-btn" onClick={handleSave} disabled={saving}>
                      <Save size={15} />
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </>
                ) : (
                  <button className="edit-slots-btn" onClick={handleEdit}>
                    <Edit2 size={15} /> Editar disponibilidad
                  </button>
                )}
              </div>
            </div>

            {saveError && <p className="save-error">{saveError}</p>}

            <WeeklyGrid
              draft={draft}
              editMode={editMode}
              locale={locale}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseEnter={handleCellMouseEnter}
              onCellTouchStart={handleCellTouchStart}
            />

            {schedule && (
              <div className="schedule-settings-summary">
                <span>
                  Buffer entre sesiones: <strong>{schedule.bufferTime ?? 15} min</strong>
                </span>
                {schedule.autoAcceptSession && (
                  <span className="auto-accept-badge">Aceptación automática</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: sessions ── */}
        <div className="sessions-section">
          <div className="session-tabs">
            <button
              id="pending-tab"
              className={`tab${activeTab === "pending" ? " active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              Pendientes ({futurePendingSessions.length})
            </button>
            <button
              id="upcoming-tab"
              className={`tab${activeTab === "upcoming" ? " active" : ""}`}
              onClick={() => setActiveTab("upcoming")}
            >
              Próximas
            </button>
            <button
              id="past-tab"
              className={`tab${activeTab === "past" ? " active" : ""}`}
              onClick={() => setActiveTab("past")}
            >
              Pasadas
            </button>
          </div>

          <div className="sessions-content">
            {activeTab === "pending" && (
              <div className="pending-sessions">
                {futurePendingSessions.length > 0 ? (
                  futurePendingSessions.map((session, i) => {
                    const { date: sd, time } = formatSessionDateTime(session.scheduledStart);
                    return (
                      <div
                        key={session.id ?? i}
                        className="session-item pending-item"
                        onClick={() => {
                          setSelectedPendingSession(session);
                          setIsApprovalModalOpen(true);
                        }}
                      >
                        <Bell className="session-icon pending-icon" size={16} />
                        <div className="session-info">
                          <h4>
                            {session.course?.name ?? "Sesión de tutoría"} –{" "}
                            {session.student?.name ?? session.studentId}
                          </h4>
                          <p>
                            {sd} – {time}
                          </p>
                          <span className="pending-badge">Pendiente de aprobación</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="no-sessions">
                    <Bell size={24} />
                    <p>Sin solicitudes pendientes</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "upcoming" && (
              <div className="upcoming-sessions">
                {upcomingSessions.length > 0 ? (
                  upcomingSessions.map((session, i) => {
                    const { date: sd, time } = formatSessionDateTime(session.scheduledStart);
                    return (
                      <div
                        key={session.id ?? i}
                        className="session-item"
                        onClick={() => {
                          setSelectedSession(session);
                          setIsModalOpen(true);
                        }}
                      >
                        <CalendarIcon className="session-icon" size={16} />
                        <div className="session-info">
                          <h4>{session.course?.name ?? "Sesión de tutoría"}</h4>
                          <p>
                            {sd} – {time}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="no-sessions">
                    <CalendarIcon size={24} />
                    <p>Sin sesiones próximas</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "past" && (
              <div className="past-sessions">
                {pastSessions.length > 0 ? (
                  pastSessions.map((session, i) => {
                    const { date: sd, time } = formatSessionDateTime(session.scheduledStart);
                    return (
                      <div
                        key={session.id ?? i}
                        className="session-item"
                        onClick={() => {
                          setSelectedSession(session);
                          setIsModalOpen(true);
                        }}
                      >
                        <CalendarIcon className="session-icon" size={16} />
                        <div className="session-info">
                          <h4>{session.course?.name ?? "Sesión de tutoría"}</h4>
                          <p>
                            {sd} – {time}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="no-sessions">
                    <CalendarIcon size={24} />
                    <p>Sin sesiones pasadas</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Session details modal */}
      {typeof window !== "undefined" &&
        isModalOpen &&
        selectedSession &&
        createPortal(
          <TutoringDetailsModal
            session={selectedSession}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedSession(null);
            }}
            onSessionUpdate={reload}
          />,
          document.body
        )}

      {/* Tutor approval modal */}
      {isApprovalModalOpen && selectedPendingSession && (
        <TutorApprovalModal
          session={selectedPendingSession}
          isOpen={isApprovalModalOpen}
          onClose={() => {
            setIsApprovalModalOpen(false);
            setSelectedPendingSession(null);
          }}
          onApprovalComplete={reload}
        />
      )}
    </div>
  );
}
