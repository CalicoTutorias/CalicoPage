"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../context/SecureAuthContext";
import TutoringHistoryService from "../../services/utils/TutoringHistoryService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import UserService from "../../services/core/UserService";
import "./TutoringHistory.css";
import PageSectionHeader from "../PageSectionHeader/PageSectionHeader";
import PaymentHistory from "../PaymentHistory/PaymentHistory";
import ReviewModal from "../ReviewModal/ReviewModal";
import { useI18n } from "../../../lib/i18n";
import { CalendarDays, CalendarClock, History, CheckCircle2, BookOpen } from "lucide-react";

function mapApiStatusToPaymentDisplay(status) {
  if (status === "Completed") return "paid";
  if (status === "Pending" || status === "Accepted") return "pending";
  return "regular";
}

function classifySessionPast(session, now) {
  const startRaw = session.scheduledDateTime;
  const start =
    startRaw instanceof Date ? startRaw : startRaw ? new Date(startRaw) : null;
  const st = session.status || "";
  const endRaw = session.endDateTime || session.scheduledEnd;
  const end = endRaw instanceof Date ? endRaw : endRaw ? new Date(endRaw) : null;

  return (
    st === "Completed" ||
    st === "Canceled" ||
    st === "Rejected" ||
    (end && end.getTime() < now.getTime()) ||
    (start && start.getTime() < now.getTime() && st !== "Pending" && st !== "Accepted")
  );
}

