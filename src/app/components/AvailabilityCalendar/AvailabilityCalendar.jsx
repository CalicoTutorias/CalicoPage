"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from 'react-calendar';
import { Clock, User, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import './AvailabilityCalendar.css';
import { AvailabilityService } from '../../services/core/AvailabilityService';
import { SlotService } from '../../services/utils/SlotService';
import { TutoringSessionService } from '../../services/core/TutoringSessionService';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import SessionConfirmationModal from '../SessionConfirmationModal/SessionConfirmationModal';
import SessionBookedModal from '../SessionBookedModal/SessionBookedModal';

/**
 * AvailabilityCalendar Component
 * 
 * Modes:
 * - 'individual': Shows availability for a specific tutor (requires tutorId)
 *   - When mode='individual' and tutorId is provided, shows ONLY that tutor's availability
 *   - course parameter is optional and only used for display/metadata
 * - 'joint': Shows combined availability for all tutors teaching a course (requires course)
 *   - When mode='joint' and course is provided, shows availability from ALL tutors for that course
 * 
 * @param {string} tutorId - Tutor ID/email (required for individual mode)
 * @param {string} tutorName - Tutor name (for display in individual mode)
 * @param {string} course - Course name (required for joint mode, optional for individual)
 * @param {string} mode - 'individual' or 'joint' (default: 'individual')
 */
const AvailabilityCalendar = ({ 
  tutorId = null,        // Para modo individual
  tutorName = null,      // Para modo individual  
  course = null,        // Para modo conjunto (Nombre)
  courseId = null,      // ID del curso (opcional, para booking)
  mode = 'individual',   // 'individual' o 'joint'
  onDateSelect, 
  selectedDate, 
  loading = false 
}) => {
  // DEBUG: Log received props
  console.log('[AvailabilityCalendar] Received props:', { tutorId, tutorName, course, courseId, mode });
  const router = useRouter();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [date, setDate] = useState(selectedDate || new Date());
  const [selectedDaySlots, setSelectedDaySlots] = useState([]);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState(null);
  const [availabilityDataReady, setAvailabilityDataReady] = useState(false);
  const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
  
  // Estados para el modal de confirmación
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [selectedSlotForBooking, setSelectedSlotForBooking] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Estado para el popup de éxito post-pago
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successSessionInfo, setSuccessSessionInfo] = useState(null);

  useEffect(() => {
    if (selectedDate) {
      setDate(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAvailabilityData();
  }, [tutorId, course, courseId, mode]);

  useEffect(() => {
    setAvailabilityDataReady(Array.isArray(availabilityData) && availabilityData.length > 0);
  }, [availabilityData]);

  useEffect(() => {
    if (availabilityDataReady) {
      generateSlotsForSelectedDay();
    }
  }, [availabilityDataReady, date]);

  const loadAvailabilityData = async () => {
    if (mode === 'joint') {
      if (!course && !courseId) return;
    } else if (!tutorId) {
      return;
    }
    try {
      setLoadingData(true);
      setError(null);

      // Priority 1: Individual mode with tutorId - always use individual availability
      if (mode === 'individual' && tutorId) {
        try {
          const tutorAvailability = await AvailabilityService.getAvailabilities(tutorId);
          setAvailabilityData(Array.isArray(tutorAvailability) ? tutorAvailability : []);
        } catch (err) {
          console.error('Error loading individual tutor availability:', err);
          throw err;
        }
      } else if (mode === 'joint' && (course || courseId)) {
        const result = await AvailabilityService.getJointAvailabilityByCourse(course, courseId);
        
        if (!result.success) {
          throw new Error('Failed to load joint availability');
        }

        // Backend returns tutorsAvailability array with structure:
        // [{ tutorId, tutorEmail, tutorName, connected, availabilities: [...], totalSlots, ... }]
        const tutorsAvailability = result.tutorsAvailability || [];
        
        // Flatten all availabilities from all tutors into a single array
        // Each tutor's data contains an array of availabilities, not slots
        const flattened = tutorsAvailability.flatMap(tutorData => {
          const tutorId = tutorData.tutorId
          const tutorName = tutorData.tutorName || tutorId;
          const availabilities = tutorData.slots || [];
          
          // Each availability is an availability window that will be converted to slots later
          return availabilities.map(availability => ({
            id: availability.id || availability.availabilityId || `${tutorId}-${availability.startDateTime || Math.random()}`,
            tutorId: tutorId,
            tutorEmail: tutorId,
            tutorName: tutorName,
            title: availability.title || availability.summary || t('availability.calendar.slots.tutorAvailable'),
            description: availability.description || '',
            startDateTime: availability.startDateTime || availability.start,
            endDateTime: availability.endDateTime || availability.end,
            location: availability.location || 'Virtual',
            course: availability.course || course,
            color: '#2196F3',
            googleEventId: availability.googleEventId || availability.eventId,
            isBooked: availability.isBooked || false,
          }));
        });

        setAvailabilityData(flattened);
      } else {
        // If mode is individual but no tutorId, or mode is joint but no course
        console.warn('AvailabilityCalendar: Invalid configuration', {
          mode,
          tutorId: tutorId || 'missing',
          course: course || 'missing'
        });
        setAvailabilityData([]);
        setError(t('availability.calendar.errors.load'));
      }
    } catch (error) {
      console.error('Error loading availability data:', error);
      setError(t('availability.calendar.errors.load'));
      setAvailabilityData([]);
    } finally {
      setLoadingData(false);
    }
  };

  const generateSlotsForSelectedDay = async () => {
    try {
      setLoadingSlots(true);
      if (!Array.isArray(availabilityData) || availabilityData.length === 0) {
        setSelectedDaySlots([]);
        return;
      }

      const generatedSlots = SlotService.generateHourlySlotsFromAvailabilities(availabilityData);
      const allBookings = await SlotService.getAllBookingsForAvailabilities(
        availabilityData,
        TutoringSessionService
      );
      const slotsWithBookings = SlotService.applySavedBookingsToSlots(generatedSlots, allBookings);
      const availableSlots = SlotService.getAvailableSlots(slotsWithBookings);

      // Usar componentes de fecha local para evitar problemas con UTC
      const selectedYear = date.getFullYear();
      const selectedMonth = String(date.getMonth() + 1).padStart(2, '0');
      const selectedDay = String(date.getDate()).padStart(2, '0');
      const selectedDateStr = `${selectedYear}-${selectedMonth}-${selectedDay}`;

      const daySlots = availableSlots.filter(slot => {
        const slotDate = new Date(slot.startDateTime);
        const slotYear = slotDate.getFullYear();
        const slotMonth = String(slotDate.getMonth() + 1).padStart(2, '0');
        const slotDay = String(slotDate.getDate()).padStart(2, '0');
        const slotDateStr = `${slotYear}-${slotMonth}-${slotDay}`;
        return slotDateStr === selectedDateStr;
      });

      setSelectedDaySlots(daySlots);
    } catch (error) {
      console.error('Error generando slots:', error);
      setError(t('availability.calendar.errors.generate'));
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleDateChange = (newDate) => {
    setDate(newDate);
    if (onDateSelect) {
      onDateSelect(newDate);
    }
  };

  const formatSelectedDate = (date) => {
    return date.toLocaleDateString(localeStr, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSlotSelect = async (slot) => {
    try {
      const realTimeCheck = await SlotService.checkSlotAvailabilityRealTime(
        slot,
        TutoringSessionService
      );

      if (!realTimeCheck.available) {
        setError(t('availability.calendar.errors.slotNotAvailable'));
        await generateSlotsForSelectedDay();
        return;
      }

      // Abrir modal de confirmación
      setSelectedSlotForBooking(slot);
      setShowConfirmationModal(true);
      setError(null);
    } catch (error) {
      console.error('Error seleccionando slot:', error);
      setError(t('availability.calendar.errors.selecting'));
    }
  };

  const handleBookingConfirm = async ({ result }) => {
    try {
      setConfirmLoading(true);
      setError(null);

      setShowConfirmationModal(false);
      setSelectedSlotForBooking(null);

      // Mostrar popup de éxito con los datos de la sesión creada
      setSuccessSessionInfo(result?.session || null);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error al confirmar pago:', error);
      setError('Error procesando el pago. Por favor intenta de nuevo.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCloseConfirmationModal = () => {
    setShowConfirmationModal(false);
    setSelectedSlotForBooking(null);
    setError(null);
  };

  const getTileClassName = ({ date: tileDate, view }) => {
    if (view !== 'month') return '';

    const baseClass = 'calendar-tile';
    
    // Usar componentes de fecha local para evitar problemas con UTC
    const selectedYear = date.getFullYear();
    const selectedMonth = String(date.getMonth() + 1).padStart(2, '0');
    const selectedDay = String(date.getDate()).padStart(2, '0');
    const selectedDateStr = `${selectedYear}-${selectedMonth}-${selectedDay}`;
    
    let tileDateStr = null;
    if (tileDate instanceof Date && !isNaN(tileDate)) {
      const tileYear = tileDate.getFullYear();
      const tileMonth = String(tileDate.getMonth() + 1).padStart(2, '0');
      const tileDay = String(tileDate.getDate()).padStart(2, '0');
      tileDateStr = `${tileYear}-${tileMonth}-${tileDay}`;
    }

    const isSelected = tileDateStr && selectedDateStr === tileDateStr;
    const isPast = tileDate < new Date().setHours(0, 0, 0, 0);
    const hasAvailability = Array.isArray(availabilityData) && availabilityData.some(slot => {
      const slotDate = slot.startDateTime ? new Date(slot.startDateTime) : null;
      if (!slotDate || !(slotDate instanceof Date) || isNaN(slotDate)) return false;
      
      const slotYear = slotDate.getFullYear();
      const slotMonth = String(slotDate.getMonth() + 1).padStart(2, '0');
      const slotDay = String(slotDate.getDate()).padStart(2, '0');
      const slotDateStr = `${slotYear}-${slotMonth}-${slotDay}`;
      
      return slotDateStr === tileDateStr;
    });

    let classes = [baseClass];

    if (isSelected) classes.push('selected');
    if (hasAvailability && !isPast) classes.push('has-availability');
    if (isPast) classes.push('past-date');

    return classes.join(' ');
  };

  return (
    <div className="availability-calendar-container">
      <div className="calendar-panel">
        <div className="calendar-header">
          <h3 className="calendar-title">
            {mode === 'joint' ? (
              <>
                <Users size={24} />
                {t('availability.calendar.header.jointTitle')}
              </>
            ) : (
              <>
                <User size={24} />
                {tutorName 
                  ? t('availability.calendar.header.individualTitle', { tutor: tutorName })
                  : t('availability.calendar.header.individualFallback')}
              </>
            )}
          </h3>
        </div>

        {loadingData || loading ? (
          <div className="calendar-loading">
            <div className="loading-spinner"></div>
            <p>{t('availability.calendar.loading')}</p>
          </div>
        ) : (
          <Calendar
            onChange={handleDateChange}
            value={date}
            locale={localeStr}
            minDate={new Date()}
            tileClassName={getTileClassName}
            navigationLabel={({ date }) => (
              `${date.toLocaleDateString(localeStr, { month: 'long', year: 'numeric' })}`
            )}
            nextLabel={<ChevronRight size={16} />}
            prevLabel={<ChevronLeft size={16} />}
            next2Label={null}
            prev2Label={null}
          />
        )}
      </div>

      <div className="slots-panel">
        <div className="slots-header">
          <h3 className="slots-title">
            <Clock size={20} />
            {t('availability.calendar.slots.title')}
          </h3>
          <p className="selected-date">{formatSelectedDate(date)}</p>
        </div>

        <div className="slots-list">
          {loadingData || loadingSlots ? (
            <div className="no-slots">
              <div className="loading-spinner"></div>
              <p>{t('availability.calendar.loading')}</p>
            </div>
          ) : selectedDaySlots.length === 0 ? (
            <div className="no-slots">
              <div className="no-slots-icon"></div>
              <h4>{t('availability.calendar.slots.noneTitle')}</h4>
              <p>{t('availability.calendar.slots.noneHint')}</p>
            </div>
          ) : (
            selectedDaySlots.map((slot) => (
              <div 
                key={slot.id} 
                className="slot-item"
                onClick={() => handleSlotSelect(slot)}
              >
                <div className="slot-time">
                  <Clock size={16} />
                  {`${new Date(slot.startDateTime).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })} - ${new Date(slot.endDateTime).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`}
                </div>
                <div className="slot-tutor">
                  <User size={14} />
                  <span>{slot.tutorName || t('availability.calendar.slots.tutorAvailable')}</span>
                </div>
                <button className="book-slot-btn">
                  {mode === 'joint' ? t('availability.calendar.slots.viewOptions') : t('availability.calendar.slots.book')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Popup de sesión reservada — reutiliza SessionBookedModal con el gato calico */}
      <SessionBookedModal
        isOpen={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); router.push(routes.HOME); }}
        userType="student"
        sessionData={successSessionInfo ? {
          scheduledDateTime: successSessionInfo.startTimestamp,
          tutorName: successSessionInfo.tutor?.name || tutorName || t('availability.calendar.defaultTutorName'),
          course: successSessionInfo.course?.name || course || t('availability.calendar.defaultCourse'),
          location: successSessionInfo.locationType || 'Virtual',
          googleMeetLink: successSessionInfo.googleMeetLink || null,
        } : {
          scheduledDateTime: selectedSlotForBooking?.startDateTime || new Date().toISOString(),
          tutorName: tutorName || t('availability.calendar.defaultTutorName'),
          course: course || t('availability.calendar.defaultCourse'),
          location: 'Virtual',
          googleMeetLink: null,
        }}
      />

      {/* Modal de confirmación de reserva */}
      {showConfirmationModal && selectedSlotForBooking && (
        <SessionConfirmationModal
          isOpen={showConfirmationModal}
          onClose={handleCloseConfirmationModal}
          session={{
            tutorId: tutorId || selectedSlotForBooking.tutorId,
            studentId: user?.uid || user?.id || null,
            studentName: user?.name || 'Estudiante',
            studentPhone: user?.phone || '3000000000',
            tutorName: tutorName || selectedSlotForBooking.tutorName || t('availability.calendar.defaultTutorName'),
            tutorEmail: tutorId || selectedSlotForBooking.tutorEmail,
            course: course || selectedSlotForBooking.course || t('availability.calendar.defaultCourse'),
            courseId: (() => {
              const resolved = courseId || selectedSlotForBooking.courseId;
              console.log('[AvailabilityCalendar] Passing to SessionConfirmationModal:', {
                'prop courseId': courseId,
                'slot courseId': selectedSlotForBooking.courseId,
                'resolved courseId': resolved
              });
              return resolved;
            })(),
            scheduledDateTime: selectedSlotForBooking.startDateTime,
            endDateTime: selectedSlotForBooking.endDateTime,
            location: selectedSlotForBooking.location || 'Virtual',
            price: selectedSlotForBooking.price || 50000,
            studentEmail: user?.email || '',
            parentAvailabilityId: selectedSlotForBooking.parentAvailabilityId,
            slotId: selectedSlotForBooking.id,
            slotIndex: selectedSlotForBooking.slotIndex,
          }}
          onConfirm={handleBookingConfirm}
          confirmLoading={confirmLoading}
        />
      )}
    </div>
  );
};

export default AvailabilityCalendar;