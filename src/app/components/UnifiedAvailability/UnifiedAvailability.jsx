"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar as CalendarIcon, Bell, Clock, RefreshCw } from "lucide-react";
import "./UnifiedAvailability.css";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import SessionDetailView from "../SessionDetailView/SessionDetailView";
import TutorWeekTimeGrid from "../TutorWeekTimeGrid/TutorWeekTimeGrid";
import PageSectionHeader from "../PageSectionHeader/PageSectionHeader";
import { Button } from "../../../components/ui/button";

/** Normalize API session start time (supports legacy + Prisma shapes). */
function getSessionStart(session) {
  if (!session) return null;
  const raw = session.scheduledStart ?? session.startTimestamp ?? session.scheduledDateTime;
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isCanceledStatus(session) {
  const st = String(session?.status ?? "").toLowerCase();
  return st === "canceled" || st === "cancelled";
}

function isPendingStatus(session) {
  return String(session?.status ?? "").toLowerCase() === "pending";
}

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

export default function UnifiedAvailability() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [date, setDate] = useState(new Date());
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);
  const [error, setError] = useState(null);
  
  // Session management
  const [activeTab, setActiveTab] = useState("upcoming");
  const [selectedSession, setSelectedSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Availability management
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSlot, setNewSlot] = useState({
    label:      "",
    recurring:  true,
    dayOfWeek:  new Date().getDay(), // used when recurring=true
    date:       "",                  // used when recurring=false (YYYY-MM-DD)
    startTime:  "",
    endTime:    "",
  });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [selectedDaySlots, setSelectedDaySlots] = useState([]);
  const [weeklyRawBlocks, setWeeklyRawBlocks] = useState([]);

  const tutorKey = user?.uid || user?.id || user?.email || null;

  const loadData = useCallback(async () => {
    if (!tutorKey) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const [availabilityResult, rawBlocks] = await Promise.all([
        AvailabilityService.getAvailabilityWithFallback(tutorKey),
        AvailabilityService.getMyAvailabilities(),
      ]);

      setAvailabilitySlots(availabilityResult.availabilitySlots);
      setIsConnected(availabilityResult.connected);
      setUsingMockData(availabilityResult.usingMockData || false);
      setWeeklyRawBlocks(Array.isArray(rawBlocks) ? rawBlocks : []);

      const fetchedSessions = await TutoringSessionService.getTutorSessions();

      const normalizeSession = (s) => ({
        ...s,
        scheduledStart: s.scheduledStart ?? s.startTimestamp,
        scheduledEnd: s.scheduledEnd ?? s.endTimestamp,
      });

      const sessionsArray = Array.isArray(fetchedSessions) ? fetchedSessions : [];
      const sortedSessions = sessionsArray.map(normalizeSession).sort(
        (a, b) => {
          const tb = getSessionStart(b)?.getTime() ?? 0;
          const ta = getSessionStart(a)?.getTime() ?? 0;
          return tb - ta;
        }
      );
      setSessions(sortedSessions);
    } catch (error) {
      console.error('Error loading unified data:', error);
      setError(error.message);
      setAvailabilitySlots([]);
      setWeeklyRawBlocks([]);
      setUsingMockData(true);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [tutorKey, user?.uid, user?.email]);

  useEffect(() => {
    if (!tutorKey) {
      setLoading(false);
      return;
    }
    loadData();

    const handleCalendarUpdate = () => {
      loadData();
    };

    window.addEventListener('calendar-status-update', handleCalendarUpdate);

    return () => {
      window.removeEventListener('calendar-status-update', handleCalendarUpdate);
      AvailabilityService.stopAutoSync();
    };
  }, [tutorKey, loadData]);

  const filterSlotsForSelectedDay = useCallback(
    (selectedDate) => {
      if (!selectedDate || !availabilitySlots.length) {
        setSelectedDaySlots([]);
        return;
      }

      const selectedDateStr = toLocalISODate(selectedDate);

      const daySlots = availabilitySlots.filter((slot) => slot.date === selectedDateStr);

      daySlots.sort((a, b) => {
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        return timeA.localeCompare(timeB);
      });

      setSelectedDaySlots(daySlots);
    },
    [availabilitySlots]
  );

  useEffect(() => {
    if (!availabilitySlots.length) {
      setSelectedDaySlots([]);
      return;
    }
    filterSlotsForSelectedDay(date);
  }, [availabilitySlots, date, filterSlotsForSelectedDay]);

  const resetNewSlot = () =>
    setNewSlot({
      label: "", recurring: true, dayOfWeek: new Date().getDay(), date: "", startTime: "", endTime: "",
    });

  const handleAddSlot = async () => {
    const errors = [];
    if (!newSlot.startTime) errors.push('La hora de inicio es requerida');
    if (!newSlot.endTime)   errors.push('La hora de fin es requerida');
    if (!newSlot.recurring && !newSlot.date) errors.push('La fecha específica es requerida');
    if (newSlot.startTime && newSlot.endTime && newSlot.startTime >= newSlot.endTime)
      errors.push('La hora de fin debe ser posterior a la hora de inicio');
    if (!newSlot.recurring && newSlot.date) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(`${newSlot.date}T12:00:00`) < today)
        errors.push('No se puede crear un horario en el pasado');
    }
    if (errors.length) { setValidationErrors(errors); return; }

    try {
      setCreatingEvent(true);
      setValidationErrors([]);

      const blockData = {
        recurring:  newSlot.recurring,
        startTime:  newSlot.startTime,
        endTime:    newSlot.endTime,
        label:      newSlot.label?.trim() || undefined,
      };
      if (newSlot.recurring) {
        blockData.dayOfWeek = Number(newSlot.dayOfWeek);
      } else {
        blockData.specificDate = newSlot.date;
      }

      const result = await AvailabilityService.createAvailability(blockData);

      if (!result.success) {
        setValidationErrors([result.error || t('tutorAvailability.errorCreatingEvent')]);
        return;
      }

      resetNewSlot();
      setShowAddModal(false);
      await loadData();
    } catch (error) {
      console.error('Error creating availability:', error);
      setValidationErrors([error.message || t('tutorAvailability.errorCreatingEvent')]);
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleSessionClick = (session) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handleSyncCalendar = async () => {
    const tutorId = user?.uid || user?.id || user?.email;

    if (!tutorId || !isConnected) {
      alert(` ${t('tutorAvailability.mustBeConnectedToSync')}`);
      return;
    }

    try {
      setSyncing(true);
      
      // Use intelligent sync to only sync new events (cookies are sent automatically)
      const result = await AvailabilityService.intelligentSync(
        tutorId, // tutorId
        'Disponibilidad', // calendarName - adjust if needed
        30 // daysAhead
      );

      if (result.success) {
        alert(`${t('tutorAvailability.syncSuccess')}\n\n- ${t('tutorAvailability.newEvents')}: ${result.synced || 0}\n- Eliminados: ${result.removed || 0}\n- Sin cambios: ${result.skipped || 0}\n- Total en calendario: ${result.total || 0}`);
        
        // Reload data to show changes
        await loadData();
      } else {
        throw new Error(result.error || result.message || t('tutorAvailability.syncError'));
      }
    } catch (error) {
      console.error('Error syncing calendar:', error);
      alert(` ${t('tutorAvailability.syncFailed')}: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getUpcomingSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((session) => {
      const start = getSessionStart(session);
      if (!start) return false;
      return (
        start > now &&
        !isCanceledStatus(session) &&
        !isPendingStatus(session)
      );
    });
  }, [sessions]);

  const getPastSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((session) => {
      const start = getSessionStart(session);
      if (!start) return isCanceledStatus(session);
      return start <= now || isCanceledStatus(session);
    });
  }, [sessions]);

  const formatSessionDateTime = (dateTime) => {
    if (!dateTime) return { date: "—", time: "—" };
    const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
    return {
      date: date.toLocaleDateString(localeStr, { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString(localeStr, { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const handleAddForDay = useCallback(
    (dayOfWeek) => {
      const ws = startOfWeekSunday(date);
      const target = new Date(ws);
      target.setDate(ws.getDate() + dayOfWeek);
      const iso = toLocalISODate(target);
      setNewSlot((prev) => ({ ...prev, dayOfWeek, date: iso, label: "" }));
      setValidationErrors([]);
      setShowAddModal(true);
    },
    [date]
  );

  const handleGridSelectDay = useCallback(
    (d) => {
      setDate(d);
      filterSlotsForSelectedDay(d);
    },
    [filterSlotsForSelectedDay]
  );

  const scrollToWeeklyEditor = useCallback(() => {
    document.getElementById("weekly-availability-editor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  if (loading) {
    return (
      <div className="unified-availability-loading unified-availability-loading--page">
        <div className="loading-spinner"></div>
        <p>{t('tutorAvailability.loading')}</p>
      </div>
    );
  }

  return (
    <div className="unified-availability unified-availability--page">
      <PageSectionHeader
        title={t("tutorAvailability.title")}
        subtitle={t("tutorAvailability.pageHint")}
        actions={<GoogleCalendarButton />}
      />

      <div className="unified-content">
        <div className="calendar-section">
          <div className="calendar-section__column-card">
            <header className="calendar-section__intro">
              <h2 className="calendar-section__title">{t('tutorAvailability.calendarColumnTitle')}</h2>
              <p className="calendar-section__hint">{t('tutorAvailability.calendarColumnHint')}</p>
            </header>

            <TutorWeekTimeGrid
              anchorDate={date}
              blocks={weeklyRawBlocks}
              datedSlots={availabilitySlots}
              locale={locale}
              t={t}
              onReload={loadData}
              onAddForDay={handleAddForDay}
              onSelectDay={handleGridSelectDay}
              hideHead
            />

          <div className="availability-slots availability-slots--in-column">
            <h3>{t('tutorAvailability.availableSlots')}</h3>
            <div className="slot-actions">
              <Button
                id="add-slot-btn"
                size="pill"
                className="add-slot-btn"
                onClick={() => setShowAddModal(true)}
              >
                {t('tutorAvailability.addSlot')}
              </Button>
              <Button
                id="edit-slots-btn"
                type="button"
                size="pill"
                className="edit-slots-btn"
                onClick={scrollToWeeklyEditor}
              >
                {t('tutorAvailability.editSlots')}
              </Button>
              <Button
                id="sync-calendar-btn"
                size="pill"
                className="sync-calendar-btn"
                onClick={handleSyncCalendar}
                disabled={syncing || !isConnected}
                title={!isConnected ? t('tutorAvailability.connectCalendarFirst') : t('tutorAvailability.syncCalendarTitle')}
              >
                <RefreshCw size={16} className={syncing ? "spinning" : ""} />
                {syncing ? t('tutorAvailability.syncing') : t('tutorAvailability.syncCalendar')}
              </Button>
            </div>

            {/* Selected Day Slots */}
            <div className="selected-day-slots">
              <h4>
                {date ? t('tutorAvailability.availabilityFor', { 
                  date: date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })
                }) : t('tutorAvailability.selectDay')}
              </h4>
              
              {selectedDaySlots.length > 0 ? (
                <div className="slots-list">
                  {selectedDaySlots.map((slot, index) => (
                    <div key={slot.id || index} className="slot-item">
                      <div className="slot-time">
                        <Clock size={14} />
                        <span>{slot.startTime} - {slot.endTime}</span>
                      </div>
                      <div className="slot-details">
                        <h5>{slot.title}</h5>
                        {slot.description && (
                          <p className="slot-description">{slot.description}</p>
                        )}
                        {slot.location && (
                          <p className="slot-location"> {slot.location}</p>
                        )}
                      </div>
                      <div className="slot-status">
                        <span className={`status-badge ${slot.isBooked ? 'booked' : 'available'}`}>
                          {slot.isBooked ? t('tutorAvailability.booked') : t('tutorAvailability.available')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-slots">
                  <CalendarIcon size={24} />
                  <p>{t('tutorAvailability.noSlotsForDay')}</p>
                  <small>{t('tutorAvailability.useAddSlotHint')}</small>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Right Section - Sessions */}
        <div className="sessions-section">
          <div className="sessions-section__intro">
            <h2 className="sessions-section__title">{t("tutorAvailability.sessionsColumnTitle")}</h2>
            <p className="sessions-section__subtitle">{t("tutorAvailability.sessionsColumnHint")}</p>
          </div>
          <div className="session-tabs">
            <button 
              id="upcoming-tab"
              className={`tab ${activeTab === "upcoming" ? "active" : ""}`}
              onClick={() => setActiveTab("upcoming")}
            >
              {t('tutorAvailability.upcoming')}
            </button>
            <button 
              id="past-tab"
              className={`tab ${activeTab === "past" ? "active" : ""}`}
              onClick={() => setActiveTab("past")}
            >
              {t('tutorAvailability.past')}
            </button>
          </div>

          <div className="sessions-content">
            {activeTab === "upcoming" ? (
              <div className="upcoming-sessions">
                {getUpcomingSessions.map((session, index) => {
                  const { date: sessionDate, time } = formatSessionDateTime(getSessionStart(session));
                  return (
                    <div key={index} className="session-item" onClick={() => handleSessionClick(session)}>
                      <CalendarIcon className="session-icon" size={16} />
                      <div className="session-info">
                        <h4>{session.course?.name || session.course || t('tutorAvailability.defaultSessionTitle')}</h4>
                        <p>{sessionDate} - {time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="past-sessions">
                {getPastSessions.map((session, index) => {
                  const { date: sessionDate, time } = formatSessionDateTime(getSessionStart(session));
                  return (
                    <div key={index} className="session-item" onClick={() => handleSessionClick(session)}>
                      <CalendarIcon className="session-icon" size={16} />
                      <div className="session-info">
                        <h4>{session.course?.name || session.course || t('tutorAvailability.defaultSessionTitle')}</h4>
                        <p>{sessionDate} - {time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}            
          </div>
        </div>
      </div>

  {/* Modal para agregar horario */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { resetNewSlot(); setShowAddModal(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t('tutorAvailability.addAvailabilitySlot')}</h3>

            {/* Recurring toggle */}
            <div className="form-group">
              <span className="form-label">Tipo de disponibilidad</span>
              <div className="recurring-toggle">
                <button
                  type="button"
                  className={`recurring-toggle__option${newSlot.recurring ? ' recurring-toggle__option--active' : ''}`}
                  onClick={() => setNewSlot((s) => ({ ...s, recurring: true }))}
                >
                  🔁 Semanal (se repite)
                </button>
                <button
                  type="button"
                  className={`recurring-toggle__option${!newSlot.recurring ? ' recurring-toggle__option--active recurring-toggle__option--once' : ''}`}
                  onClick={() => setNewSlot((s) => ({ ...s, recurring: false }))}
                >
                  📅 Una sola vez
                </button>
              </div>
            </div>

            {/* Day picker — condicional según tipo */}
            {newSlot.recurring ? (
              <div className="form-group">
                <label htmlFor="slot-dow">Día de la semana</label>
                <select
                  id="slot-dow"
                  value={newSlot.dayOfWeek}
                  onChange={(e) => setNewSlot((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))}
                >
                  {["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="slot-date">{t('tutorAvailability.dateLabel')}</label>
                <input
                  id="slot-date"
                  type="date"
                  value={newSlot.date}
                  min={toLocalISODate(new Date())}
                  onChange={(e) => setNewSlot((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="slot-start-time">{t('tutorAvailability.startTimeLabel')}</label>
                <input
                  id="slot-start-time"
                  type="time"
                  value={newSlot.startTime}
                  onChange={(e) => setNewSlot((s) => ({ ...s, startTime: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="slot-end-time">{t('tutorAvailability.endTimeLabel')}</label>
                <input
                  id="slot-end-time"
                  type="time"
                  value={newSlot.endTime}
                  onChange={(e) => setNewSlot((s) => ({ ...s, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="slot-label">Nombre del bloque <span className="form-label--optional">(opcional)</span></label>
              <input
                id="slot-label"
                type="text"
                maxLength={160}
                value={newSlot.label}
                onChange={(e) => setNewSlot((s) => ({ ...s, label: e.target.value }))}
                placeholder="Ej: Tardes de cálculo"
              />
            </div>

            {validationErrors.length > 0 && (
              <div className="validation-errors">
                {validationErrors.map((error, index) => (
                  <p key={index} className="error-text">{error}</p>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <Button
                id="cancel-slot-btn"
                variant="outline"
                onClick={() => { resetNewSlot(); setShowAddModal(false); }}
              >
                {t('tutorAvailability.cancel')}
              </Button>
              <Button
                id="save-slot-btn"
                variant="success"
                onClick={handleAddSlot}
                disabled={creatingEvent}
              >
                {creatingEvent ? t('tutorAvailability.creating') : t('tutorAvailability.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Session Details Modal */}
      {isModalOpen && selectedSession && (
        <SessionDetailView
          session={selectedSession}
          isModal={true}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedSession(null);
          }}
        />
      )}
    </div>
  );
}
