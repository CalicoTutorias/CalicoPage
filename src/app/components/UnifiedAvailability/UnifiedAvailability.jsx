"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, Bell, Clock, RefreshCw } from "lucide-react";
import "./UnifiedAvailability.css";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { NotificationService } from "../../services/core/NotificationService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import TutoringDetailsModal from "../TutoringDetailsModal/TutoringDetailsModal";
import TutorApprovalModal from "../TutorApprovalModal/TutorApprovalModal";
import TutorWeekTimeGrid from "../TutorWeekTimeGrid/TutorWeekTimeGrid";
import PageSectionHeader from "../PageSectionHeader/PageSectionHeader";

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
  const [pendingSessions, setPendingSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);
  const [error, setError] = useState(null);
  
  // Session management
  const [activeTab, setActiveTab] = useState("upcoming");
  const [selectedSession, setSelectedSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Approval modal
  const [selectedPendingSession, setSelectedPendingSession] = useState(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  
  // Availability management
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSlot, setNewSlot] = useState({
    title: "",
    date: "",
    startTime: "",
    endTime: "",
    description: "",
    location: "",
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

      const notificationUserId = user?.uid || user?.email;
      const [fetchedSessions, fetchedNotifications] = await Promise.all([
        TutoringSessionService.getTutorSessions(),
        notificationUserId ? NotificationService.getTutorNotifications(notificationUserId) : Promise.resolve([]),
      ]);

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
      setNotifications(Array.isArray(fetchedNotifications) ? fetchedNotifications : []);
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

  const handleAddSlot = async () => {
    try {
      setCreatingEvent(true);
      setValidationErrors([]);
      
      // Validate data
      const validation = AvailabilityService.validateEventData(newSlot);
      
      if (!validation.isValid) {
        setValidationErrors(validation.errors);
        return;
      }
      
      if (!user.email) {
        setValidationErrors(['User email not found']);
        return;
      }
      
      // Get tutor ID - prioritize uid/id over email
      const tutorId = user?.uid || user?.id || user?.email;
      
      // Create event (cookies are sent automatically)
      const result = await AvailabilityService.createAvailabilityEvent(
        tutorId, // tutorId
        newSlot
      );
      
      alert(` ${result.message || t('tutorAvailability.eventCreated')}`);
      
      // Reset form
      setNewSlot({
        title: "",
        date: "",
        startTime: "",
        endTime: "",
        description: "",
        location: "",
        recurring: false
      });
      
      setShowAddModal(false);
      await loadData();
      
    } catch (error) {
      console.error('Error creating event:', error);
      setValidationErrors([error.message || t('tutorAvailability.errorCreatingEvent')]);
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleSessionClick = (session) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handlePendingSessionClick = (session) => {
    setSelectedPendingSession(session);
    setIsApprovalModalOpen(true);
  };

  const handleNotificationClick = (notification) => {
    if (notification.type === 'pending_session_request') {
      // Find the corresponding pending session
      const pendingSession = pendingSessions.find(s => s.id === notification.sessionId);
      if (pendingSession) {
        handlePendingSessionClick(pendingSession);
      }
    }
  };

  const handleApprovalComplete = () => {
    // Reload data after approval/decline
    loadData();
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

  const getPendingSessionsForDisplay = useMemo(() => {
    const now = new Date();
    return pendingSessions.filter((session) => {
      const start = getSessionStart(session);
      return start && start > now;
    });
  }, [pendingSessions]);

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
      setNewSlot((prev) => ({
        ...prev,
        date: iso,
        title: t("tutorAvailability.defaultSlotTitle"),
      }));
      setShowAddModal(true);
    },
    [t, date]
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
              <button 
                id="add-slot-btn"
                className="add-slot-btn"
                onClick={() => setShowAddModal(true)}
              >
                {t('tutorAvailability.addSlot')}
              </button>
              <button 
                id="edit-slots-btn"
                type="button"
                className="edit-slots-btn"
                onClick={scrollToWeeklyEditor}
              >
                {t('tutorAvailability.editSlots')}
              </button>
              <button 
                id="sync-calendar-btn"
                className="sync-calendar-btn"
                onClick={handleSyncCalendar}
                disabled={syncing || !isConnected}
                title={!isConnected ? t('tutorAvailability.connectCalendarFirst') : t('tutorAvailability.syncCalendarTitle')}
              >
                <RefreshCw size={16} className={syncing ? "spinning" : ""} />
                {syncing ? t('tutorAvailability.syncing') : t('tutorAvailability.syncCalendar')}
              </button>
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
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{t('tutorAvailability.addAvailabilitySlot')}</h3>
            
            {validationErrors.length > 0 && (
              <div className="validation-errors">
                {validationErrors.map((error, index) => (
                  <p key={index} className="error-text">{error}</p>
                ))}
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="slot-title">{t('tutorAvailability.titleLabel')}</label>
              <input
                id="slot-title"
                type="text"
                value={newSlot.title}
                onChange={(e) => setNewSlot({...newSlot, title: e.target.value})}
                placeholder={t('tutorAvailability.titlePlaceholder')}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="slot-date">{t('tutorAvailability.dateLabel')}</label>
              <input
                id="slot-date"
                type="date"
                value={newSlot.date}
                onChange={(e) => setNewSlot({...newSlot, date: e.target.value})}
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="slot-start-time">{t('tutorAvailability.startTimeLabel')}</label>
                <input
                  id="slot-start-time"
                  type="time"
                  value={newSlot.startTime}
                  onChange={(e) => setNewSlot({...newSlot, startTime: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label htmlFor="slot-end-time">{t('tutorAvailability.endTimeLabel')}</label>
                <input
                  id="slot-end-time"
                  type="time"
                  value={newSlot.endTime}
                  onChange={(e) => setNewSlot({...newSlot, endTime: e.target.value})}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="slot-description">{t('tutorAvailability.descriptionLabel')}</label>
              <textarea
                id="slot-description"
                value={newSlot.description}
                onChange={(e) => setNewSlot({...newSlot, description: e.target.value})}
                placeholder={t('tutorAvailability.descriptionPlaceholder')}
              />
            </div>
            
            <div className="modal-actions">
              <button 
                id="cancel-slot-btn"
                className="cancel-btn"
                onClick={() => setShowAddModal(false)}
              >
                {t('tutorAvailability.cancel')}
              </button>
              <button 
                id="save-slot-btn"
                className="save-btn"
                onClick={handleAddSlot}
                disabled={creatingEvent}
              >
                {creatingEvent ? t('tutorAvailability.creating') : t('tutorAvailability.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Details Modal renderizado con Portal */}
      {typeof window !== 'undefined' && isModalOpen && selectedSession && createPortal(
        <TutoringDetailsModal
          session={selectedSession}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedSession(null);
          }}
          onSessionUpdate={loadData}
        />,
        document.body
      )}

      {/* Tutor Approval Modal */}
      {isApprovalModalOpen && selectedPendingSession && (
        <TutorApprovalModal
          session={selectedPendingSession}
          isOpen={isApprovalModalOpen}
          onClose={() => {
            setIsApprovalModalOpen(false);
            setSelectedPendingSession(null);
          }}
          onApprovalComplete={handleApprovalComplete}
        />
      )}
    </div>
  );
}
