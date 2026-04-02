"use client";

import React, { useState, useEffect } from "react";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import { SlotService } from "../../services/utils/SlotService";
import "./RescheduleSessionModal.css";
import { useI18n } from "../../../lib/i18n";

export default function RescheduleSessionModal({ 
  isOpen, 
  onClose, 
  session, 
  onRescheduleComplete 
}) {
  const { t, locale, formatDate: i18nFormatDate, formatDateTime: i18nFormatDateTime } = useI18n();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && session) {
      loadTutorAvailability();
    }
  }, [isOpen, session]);

  const loadTutorAvailability = async () => {
    try {
      setLoading(true);
      setError(null);

      // Obtener disponibilidades del tutor para las próximas 2 semanas
      const now = new Date();
      const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const result = await AvailabilityService.getAvailabilitiesByTutorAndRange(
        session.tutorEmail,
        now.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      const availabilitySlots = result.availabilitySlots || [];

      // Generar slots de 1 hora
      const generatedSlots = SlotService.generateHourlySlotsFromAvailabilities(availabilitySlots);
      const availableSlots = SlotService.getAvailableSlots(generatedSlots);
      
      // Filtrar slots que sean en el futuro (con al menos 2 horas de anticipación)
      const minimumTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const futureSlots = availableSlots.filter(slot => 
        new Date(slot.startDateTime) > minimumTime
      );

      setSlots(futureSlots);

    } catch (error) {
      console.error('Error loading tutor availability:', error);
      setError(error.message);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedSlot) {
      alert(t('rescheduleModal.alerts.selectSlot'));
      return;
    }

    if (!reason.trim()) {
      alert(t('rescheduleModal.alerts.provideReason'));
      return;
    }

    try {
      setRescheduling(true);
      setError(null);

      const response = await fetch('/api/tutoring-sessions/reschedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.id,
          newSlot: selectedSlot,
          reason: reason
        })
      });

      if (!response) {
        throw new Error('No response received from server');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || t('rescheduleModal.alerts.error'));
      }

      alert(t('rescheduleModal.alerts.success'));
      
      if (onRescheduleComplete) {
        onRescheduleComplete();
      }
      
      onClose();
    } catch (error) {
      console.error('Error rescheduling session:', error);
      setError(error.message);
    } finally {
      setRescheduling(false);
    }
  };

  const groupSlotsByDate = (slots) => {
    return SlotService.groupSlotsByDate(slots);
  };

  const formatDate = (dateTime) => {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
    return date.toLocaleDateString(localeStr, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateTime) => {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
    return date.toLocaleTimeString(localeStr, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen || !session) return null;

  const groupedSlots = groupSlotsByDate(slots);
  const currentDateTime = `${formatDate(session.scheduledDateTime)} - ${formatTime(session.scheduledDateTime)}`;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ 
        backgroundColor: 'rgba(17, 24, 39, 0.4)', 
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)' 
      }}
    >
      <div className="bg-[#FEF9F6] rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center">
            <button onClick={onClose} className="mr-3 text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('rescheduleModal.title')}</h2>
              <p className="text-sm text-gray-500">{session.course}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Current Session Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">
               {t('rescheduleModal.currentSchedule')}
            </p>
            <p className="text-sm text-blue-700">
              {currentDateTime}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {t('rescheduleModal.tutorLabel')} {session.tutorName || session.tutorEmail}
            </p>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('rescheduleModal.reasonLabel')}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('rescheduleModal.reasonPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8C00]"
              rows="3"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800"> {error}</p>
            </div>
          )}

          {/* Available Slots */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {t('rescheduleModal.selectNewTime')}
            </h3>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF8C00] mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">{t('rescheduleModal.loading')}</p>
              </div>
            ) : Object.keys(groupedSlots).length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">📭 {t('rescheduleModal.noSlotsTitle')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('rescheduleModal.noSlotsText')}</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {Object.entries(groupedSlots).map(([dateKey, dayData]) => (
                  <div key={dateKey} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                      <p className="text-sm font-semibold text-gray-900">
                        {dayData.date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-xs text-gray-600">
                        {dayData.slots.length === 1 
                          ? t('rescheduleModal.slotsAvailable', { count: dayData.slots.length })
                          : t('rescheduleModal.slotsAvailablePlural', { count: dayData.slots.length })
                        }
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 p-3">
                      {dayData.slots.map(slot => (
                        <button
                          key={slot.id}
                          onClick={() => setSelectedSlot(slot)}
                          className={`
                            p-3 rounded-lg border-2 text-left transition-all
                            ${selectedSlot?.id === slot.id 
                              ? 'border-[#FF8C00] bg-orange-50' 
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                            }
                          `}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`
                              w-4 h-4 rounded-full border-2 flex items-center justify-center
                              ${selectedSlot?.id === slot.id ? 'border-[#FF8C00]' : 'border-gray-300'}
                            `}>
                              {selectedSlot?.id === slot.id && (
                                <div className="w-2 h-2 rounded-full bg-[#FF8C00]"></div>
                              )}
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {formatTime(slot.startDateTime)} - {formatTime(slot.endDateTime)}
                            </span>
                          </div>
                          {slot.location && (
                            <p className="text-xs text-gray-600 mt-1 ml-6">
                               {slot.location}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleReschedule}
            className="w-full py-3 bg-[#FF8C00] text-white font-semibold rounded-lg hover:bg-[#E67E00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedSlot || !reason.trim() || rescheduling}
          >
            {rescheduling ? t('rescheduleModal.confirmingButton') : t('rescheduleModal.confirmButton')}
          </button>

          <button
            onClick={onClose}
            className="w-full py-3 bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            disabled={rescheduling}
          >
            {t('rescheduleModal.cancelButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
