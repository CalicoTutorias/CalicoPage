"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/SecureAuthContext";
import TutoringHistoryService from "../../services/utils/TutoringHistoryService";
import UserService from "../../services/core/UserService";
import "./TutoringHistory.css";
import PaymentHistory from "../PaymentHistory/PaymentHistory";
import ReviewModal from "../ReviewModal/ReviewModal"; 
import { useI18n } from "../../../lib/i18n";

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
    // Si existe el atributo course, usarlo directamente
    if (session.course) {
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

  const loadTutoringHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("User", user)
      console.log("📚 Cargando historial para:", user.uid);
      let history = await TutoringHistoryService.getStudentTutoringHistory(user.uid);
      console.log("History", history)

      const rawSessions = Array.isArray(history?.sessions) ? history.sessions : [];

      // Normalizar fechas
      const normalized = rawSessions.map((s) => ({
        ...s,
        scheduledDateTime:
          s.scheduledDateTime?.toDate?.() ||
          (s.scheduledDateTime ? new Date(s.scheduledDateTime) : null),
        endDateTime:
          s.endDateTime?.toDate?.() ||
          (s.endDateTime ? new Date(s.endDateTime) : null),
      }));

      setSessions(normalized);
      setFilteredSessions(normalized);
      // Los cursos únicos se actualizarán automáticamente cuando el mapa de cursos esté listo
      setPaymentsCount(normalized.filter((s) => s.paymentId).length || 0);

      console.log(" Historial cargado:", normalized.length, "tutorías");
    } catch (err) {
      console.error("❌ Error cargando historial:", err);
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
          <div className="error-icon">⚠️</div>
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
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <h1 className="page-title">{t("studentHistory.title")}</h1>
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

          {filteredSessions.length === 0 && paymentsCount === 0 ? (
            <div className="empty-results">
              <p>{t("studentHistory.table.empty")}</p>
              {hasActiveFilters() && (
                <button onClick={clearFilters} className="clear-filters-link">
                  {t("common.clearFilters")}
                </button>
              )}
            </div>
          ) : (
            <div className="results-table">
              <div className="table-header">
                <div className="table-cell">{t("studentHistory.table.date")}</div>
                <div className="table-cell">{t("studentHistory.table.course")}</div>
                <div className="table-cell">{t("studentHistory.table.tutor")}</div>
                <div className="table-cell">{t("studentHistory.table.performance")}</div>
              </div>

              {filteredSessions.map((session) => {
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

                return (
                  <div
                    key={session.id}
                    className={`table-row ${isPast ? "clickable" : ""}`}
                    onClick={() => isPast && openModal(session)}
                    title={isPast ? "Ver detalles" : ""}
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
                        {session.paymentStatus === "paid"
                          ? t("studentHistory.table.performanceValues.excellent")
                          : session.paymentStatus === "pending"
                          ? t("studentHistory.table.performanceValues.pending")
                          : t("studentHistory.table.performanceValues.regular")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
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
