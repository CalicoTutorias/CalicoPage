"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { TutorSearchService } from "../../services/utils/TutorSearchService";
import CalendlyStyleScheduler from "../CalendlyStyleScheduler/CalendlyStyleScheduler";
import routes from "../../../routes";
import "./TutorAvailabilityCard.css";
import { useI18n } from "../../../lib/i18n";
import { AvailabilityService } from "../../services/core/AvailabilityService";

export default function TutorAvailabilityCard({ tutor, materia }) {
  const { t, locale, formatCurrency } = useI18n();
  const [availabilities, setAvailabilities] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScheduler, setShowScheduler] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();
  const localeStr = locale === 'en' ? 'en-US' : 'es-ES';

  useEffect(() => {
    loadTutorAvailability();
  }, [tutor.uid || tutor.id || tutor.email]);

  const loadTutorAvailability = async () => {
    try {
      setLoading(true);
      setError(null);
      // Use tutor ID (uid) first, then id, then email as fallback
      const tutorId = tutor.uid || tutor.id || tutor.email;
      console.log(` Cargando disponibilidad para tutor ${tutorId} (${tutor.name})`);
      
      const availability = await AvailabilityService.getAvailabilities(tutorId);
      console.log(`📋 Obtenidas ${availability.length} disponibilidades para ${tutor.name}`);
      console.log(availability);
      
      // Filtrar solo las disponibilidades futuras
      const now = new Date();
      const filtered = availability.filter(avail => {
        const startDate = new Date(avail.startDateTime);
        const isUpcoming = startDate > now;
        return isUpcoming;
      });
      
      console.log(` Filtradas ${filtered.length} disponibilidades relevantes para ${tutor.name} en ${materia || 'cualquier materia'}`);
      setAvailabilities(filtered);
    } catch (error) {
      console.error(` Error cargando disponibilidad para ${tutor.name}:`, error);
      setError(t('availability.tutorCard.errors.load'));
      setAvailabilities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleClick = () => {
    console.log(` Navegando a disponibilidad individual para ${tutor.name}`);
    
    // Use tutor ID (uid) first, then id, then email as fallback
    const tutorId = tutor.uid || tutor.id || tutor.email;
    
    // Crear los parámetros de búsqueda para la nueva página
    const params = new URLSearchParams({
      tutorId: tutorId,
      tutorName: tutor.name || 'Tutor',
      ...(materia && { course: materia }),
      ...(tutor.location && { location: tutor.location }),
      ...(tutor.rating && { rating: tutor.rating.toString() })
    });
    
    // Navegar a la nueva vista de disponibilidad individual
    router.push(`${routes.INDIVIDUAL_AVAILABILITY}?${params.toString()}`);
  };

  const handleCloseScheduler = () => {
    console.log(' Cerrando scheduler');
    setShowScheduler(false);
  };

  const handleBookingComplete = () => {
    console.log(' Reserva completada - recargando disponibilidades');
    // Recargar la disponibilidad después de una reserva exitosa
    loadTutorAvailability();
    setShowScheduler(false);
  };

  const getAvailableHours = () => {
    if (!filtered.length) return 0;
    return filtered.filter(avail => !avail.isBooked).length;
  };

  const getNextAvailableSlot = () => {
    const availableSlots = filtered.filter(avail => !avail.isBooked);
    if (availableSlots.length === 0) return null;
    
    // Ordenar por fecha y tomar el primero
    const sorted = availableSlots.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
    return sorted[0];
  };

  const formatNextSlot = (slot) => {
    if (!slot) return null;
    const date = new Date(slot.startDateTime);
    return {
      date: date.toLocaleDateString(localeStr, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString(localeStr, { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const nextSlot = getNextAvailableSlot();
  const nextSlotFormatted = formatNextSlot(nextSlot);

  if (showScheduler) {
    return (
      <div className="scheduler-overlay">
        <div className="scheduler-container">
          <div className="scheduler-header-bar">
            <h3>{t('availability.tutorCard.bookWith', { name: tutor.name })}</h3>
            <button 
              className="close-scheduler-btn"
              onClick={handleCloseScheduler}
            >
              ✕
            </button>
          </div>
          <CalendlyStyleScheduler
            tutor={tutor}
            availabilities={availabilities}
            materia={materia}
            onBookingComplete={handleBookingComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tutor-card">
      <div className="tutor-card-header">
        <div className="tutor-avatar">
          <span className="avatar-icon">👨‍🏫</span>
        </div>
        <div className="tutor-info">
          <h3 className="tutor-name">{tutor.name || t('availability.tutorCard.tutorFallback')}</h3>
          <p className="tutor-email">{tutor.email}</p>
          {(() => {
            // Normalize courses/courses to always be an array
            const normalizeCourses = (courses) => {
              if (!courses) return [];
              if (Array.isArray(courses)) {
                return courses.map(course => {
                  // If course is an object, extract the name
                  if (typeof course === 'object') {
                    return course.nombre || course.name || course.codigo || course.code || String(course);
                  }
                  return String(course);
                });
              }
              // If it's a string, convert to array
              if (typeof courses === 'string') {
                return [courses];
              }
              return [];
            };
            
            const courses = normalizeCourses(tutor.courses || tutor.courses);
            
            return courses.length > 0 && (
              <div className="tutor-courses">
                <span className="courses-label">{t('availability.tutorCard.courses')}</span>
                <div className="courses-list">
                  {courses.slice(0, 3).map((course, index) => (
                    <span key={index} className="course-tag">
                      {course}
                    </span>
                  ))}
                  {courses.length > 3 && (
                    <span className="more-courses">+{courses.length - 3} {t('availability.tutorCard.more')}</span>
                  )}
                </div>
              </div>
            );
          })()}
          {tutor.rating && (
            <div className="tutor-rating">
              <span className="rating-stars">
                {'⭐'.repeat(Math.floor(tutor.rating))}
              </span>
              <span className="rating-number">
                {tutor.rating.toFixed(1)} ({tutor.totalSessions || 0} {t('availability.tutorCard.sessions')})
              </span>
            </div>
          )}
          {tutor.hourlyRate && (
            <div className="tutor-rate">
              <span className="rate-amount">{formatCurrency(tutor.hourlyRate)} {t('availability.tutorCard.perHour')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="availability-section">
        <h4 className="availability-title">
          {t('availability.tutorCard.availability')}
          {loading && <span className="loading-spinner"></span>}
        </h4>

        {error && (
          <div className="error-message">
            <span className="error-icon"></span>
            {error}
            <button 
              className="retry-btn"
              onClick={loadTutorAvailability}
            >
              {t('availability.tutorCard.retry')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="availability-skeleton">
            <div className="skeleton-slot"></div>
            <div className="skeleton-slot"></div>
            <div className="skeleton-slot"></div>
          </div>
        ) : availabilities.length === 0 ? (
          <div className="no-availability">
            <div className="no-availability-icon"></div>
            <p>{t('availability.tutorCard.noAvailability')}</p>
          </div>
        ) : (
          <>
            <div className="availability-summary">
              <div className="summary-item">
                <span className="summary-number">{getAvailableHours()}</span>
                <span className="summary-label">{t('availability.tutorCard.availableSlots')}</span>
              </div>
              
              {nextSlotFormatted && (
                <div className="next-slot">
                  <span className="next-slot-label">{t('availability.tutorCard.nextSlot')}:</span>
                  <span className="next-slot-info">
                    {nextSlotFormatted.date} {t('availability.tutorCard.at')} {nextSlotFormatted.time}
                  </span>
                </div>
              )}
            </div>

            <div className="schedule-actions">
              <button 
                className="schedule-btn"
                onClick={handleScheduleClick}
              >
                 {t('availability.tutorCard.viewAll')}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="tutor-actions">
        <button 
          className="book-now-btn"
          onClick={handleScheduleClick}
          disabled={loading || availabilities.length === 0}
        >
          {availabilities.length > 0 ? `🚀 ${t('availability.tutorCard.bookNow')}` : ` ${t('availability.tutorCard.noAvailabilityShort')}`}
        </button>
        <button className="contact-btn">
          💬 {t('availability.tutorCard.contact')}
        </button>
      </div>
    </div>
  );
} 