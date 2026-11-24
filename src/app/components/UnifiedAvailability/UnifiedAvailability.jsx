"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Calendar as CalendarIcon, Bell, Clock, RefreshCw, Repeat, CalendarDays, CheckCircle, HelpCircle, X, ChevronDown, CalendarCheck, CalendarX, ShieldCheck, Info, TriangleAlert } from "lucide-react";
import "./UnifiedAvailability.css";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import {
  AVAILABILITY_SOURCE_CALENDAR_SYNC,
  AVAILABILITY_SOURCE_MANUAL,
  CALENDAR_SYNC_MODE_BUSY,
  getBlockSource,
} from "../../../lib/availability/bookable-blocks";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import CalendarPickerModal from "../CalendarPickerModal/CalendarPickerModal";
import SessionDetailView from "../SessionDetailView/SessionDetailView";
import TutorWeekTimeGrid from "../TutorWeekTimeGrid/TutorWeekTimeGrid";
import TimeSelect from "../TimeSelect/TimeSelect";
import PageSectionHeader from "../PageSectionHeader/PageSectionHeader";
import { Button } from "../../../components/ui/button";
import CalendarService from "../../services/integrations/CalendarService";
import SessionPreferencesCard from "../SessionPreferencesCard/SessionPreferencesCard";

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
    daysOfWeek: [new Date().getDay()], // used when recurring=true: one block per day
    date:       "",                  // used when recurring=false (YYYY-MM-DD)
    startTime:  "",
    endTime:    "",
  });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calendarConfig, setCalendarConfig] = useState({ ids: [], name: null, mode: 'available' });
  const [calendarHelpOpen, setCalendarHelpOpen] = useState(false);
  const [blockColors, setBlockColors] = useState({ recurring: null, onetime: null });

  useEffect(() => {
    setBlockColors({
      recurring: localStorage.getItem('calico_block_recurring_color') || null,
      onetime:   localStorage.getItem('calico_block_onetime_color') || null,
    });
    const handleColorUpdate = () => {
      setBlockColors({
        recurring: localStorage.getItem('calico_block_recurring_color') || null,
        onetime:   localStorage.getItem('calico_block_onetime_color') || null,
      });
    };
    window.addEventListener('calico-color-update', handleColorUpdate);
    return () => window.removeEventListener('calico-color-update', handleColorUpdate);
  }, []);
  const [selectedDaySlots, setSelectedDaySlots] = useState([]);
  const [weeklyRawBlocks, setWeeklyRawBlocks] = useState([]);
  const [hintDismissed, setHintDismissed] = useState(false);

  const tutorKey = user?.uid || user?.id || user?.email || null;

  useEffect(() => {
    setHintDismissed(localStorage.getItem("calico_gcal_hint") === "1");
  }, []);

  const dismissHint = useCallback(() => {
    localStorage.setItem("calico_gcal_hint", "1");
    setHintDismissed(true);
  }, []);

  const dayOptions = useMemo(() => {
    const localeStr = locale === "en" ? "en-US" : "es-ES";
    return [0, 1, 2, 3, 4, 5, 6].map((dow) => {
      const d = new Date(2024, 0, 7 + dow);
      return { value: dow, label: d.toLocaleDateString(localeStr, { weekday: "long" }) };
    });
  }, [locale]);

  const loadData = useCallback(async () => {
    if (!tutorKey) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // `getAvailabilityWithFallback` ya consulta /availabilities/me y devuelve
      // los bloques crudos en `blocks`; pedirlos aparte duplicaba la llamada.
      const [availabilityResult, schedule] = await Promise.all([
        AvailabilityService.getAvailabilityWithFallback(tutorKey),
        CalendarService.getSchedule(),
      ]);
      const rawBlocks = availabilityResult.blocks;

      if (schedule) {
        // La base solo guarda el ID del calendario (un hash técnico o el
        // correo del tutor); el nombre legible se conoce al elegirlo en el
        // modal o al sincronizar, nunca se muestra el ID en la UI.
        const ids = schedule.calendarSyncIds?.length
          ? schedule.calendarSyncIds
          : schedule.calendarSyncId ? [schedule.calendarSyncId] : [];
        setCalendarConfig((prev) => ({
          ids,
          name: prev.ids.join('\n') === ids.join('\n') ? prev.name : null,
          mode: schedule.calendarSyncMode ?? 'available',
        }));
      }

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

  // El handler lee el calendario seleccionado desde un ref: si estuviera en las
  // deps del efecto, el propio `loadData` (que fija `calendarConfig`) volvía a
  // disparar el efecto y toda la carga se hacía dos veces por visita.
  const hasSelectedCalendar = calendarConfig.ids.length > 0;
  const calendarConfigIdRef = useRef(hasSelectedCalendar);
  useEffect(() => {
    calendarConfigIdRef.current = hasSelectedCalendar;
  }, [hasSelectedCalendar]);

  useEffect(() => {
    if (!tutorKey) {
      setLoading(false);
      return;
    }
    loadData();

    const handleCalendarUpdate = async (e) => {
      await loadData();
      // After a fresh OAuth connect, open picker if no calendar has been selected yet
      if (e?.detail?.connected && !calendarConfigIdRef.current) {
        setPickerOpen(true);
      }
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

      // En modo «eventos = ocupado» los bloques manuales son solo la base y no
      // se publican: la lista del día muestra lo que de verdad ven los
      // estudiantes, es decir, las franjas calculadas al sincronizar.
      const busyMode = calendarConfig.mode === CALENDAR_SYNC_MODE_BUSY;
      const daySlots = availabilitySlots.filter(
        (slot) =>
          slot.date === selectedDateStr &&
          (!busyMode || getBlockSource(slot) === AVAILABILITY_SOURCE_CALENDAR_SYNC),
      );

      daySlots.sort((a, b) => {
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        return timeA.localeCompare(timeB);
      });

      setSelectedDaySlots(daySlots);
    },
    [availabilitySlots, calendarConfig.mode]
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
      label: "", recurring: true, daysOfWeek: [new Date().getDay()], date: "", startTime: "", endTime: "",
    });

  const toggleNewSlotDay = (dow) =>
    setNewSlot((s) => ({
      ...s,
      daysOfWeek: s.daysOfWeek.includes(dow) ? s.daysOfWeek.filter((d) => d !== dow) : [...s.daysOfWeek, dow],
    }));

  const handleAddSlot = async () => {
    const errors = [];
    if (newSlot.recurring && newSlot.daysOfWeek.length === 0) errors.push(t('tutorAvailability.validationDayRequired'));
    if (!newSlot.startTime) errors.push(t('tutorAvailability.validationStartRequired'));
    if (!newSlot.endTime)   errors.push(t('tutorAvailability.validationEndRequired'));
    if (!newSlot.recurring && !newSlot.date) errors.push(t('tutorAvailability.validationSpecificDateRequired'));
    if (newSlot.startTime && newSlot.endTime && newSlot.startTime >= newSlot.endTime)
      errors.push(t('tutorAvailability.validationEndAfterStart'));
    if (!newSlot.recurring && newSlot.date) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(`${newSlot.date}T12:00:00`) < today)
        errors.push(t('tutorAvailability.validationNoPast'));
    }
    if (errors.length) { setValidationErrors(errors); return; }

    try {
      setCreatingEvent(true);
      setValidationErrors([]);

      const base = {
        recurring:  newSlot.recurring,
        startTime:  newSlot.startTime,
        endTime:    newSlot.endTime,
        label:      newSlot.label?.trim() || undefined,
      };
      const blocks = newSlot.recurring
        ? newSlot.daysOfWeek.map((dayOfWeek) => ({ ...base, dayOfWeek }))
        : [{ ...base, specificDate: newSlot.date }];

      const createdDays = [];
      for (const blockData of blocks) {
        const result = await AvailabilityService.createAvailability(blockData);
        if (!result.success) {
          // Days already saved leave the selection so a retry does not duplicate them.
          setNewSlot((s) => ({ ...s, daysOfWeek: s.daysOfWeek.filter((d) => !createdDays.includes(d)) }));
          setValidationErrors([result.error || t('tutorAvailability.errorCreatingEvent')]);
          if (createdDays.length) await handleBlocksChanged();
          return;
        }
        createdDays.push(blockData.dayOfWeek);
      }

      resetNewSlot();
      setShowAddModal(false);
      await handleBlocksChanged();
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
      setSyncResult({ type: 'error', message: t('tutorAvailability.mustBeConnectedToSync') });
      return false;
    }

    let ok = false;
    try {
      setSyncing(true);
      setSyncResult(null);

      const result = await AvailabilityService.intelligentSync(
        tutorId,
        'Disponibilidad',
        30
      );

      if (!result.success) {
        throw new Error(result.error || result.message || t('tutorAvailability.syncError'));
      }
      ok = true;

      if (result.calendarName) {
        setCalendarConfig((prev) => ({ ...prev, name: result.calendarName }));
      }

      if (result.mode === CALENDAR_SYNC_MODE_BUSY && result.warning === 'NO_BASE_BLOCKS') {
        // Nada que restar: sin bloques base el modo «ocupado» no produce disponibilidad.
        setSyncResult({ type: 'warning', message: t('tutorAvailability.syncBusyNoBase') });
      } else if (result.mode === CALENDAR_SYNC_MODE_BUSY) {
        setSyncResult({
          type: 'success',
          message: t('tutorAvailability.syncBusySuccess', {
            total: result.total || 0,
            base: result.baseBlocks || 0,
          }),
        });
      } else {
        setSyncResult({
          type: 'success',
          message: `${t('tutorAvailability.syncSuccess')} · ${t('tutorAvailability.newEvents')}: ${result.synced || 0} · ${t('tutorAvailability.syncRemovedLabel')}: ${result.removed || 0} · ${t('tutorAvailability.syncUnchangedLabel')}: ${result.skipped || 0}`,
        });
      }
    } catch (error) {
      console.error('Error syncing calendar:', error);
      setSyncResult({ type: 'error', message: `${t('tutorAvailability.syncFailed')}: ${error.message}` });
    } finally {
      setSyncing(false);
    }

    // Recargar también si falló: una sincronización fallida no debe ocultar
    // los cambios de bloques hechos justo antes.
    await loadData();
    return ok;
  };

  /**
   * Tras crear, editar o borrar un bloque. En modo «eventos = ocupado» los
   * bloques manuales son solo la base: hay que volver a sincronizar para
   * recalcular la disponibilidad real que ven los estudiantes.
   */
  const handleBlocksChanged = async () => {
    if (calendarConfig.mode === CALENDAR_SYNC_MODE_BUSY && isConnected) {
      await handleSyncCalendar(); // recarga al terminar
      return;
    }
    await loadData();
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
        hour: '2-digit', hourCycle: 'h23', 
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
      setNewSlot((prev) => ({ ...prev, daysOfWeek: [dayOfWeek], date: iso, label: "" }));
      setValidationErrors([]);
      setShowAddModal(true);
    },
    [date]
  );

  /** «Más opciones» del borrador de la cuadrícula: abre «Agregar horario» con sus datos. */
  const handleCreateRange = useCallback(
    ({ daysOfWeek, recurring = true, startTime, endTime, label = "" }) => {
      handleAddForDay(daysOfWeek[0]);
      setNewSlot((prev) => ({ ...prev, daysOfWeek, recurring, startTime, endTime, label }));
    },
    [handleAddForDay]
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

  const colorVars = {};
  if (blockColors.recurring) colorVars['--calico-block-recurring'] = blockColors.recurring;
  if (blockColors.onetime)   colorVars['--calico-block-onetime']   = blockColors.onetime;

  // Modo «eventos = ocupado»: los bloques manuales son la base (no se publican
  // solos) y las franjas sincronizadas son la disponibilidad real. Estos avisos
  // guían al tutor cuando falta alguno de los dos ingredientes.
  const isBusyMode = calendarConfig.mode === CALENDAR_SYNC_MODE_BUSY;
  const baseBlockCount = weeklyRawBlocks.filter(
    (b) => getBlockSource(b) === AVAILABILITY_SOURCE_MANUAL,
  ).length;
  const syncedBlockCount = weeklyRawBlocks.length - baseBlockCount;
  let busyModeHintKey = null;
  if (isBusyMode) {
    if (!isConnected && baseBlockCount > 0) {
      busyModeHintKey = 'tutorAvailability.busyModeReconnectHint';
    } else if (isConnected && baseBlockCount === 0) {
      busyModeHintKey = 'tutorAvailability.busyModeNoBaseHint';
    } else if (isConnected && syncedBlockCount === 0) {
      busyModeHintKey = 'tutorAvailability.busyModeNeedsSyncHint';
    }
  }

  return (
    <div className="unified-availability unified-availability--page" style={colorVars}>
      <PageSectionHeader
        title={t("tutorAvailability.title")}
        subtitle={t("tutorAvailability.pageHint")}
        actions={
          <div className="cal-header-actions">
            <GoogleCalendarButton />
            
          </div>
        }
      />

      {/* Calendar setup tip — dismissable, only shown when not connected */}
      {!loading && !isConnected && !hintDismissed && (
        <div className="calendar-setup-tip" role="note">
          <div className="calendar-setup-tip__icon">
            <CalendarDays size={18} aria-hidden="true" />
          </div>
          <div className="calendar-setup-tip__body">
            <p className="calendar-setup-tip__title">{t("tutorAvailability.calendarWorkflowTitle")}</p>
            <p className="calendar-setup-tip__desc">{t("tutorAvailability.calendarWorkflowDesc")}</p>
            <ol className="calendar-setup-tip__steps">
              <li><span className="step-dot">1</span>{t("tutorAvailability.calendarWorkflowStep1")}</li>
              <li><span className="step-dot">2</span>{t("tutorAvailability.calendarWorkflowStep2")}</li>
              <li><span className="step-dot">3</span>{t("tutorAvailability.calendarWorkflowStep3")}</li>
              <li><span className="step-dot">4</span>{t("tutorAvailability.calendarWorkflowStep4")}</li>

            </ol>
            <p className="calendar-setup-tip__alt">{t("tutorAvailability.calendarWorkflowAlt")}</p>
          </div>
          <button
            type="button"
            className="calendar-setup-tip__dismiss"
            onClick={dismissHint}
            aria-label={t("tutorAvailability.calendarHintDismiss")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {!loading && !isConnected && hintDismissed && (
        <button
          type="button"
          className="calendar-hint-restore"
          onClick={() => setHintDismissed(false)}
        >
          <HelpCircle size={13} aria-hidden="true" />
          {t("tutorAvailability.calendarHintRestore")}
        </button>
      )}

      {!loading && isConnected && !isBusyMode && weeklyRawBlocks.length === 0 && (
        <div className="calendar-connected-hint" role="status">
          <CheckCircle size={16} aria-hidden="true" />
          <p>{t("tutorAvailability.calendarConnectedNoBlocks")}</p>
        </div>
      )}

      {!loading && busyModeHintKey && (
        <div className="calendar-connected-hint calendar-connected-hint--warning" role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <p>{t(busyModeHintKey, { count: baseBlockCount })}</p>
          {busyModeHintKey === 'tutorAvailability.busyModeNoBaseHint' && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowAddModal(true)}>
              {t('tutorAvailability.addSlot')}
            </Button>
          )}
        </div>
      )}

      {/* Calendar config strip — shown when OAuth is connected */}
      {!loading && isConnected && (
        <div className="cal-config-strip">
          <div className="cal-config-strip__info">
            <CalendarDays size={15} aria-hidden="true" />
            <span>
              {!hasSelectedCalendar
                ? t('tutorAvailability.calendarConfigNotSelected')
                : calendarConfig.name
                  ? t('tutorAvailability.calendarConfigSelected', { name: calendarConfig.name })
                  : t('tutorAvailability.calendarConfigSelectedUnnamed')}
            </span>
            {hasSelectedCalendar && (
              <span className="cal-config-strip__mode-badge">
                {calendarConfig.mode === 'busy'
                  ? t('tutorAvailability.calendarModeBusy')
                  : t('tutorAvailability.calendarModeAvailable')}
              </span>
            )}
          </div>
          <button
            type="button"
            className="cal-config-strip__change"
            onClick={() => setPickerOpen(true)}
          >
            {hasSelectedCalendar ? t('tutorAvailability.calendarConfigChange') : t('tutorAvailability.calendarConfigSetup')}
          </button>
        </div>
      )}

      {/* Calendar picker modal */}
      <CalendarPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentIds={calendarConfig.ids}
        currentMode={calendarConfig.mode}
        onSaved={({ calendarIds, calendarName, mode }) => {
          setCalendarConfig({ ids: calendarIds, name: calendarName, mode });
          // Aplicar la configuración de inmediato: sin esto el cambio de
          // calendario o de modo no se notaba hasta pulsar «Sincronizar».
          if (isConnected) handleSyncCalendar();
        }}
      />

      {/* Collapsible calendar help */}
      <div className="cal-help">
        <button
          type="button"
          className={`cal-help__toggle${calendarHelpOpen ? ' cal-help__toggle--open' : ''}`}
          onClick={() => setCalendarHelpOpen((v) => !v)}
          aria-expanded={calendarHelpOpen}
        >
          <HelpCircle size={14} aria-hidden="true" />
          <span>{t('calendarHelp.triggerLabel')}</span>
          <ChevronDown size={14} className="cal-help__chevron" aria-hidden="true" />
        </button>

        {calendarHelpOpen && (
          <div className="cal-help__panel" role="region" aria-label={t('calendarHelp.triggerLabel')}>
            <div className="cal-help__cards">
              <div className="cal-help__card">
                <span className="cal-help__card-icon cal-help__card-icon--blue">
                  <RefreshCw size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="cal-help__card-title">{t('calendarHelp.whatIsSync')}</p>
                  <p className="cal-help__card-body">{t('calendarHelp.whatIsSyncDesc')}</p>
                </div>
              </div>

              <div className="cal-help__card">
                <span className="cal-help__card-icon cal-help__card-icon--green">
                  <CalendarCheck size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="cal-help__card-title">{t('calendarHelp.modeAvailableTitle')}</p>
                  <p className="cal-help__card-body">{t('calendarHelp.modeAvailableDesc')}</p>
                </div>
              </div>

              <div className="cal-help__card">
                <span className="cal-help__card-icon cal-help__card-icon--amber">
                  <CalendarX size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="cal-help__card-title">{t('calendarHelp.modeBusyTitle')}</p>
                  <p className="cal-help__card-body">{t('calendarHelp.modeBusyDesc')}</p>
                </div>
              </div>

              <div className="cal-help__card">
                <span className="cal-help__card-icon cal-help__card-icon--purple">
                  <Info size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="cal-help__card-title">{t('calendarHelp.noCalendarTitle')}</p>
                  <p className="cal-help__card-body">{t('calendarHelp.noCalendarDesc')}</p>
                </div>
              </div>

              <div className="cal-help__card">
                <span className="cal-help__card-icon cal-help__card-icon--teal">
                  <ShieldCheck size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="cal-help__card-title">{t('calendarHelp.privacyTitle')}</p>
                  <p className="cal-help__card-body">{t('calendarHelp.privacyDesc')}</p>
                </div>
              </div>

              <div className="cal-help__card">
                <span className="cal-help__card-icon cal-help__card-icon--slate">
                  <Clock size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="cal-help__card-title">{t('calendarHelp.whenUpdatesTitle')}</p>
                  <p className="cal-help__card-body">{t('calendarHelp.whenUpdatesDesc')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* How students may book: longest session and max hours per day. */}
      <SessionPreferencesCard className="mb-4" />

      <div className="unified-content">
        <div className="calendar-section">
          <div className="calendar-section__column-card">
            <header className="calendar-section__intro">
              <h2 className="calendar-section__title">{t('tutorAvailability.calendarColumnTitle')}</h2>
              <p className="calendar-section__hint">
                {t(isBusyMode ? 'tutorAvailability.calendarColumnHintBusy' : 'tutorAvailability.calendarColumnHint')}
              </p>
            </header>

            <TutorWeekTimeGrid
              anchorDate={date}
              blocks={weeklyRawBlocks}
              datedSlots={availabilitySlots}
              locale={locale}
              t={t}
              onReload={handleBlocksChanged}
              onAddForDay={handleAddForDay}
              onCreateRange={handleCreateRange}
              onSelectDay={handleGridSelectDay}
              syncMode={calendarConfig.mode}
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

            {syncResult && (
              <div
                className={`sync-result-notice sync-result-notice--${syncResult.type}`}
                role="status"
              >
                <small>{syncResult.message}</small>
              </div>
            )}

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
                  <small>{t(isBusyMode ? 'tutorAvailability.busyModeListHint' : 'tutorAvailability.useAddSlotHint')}</small>
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
              <span className="form-label">{t('tutorAvailability.recurringTypeLabel')}</span>
              <div className="recurring-toggle">
                <button
                  type="button"
                  className={`recurring-toggle__option${newSlot.recurring ? ' recurring-toggle__option--active' : ''}`}
                  onClick={() => setNewSlot((s) => ({ ...s, recurring: true }))}
                >
                  <Repeat size={14} />
                  {t('tutorAvailability.recurringOption')}
                </button>
                <button
                  type="button"
                  className={`recurring-toggle__option${!newSlot.recurring ? ' recurring-toggle__option--active recurring-toggle__option--once' : ''}`}
                  onClick={() => setNewSlot((s) => ({ ...s, recurring: false }))}
                >
                  <CalendarDays size={14} />
                  {t('tutorAvailability.onceOption')}
                </button>
              </div>
            </div>

            {/* Day picker — condicional según tipo */}
            {newSlot.recurring ? (
              <div className="form-group">
                <span className="form-label">{t('tutorAvailability.daysOfWeekLabel')}</span>
                <div className="day-chips" role="group" aria-label={t('tutorAvailability.daysOfWeekLabel')}>
                  {dayOptions.map((d) => {
                    const selected = newSlot.daysOfWeek.includes(d.value);
                    return (
                      <Button
                        key={d.value}
                        type="button"
                        size="sm"
                        variant={selected ? "success" : "outline"}
                        aria-pressed={selected}
                        onClick={() => toggleNewSlotDay(d.value)}
                      >
                        {d.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="slot-date">{t('tutorAvailability.specificDateLabel')}</label>
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
                <TimeSelect
                  id="slot-start-time"
                  value={newSlot.startTime}
                  onChange={(v) => setNewSlot((s) => ({ ...s, startTime: v }))}
                  minuteLabel={`${t('tutorAvailability.startTimeLabel')} · ${t('tutorAvailability.timeMinuteAria')}`}
                />
              </div>
              <div className="form-group">
                <label htmlFor="slot-end-time">{t('tutorAvailability.endTimeLabel')}</label>
                <TimeSelect
                  id="slot-end-time"
                  value={newSlot.endTime}
                  onChange={(v) => setNewSlot((s) => ({ ...s, endTime: v }))}
                  minuteLabel={`${t('tutorAvailability.endTimeLabel')} · ${t('tutorAvailability.timeMinuteAria')}`}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="slot-label">
                {t('tutorAvailability.blockLabelLabel')}{' '}
                <span className="form-label--optional">{t('tutorAvailability.blockLabelOptional')}</span>
              </label>
              <input
                id="slot-label"
                type="text"
                maxLength={160}
                value={newSlot.label}
                onChange={(e) => setNewSlot((s) => ({ ...s, label: e.target.value }))}
                placeholder={t('tutorAvailability.blockLabelPlaceholder')}
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