const TutoringHistory = () => {
  const { user } = useAuth();
  const { t } = useI18n();

  const [sessions, setSessions] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  
  const [showModal, setShowModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

  // Filtros
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [courseFilter, setCourseFilter] = useState("");
  const [availableCourses, setAvailableCourses] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [coursesMap, setCoursesMap] = useState(new Map()); // Mapa de courseId -> nombre del curso
  const [listTab, setListTab] = useState("upcoming");

  // Función para cargar todos los cursos y crear un mapa
  const loadCourses = async () => {
    try {
      const response = await UserService.getAllCourses();
      if (response.success && Array.isArray(response.courses)) {
        const map = new Map();
        response.courses.forEach((course) => {
          // El curso puede ser un objeto o un string
          if (typeof course === 'string') {
            map.set(course, course);
          } else {
            const courseId = course.id || course.codigo || course.nombre || course.name;
            const courseName = course.nombre || course.name || course.codigo || courseId;
            if (courseId) {
              map.set(courseId, courseName);
              // También mapear por código si es diferente
              if (course.codigo && course.codigo !== courseId) {
                map.set(course.codigo, courseName);
              }
            }
          }
        });
        setCoursesMap(map);
      }
    } catch (error) {
      console.warn('Error loading courses for mapping:', error);
    }
  };

  // Función para obtener el nombre del curso
  const getCourseName = useCallback((session) => {
    if (session.course && typeof session.course === "object" && session.course.name) {
      return session.course.name;
    }
    if (typeof session.course === "string") {
      return session.course;
    }
    
    // Si solo existe courseId, buscar el nombre en el mapa
    if (session.courseId) {
      const courseName = coursesMap.get(session.courseId);
      if (courseName) {
        return courseName;
      }
      // Si no se encuentra en el mapa, intentar buscar por diferentes variantes
      for (const [id, name] of coursesMap.entries()) {
        if (id === session.courseId || 
            String(id).toLowerCase() === String(session.courseId).toLowerCase()) {
          return name;
        }
      }
      // Si no se encuentra, devolver el courseId como fallback
      return session.courseId;
    }
    
    // Si no hay ni course ni courseId, devolver un valor por defecto
    return 'Tutoría General';
  }, [coursesMap]);
  
  useEffect(() => {
    if (user?.uid) {
      loadCourses();
      loadTutoringHistory();
    }
  }, [user?.uid]);

  // Actualizar cursos únicos cuando cambie el mapa de cursos
  useEffect(() => {
    if (sessions.length > 0 && coursesMap.size > 0) {
      const uniqueCourses = [...new Set(sessions.map(s => getCourseName(s)))].filter(Boolean);
      setAvailableCourses(uniqueCourses);
    }
  }, [coursesMap, sessions, getCourseName]);

  useEffect(() => {
    applyFilters();
  }, [sessions, dateFilter, courseFilter, getCourseName]);

  const tabFilteredSessions = useMemo(() => {
    const now = new Date();
    return filteredSessions.filter((session) => {
      const isPast = classifySessionPast(session, now);
      if (listTab === "all") return true;
      if (listTab === "past") return isPast;
      return !isPast;
    });
  }, [filteredSessions, listTab]);

  const sessionStats = useMemo(() => {
    const now = new Date();
    const courses = new Set();
    let upcoming = 0;
    let past = 0;
    let completed = 0;

    for (const session of sessions) {
      const name = getCourseName(session);
      if (name && name !== "Tutoría General") courses.add(name);

      const st = String(session.status || "");
      if (st === "Completed") completed += 1;

      if (classifySessionPast(session, now)) past += 1;
      else upcoming += 1;
    }

    return {
      total: sessions.length,
      upcoming,
      past,
      completed,
      coursesCount: courses.size,
    };
  }, [sessions, getCourseName]);

  const loadTutoringHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      let normalized = [];

      try {
        const apiSessions = await TutoringSessionService.getStudentSessions();
        if (Array.isArray(apiSessions) && apiSessions.length > 0) {
          normalized = apiSessions.map((s) => ({
            ...s,
            scheduledDateTime: s.startTimestamp ? new Date(s.startTimestamp) : null,
            endDateTime: s.endTimestamp ? new Date(s.endTimestamp) : null,
            tutorName: s.tutor?.name || s.tutor?.email || "",
            paymentStatus: mapApiStatusToPaymentDisplay(s.status),
          }));
        }
      } catch {
        /* fallback below */
      }

      if (normalized.length === 0 && user?.uid) {
        const history = await TutoringHistoryService.getStudentTutoringHistory(user.uid);
        const rawSessions = Array.isArray(history?.sessions) ? history.sessions : [];
        normalized = rawSessions.map((s) => ({
          ...s,
          scheduledDateTime:
            s.scheduledDateTime?.toDate?.() ||
            (s.scheduledDateTime ? new Date(s.scheduledDateTime) : null),
          endDateTime:
            s.endDateTime?.toDate?.() ||
            (s.endDateTime ? new Date(s.endDateTime) : null),
          paymentStatus: s.paymentStatus || mapApiStatusToPaymentDisplay(s.status),
        }));
      }

      setSessions(normalized);
      setFilteredSessions(normalized);
      setPaymentsCount(normalized.filter((s) => s.paymentId).length || 0);
    } catch (err) {
      console.error(" Error cargando historial:", err);
      setError(t("studentHistory.errors.loading"));
    } finally {
      setLoading(false);
    }
  };


  const applyFilters = () => {
    let filtered = [...sessions];

    if (dateFilter.startDate || dateFilter.endDate) {
      const startDate = dateFilter.startDate
        ? new Date(dateFilter.startDate)
        : null;
      const endDate = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
      filtered = TutoringHistoryService.filterByDate(filtered, startDate, endDate);
    }

    if (courseFilter.trim() !== "") {
      filtered = filtered.filter((session) => {
        const courseName = getCourseName(session);
        return courseName?.toLowerCase().includes(courseFilter.toLowerCase());
      });
    }

    setFilteredSessions(filtered);
  };

  const clearFilters = () => {
    setDateFilter({ startDate: "", endDate: "" });
    setCourseFilter("");
    setShowSuggestions(false);
    setFilteredSessions(sessions);
  };

  const hasActiveFilters = () =>
    dateFilter.startDate ||
    dateFilter.endDate ||
    (courseFilter && courseFilter.trim() !== "");

  const getCourseSuggestions = () => {
    if (!courseFilter.trim()) return [];
    return availableCourses
      .filter((s) => s.toLowerCase().includes(courseFilter.toLowerCase()))
      .slice(0, 5);
  };

  const handleCourseInputChange = (value) => {
    setCourseFilter(value);
    setShowSuggestions(value.trim().length > 0);
  };

  
  const openModal = (session) => {
    setSelectedSession(session);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedSession(null);
  };


  if (loading) {
    return (
      <div className="tutoring-history-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>{t("studentHistory.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tutoring-history-container">
        <div className="error-state">
          <div className="error-icon"></div>
          <h3>{t("studentHistory.errors.title")}</h3>
          <p>{error}</p>
          <button onClick={loadTutoringHistory} className="retry-btn">
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  
  return (
    <div className="tutoring-history-container">
      <div className="tutoring-history-shell">
        <PageSectionHeader
          title={t("studentHistory.title")}
          subtitle={t("studentHistory.subtitle")}
        />
      </div>

      <div className="history-stats-wrap">
        <div className="history-stats-header">
          <h2 className="history-stats-title">{t("studentHistory.stats.title")}</h2>
        </div>
        <div className="history-stats" role="region" aria-label={t("studentHistory.stats.title")}>
          <div className="history-stat-card">
            <div className="history-stat-card__icon" aria-hidden>
              <CalendarDays size={22} strokeWidth={2} />
            </div>
            <div className="history-stat-card__body">
              <span className="history-stat-card__value">{sessionStats.total}</span>
              <span className="history-stat-card__label">{t("studentHistory.stats.total")}</span>
            </div>
          </div>
          <div className="history-stat-card">
            <div className="history-stat-card__icon" aria-hidden>
              <CalendarClock size={22} strokeWidth={2} />
            </div>
            <div className="history-stat-card__body">
              <span className="history-stat-card__value">{sessionStats.upcoming}</span>
              <span className="history-stat-card__label">{t("studentHistory.stats.upcoming")}</span>
            </div>
          </div>
          <div className="history-stat-card">
            <div className="history-stat-card__icon" aria-hidden>
              <History size={22} strokeWidth={2} />
            </div>
            <div className="history-stat-card__body">
              <span className="history-stat-card__value">{sessionStats.past}</span>
              <span className="history-stat-card__label">{t("studentHistory.stats.past")}</span>
            </div>
          </div>
          <div className="history-stat-card">
            <div className="history-stat-card__icon" aria-hidden>
              <CheckCircle2 size={22} strokeWidth={2} />
            </div>
            <div className="history-stat-card__body">
              <span className="history-stat-card__value">{sessionStats.completed}</span>
              <span className="history-stat-card__label">{t("studentHistory.stats.completed")}</span>
            </div>
          </div>
          <div className="history-stat-card">
            <div className="history-stat-card__icon" aria-hidden>
              <BookOpen size={22} strokeWidth={2} />
            </div>
            <div className="history-stat-card__body">
              <span className="history-stat-card__value">{sessionStats.coursesCount}</span>
              <span className="history-stat-card__label">{t("studentHistory.stats.courses")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tutoring-history-content">
        {/* Filtros */}
        <div className="filters-sidebar">
          <h3 className="filters-title">{t("studentHistory.filters.title")}</h3>

          {/* Buscar materia */}
          <div className="filter-group">
            <label className="filter-label">{t("studentHistory.filters.searchCourse")}</label>
            <div className="course-input-container">
              <input
                type="text"
                value={courseFilter}
                onChange={(e) => handleCourseInputChange(e.target.value)}
                onFocus={() =>
                  setShowSuggestions(courseFilter.trim().length > 0)
                }
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="course-input"
                placeholder={t("studentHistory.filters.searchCourse") + "..."}
              />
              {showSuggestions && getCourseSuggestions().length > 0 && (
                <div className="suggestions-dropdown">
                  {getCourseSuggestions().map((s, i) => (
                    <div
                      key={i}
                      className="suggestion-item"
                      onClick={() => {
                        setCourseFilter(s);
                        setShowSuggestions(false);
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {}
          <div className="filter-group">
            <label className="filter-label">{t("studentHistory.filters.selectDate")}</label>
            <div className="date-inputs">
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="date-input"
              />
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="date-input"
              />
            </div>
          </div>

          <button onClick={clearFilters} className="apply-filters-btn">
            {t("common.applyFilters")}
          </button>
        </div>

        {/* Resultados */}
        <div className="results-section">
          <h2 className="section-title">{t("studentHistory.table.title")}</h2>

          {tabFilteredSessions.length === 0 ? (
            <div className="empty-results">
              <p>{t("studentHistory.table.empty")}</p>
              {hasActiveFilters() && (
                <button onClick={clearFilters} className="clear-filters-link">
                  {t("common.clearFilters")}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="results-table">
                <div className="table-header">
                  <div className="table-cell">{t("studentHistory.table.date")}</div>
                  <div className="table-cell">{t("studentHistory.table.course")}</div>
                  <div className="table-cell">{t("studentHistory.table.tutor")}</div>
                  <div className="table-cell">{t("studentHistory.table.performance")}</div>
                </div>

                {tabFilteredSessions.map((session) => {
                  const now = new Date();
                  const endDateRaw =
                    session.endDateTime ||
                    session.scheduledEnd ||
                    session.scheduledDateTime;
                  const endDate =
                    endDateRaw instanceof Date
                      ? endDateRaw
                      : endDateRaw
                      ? new Date(endDateRaw)
                      : null;
                  const isPast = endDate ? endDate.getTime() < now.getTime() : false;

                  const statusKey = session.status ? `studentHistory.status.${session.status}` : "";
                  const statusLabel =
                    session.status && t(statusKey) !== statusKey
                      ? t(statusKey)
                      : session.paymentStatus === "paid"
                      ? t("studentHistory.table.performanceValues.excellent")
                      : session.paymentStatus === "pending"
                      ? t("studentHistory.table.performanceValues.pending")
                      : t("studentHistory.table.performanceValues.regular");

                  return (
                    <div
                      key={session.id}
                      className={`table-row ${isPast ? "clickable" : ""}`}
                      onClick={() => isPast && openModal(session)}
                      title={isPast ? t("studentHistory.openDetails") : ""}
                    >
                      <div className="table-cell" data-label={t("studentHistory.table.date")}>
                        {TutoringHistoryService.formatDate(session.scheduledDateTime)}
                      </div>
                      <div className="table-cell" data-label={t("studentHistory.table.course")}>
                        <span className="course-tag">{getCourseName(session)}</span>
                      </div>
                      <div className="table-cell" data-label={t("studentHistory.table.tutor")}>
                        {session.tutorName}
                      </div>
                      <div className="table-cell" data-label={t("studentHistory.table.performance")}>
                        <span
                          className={`performance-badge ${
                            session.paymentStatus === "paid"
                              ? "excellent"
                              : session.paymentStatus === "pending"
                              ? "pending"
                              : "regular"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="history-cards" aria-hidden={false}>
                {tabFilteredSessions.map((session) => {
                  const now = new Date();
                  const endDateRaw =
                    session.endDateTime ||
                    session.scheduledEnd ||
                    session.scheduledDateTime;
                  const endDate =
                    endDateRaw instanceof Date
                      ? endDateRaw
                      : endDateRaw
                      ? new Date(endDateRaw)
                      : null;
                  const isPast = endDate ? endDate.getTime() < now.getTime() : false;
                  const statusKey = session.status ? `studentHistory.status.${session.status}` : "";
                  const statusLabel =
                    session.status && t(statusKey) !== statusKey
                      ? t(statusKey)
                      : session.paymentStatus === "paid"
                      ? t("studentHistory.table.performanceValues.excellent")
                      : session.paymentStatus === "pending"
                      ? t("studentHistory.table.performanceValues.pending")
                      : t("studentHistory.table.performanceValues.regular");

                  return (
                    <button
                      key={`card-${session.id}`}
                      type="button"
                      className={`history-card ${isPast ? "history-card--past" : "history-card--future"}`}
                      onClick={() => isPast && openModal(session)}
                      disabled={!isPast}
                    >
                      <div className="history-card__top">
                        <span className="history-card__course">{getCourseName(session)}</span>
                        <span className={`history-card__badge history-card__badge--${session.paymentStatus === "paid" ? "ok" : session.paymentStatus === "pending" ? "pend" : "reg"}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="history-card__meta">
                        {TutoringHistoryService.formatDate(session.scheduledDateTime)}
                      </div>
                      <div className="history-card__tutor">{session.tutorName}</div>
                      {isPast && (
                        <span className="history-card__hint">{t("studentHistory.openDetails")}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ marginTop: 24 }}>
            <PaymentHistory
              courseQuery={courseFilter}
              startDate={dateFilter.startDate}
              endDate={dateFilter.endDate}
              onCountChange={setPaymentsCount}
            />
          </div>
        </div>
      </div>

      {}
      {showModal && selectedSession && (
        <ReviewModal session={selectedSession} onClose={closeModal} />
      )}
    </div>
  );
};

export default TutoringHistory;
