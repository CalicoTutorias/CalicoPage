"use client";

import React, { useState, useEffect } from "react";
import { SlotService } from "../../services/utils/SlotService";
import "./CalendlyStyleScheduler.css";

export default function CalendlyStyleScheduler({ tutor, availabilities, materia, onBookingComplete }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hourlySlots, setHourlySlots] = useState([]);

  useEffect(() => {
    generateHourlySlots();
  }, [availabilities]);

  const generateHourlySlots = async () => {
    try {
      setSlotsLoading(true);
      setError(null);

      if (availabilities.length === 0) {
        setHourlySlots([]);
        return;
      }

      // Generar slots de 1 hora a partir de las disponibilidades
      const generatedSlots = SlotService.generateHourlySlotsFromAvailabilities(availabilities);

      // Filtrar solo slots disponibles y futuros
      const availableSlots = SlotService.getAvailableSlots(generatedSlots);
      setHourlySlots(availableSlots);
    } catch (error) {
      console.error('Error generando slots de 1 hora:', error);
      setError('Error cargando horarios disponibles. Por favor intenta de nuevo.');
    } finally {
      setSlotsLoading(false);
    }
  };

  const groupedSlots = SlotService.groupSlotsByDate(hourlySlots);
  const sortedDates = Object.keys(groupedSlots).sort();

  const formatDate = (date) => {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return new Date(date).toLocaleDateString('es-ES', options);
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleSlotSelect = (slot) => {
    setSelectedSlot(slot);
    setShowBookingForm(true);
    setError(null);
  };

  const handleCancelBooking = () => {
    setShowBookingForm(false);
    setSelectedSlot(null);
  };

  if (slotsLoading) {
    return (
      <div className="calendly-scheduler">
        <div className="scheduler-header">
          <h3>Cargando horarios disponibles...</h3>
          <div className="loading-spinner-large"></div>
          <p className="loading-text">Verificando disponibilidad en tiempo real</p>
        </div>
      </div>
    );
  }

  if (hourlySlots.length === 0) {
    return (
      <div className="calendly-scheduler">
        <div className="no-availability-message">
          <div className="icon"></div>
          <h3>No hay horarios de 1 hora disponibles</h3>
          <p>Este tutor no tiene horarios disponibles para {materia} en este momento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="calendly-scheduler">
      <div className="scheduler-header">
        <h3>Selecciona un horario de 1 hora con {tutor.name}</h3>
        <p className="course-info">Tutoría de {materia}</p>
        <p className="slot-info"> Cada sesión dura exactamente 1 hora</p>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon"></span>
          {error}
        </div>
      )}

      <div className="available-dates">
        {sortedDates.map(dateKey => {
          const dayData = groupedSlots[dateKey];
          return (
            <div key={dateKey} className="date-section">
              <div className="date-header">
                <h4>{formatDate(dateKey)}</h4>
                <span className="slots-count">
                  {dayData.length} sesión{dayData.length !== 1 ? 'es' : ''} de 1h disponible{dayData.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              <div className="time-slots">
                {dayData.map((slot) => (
                  <div 
                    key={slot.id}
                    className={`time-slot hourly-slot ${selectedSlot?.id === slot.id ? 'selected' : ''}`}
                    onClick={() => handleSlotSelect(slot)}
                  >
                    <div className="slot-time">
                      <span className="start-time">{formatTime(slot.startDateTime)}</span>
                      <span className="end-time">- {formatTime(slot.endDateTime)}</span>
                    </div>
                    {slot.location && (
                      <div className="slot-location"> {slot.location}</div>
                    )}
                    {slot.description && (
                      <div className="slot-description">
                        {slot.description.length > 40 
                          ? `${slot.description.substring(0, 40)}...`
                          : slot.description
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showBookingForm && selectedSlot && (
        <div className="booking-form">
          {/* Aquí iría el formulario de reserva */}
          <button onClick={handleCancelBooking}>Cancelar</button>
        </div>
      )}
    </div>
  );
}