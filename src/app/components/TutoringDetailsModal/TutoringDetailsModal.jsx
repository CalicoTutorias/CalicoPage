"use client";

import React, { useState, useEffect } from "react";
import { TutoringSessionService } from "../../services/utils/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import RescheduleSessionModal from "../RescheduleSessionModal/RescheduleSessionModal";
import "./TutoringDetailsModal.css";

export default function TutoringDetailsModal({ isOpen, onClose, session, onSessionUpdate }) {
  const { user } = useAuth();
  const { t, locale, formatCurrency } = useI18n();
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  if (!isOpen || !session) return null;

  const handleCancelSession = async () => {
    if (!cancelReason.trim()) {
      alert(t('sessionDetails.cancelReasonPlaceholder'));
      return;
    }

    try {
      setCancelling(true);
      
      await TutoringSessionService.cancelSession(
        session.id, 
        user.email, 
        cancelReason
      );
      
      alert(' ' + t('sessionDetails.statusCancelled'));
      setShowCancelConfirm(false);
      
      // Llamar al callback de actualización si existe
      if (onSessionUpdate) {
        onSessionUpdate();
      }
      
      onClose();
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert(` ${error.message}`);
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = () => {
    if (session.status === 'cancelled') return false;
    
    // No se puede cancelar si ya pasó
    const now = new Date();
    if (new Date(session.scheduledStart) <= now) return false;
    
    // Verificar si faltan más de 2 horas
    return TutoringSessionService.canCancelSession(session.scheduledStart);
  };

  const canReschedule = () => {
    // No se puede reprogramar si está cancelada o completada
    if (session.status === 'cancelled' || session.status === 'completed') return false;
    
    // No se puede reprogramar si ya pasó
    const now = new Date();
    if (new Date(session.scheduledStart) <= now) return false;
    
    // Verificar si faltan más de 2 horas
    return TutoringSessionService.canCancelSession(session);
  };

  const handleRescheduleClick = () => {
    setShowRescheduleModal(true);
  };

  const handleRescheduleComplete = () => {
    setShowRescheduleModal(false);
    // Close the session details modal as well
    if (onClose) {
      onClose();
    }
    // Update the parent component to refresh the sessions list
    if (onSessionUpdate) {
      onSessionUpdate();
    }
  };

  const getTimeUntilSession = () => {
    const now = new Date();
    const sessionDate = new Date(session.scheduledStart);
    const hoursUntilSession = (sessionDate - now) / (1000 * 60 * 60);
    
    if (hoursUntilSession < 0) return t('sessionDetails.sessionPassed');
    if (hoursUntilSession < 1) {
      return t('sessionDetails.minutesRemaining', { minutes: Math.round(hoursUntilSession * 60) });
    }
    return t('sessionDetails.hoursRemaining', { hours: Math.round(hoursUntilSession) });
  };

  const getPaymentStatusBadge = (paymentStatus) => {
    // Only show payment badge for meaningful states after booking
    const paymentConfig = {
      en_verificación: { text: t('sessionDetails.paymentStatus.en_verificación'), className: 'AccentBackground PrimaryText' },
      verificado: { text: t('sessionDetails.paymentStatus.verificado'), className: 'bg-green-100 text-green-800' },
      rechazado: { text: t('sessionDetails.paymentStatus.rechazado'), className: 'bg-red-100 text-red-800' }
    };

    if (!paymentStatus || !paymentConfig[paymentStatus]) return null;
    const config = paymentConfig[paymentStatus];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
        {config.text}
      </span>
    );
  };
  
  const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
  const formattedDate = new Date(session.scheduledStart).toLocaleDateString(localeStr, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const timeRange = `${new Date(session.scheduledStart).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })} - ${new Date(session.scheduledEnd).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;

  const handlePayment = async () => {
    const paymentData = {
      amount_in_cents: session.price * 100, // Convert to cents
      currency: "COP",
      customer_email: user.email,
      reference: session.id,
    };

    try {
      const response = await fetch("/api/payments/wompi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      });

      const { paymentUrl } = await response.json();

      // Redirect to Wompi payment page
      window.location.href = paymentUrl;
    } catch (error) {
      console.error("Error initiating payment:", error);
      alert("Error initiating payment. Please try again.");
    }
  };

  useEffect(() => {
    if (session.paymentStatus === "pending") {
      handlePayment();
    }
  }, [session.paymentStatus]);

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ 
        backgroundColor: 'rgba(17, 24, 39, 0.4)', 
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)' 
      }}
    >
      <div className="bg-[#FEF9F6] rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-white px-6 py-4 flex items-center border-b border-gray-100">
          <button onClick={onClose} className="mr-3 text-gray-600 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{t('sessionDetails.title')}</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Payment Status Badge */}
          {session.paymentStatus && (
            <div className="flex gap-2">
              {getPaymentStatusBadge(session.paymentStatus)}
            </div>
          )}

          {/* Course */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.course')}</h3>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{session.course}</p>
                {session.courseCode && <p className="text-sm text-gray-500">{session.courseCode}</p>}
              </div>
            </div>
          </div>

          {/* Tutor - Solo mostrar si el usuario NO es el tutor */}
          {user.email !== session.tutorEmail && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.tutor')}</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-lg">👨‍🏫</span>
                </div>
                <p className="font-medium text-gray-900">{session.tutorName || session.tutorEmail}</p>
              </div>
            </div>
          )}

          {/* Student - Siempre mostrar si existe información del estudiante */}
          {(session.studentName || session.studentEmail) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.student')}</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-lg">👨‍🎓</span>
                </div>
                <p className="font-medium text-gray-900">{session.studentName || session.studentEmail}</p>
              </div>
            </div>
          )}

          {/* Session Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.sessionDetailsLabel')}</h3>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{timeRange}</p>
                <p className="text-sm text-[#FF8C00]">{formattedDate}</p>
              </div>
            </div>
          </div>

          {/* Location */}
          {session.location && session.location !== 'Por definir' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.location')}</h3>
              <p className="text-sm text-gray-700">{session.location}</p>
            </div>
          )}

          {/* Google Meet Link */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-indigo-900">{t('sessionDetails.meetingLink')}</h3>
            </div>
            <a 
              href="https://meet.google.com/kbm-rxii-ffo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 bg-white border-2 border-indigo-300 rounded-lg px-4 py-3 text-indigo-700 font-semibold text-sm hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all hover:shadow-md"
            >
              <span>meet.google.com/kbm-rxii-ffo</span>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Cost */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.cost')}</h3>
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">{formatCurrency(session.price || 50000)}</span>
              <span className="text-sm text-gray-500">{t('sessionDetails.total')}</span>
            </div>
          </div>

          {/* Cancellation Policy */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-900 mb-1">
               {t('sessionDetails.cancellationPolicyTitle')}
            </p>
            <p className="text-xs text-yellow-800">
              {t('sessionDetails.cancellationPolicy')}
            </p>
          </div>

          {/* Notes */}
          {session.notes && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.notes')}</h3>
              <p className="text-sm text-gray-700">{session.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 pb-6 space-y-3">
          {/* Mostrar estado de cancelación si aplica */}
          {session.status === 'cancelled' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
              <p className="text-sm font-semibold text-red-800 mb-1">
                {t('sessionDetails.statusCancelled')}
              </p>
              {session.cancelledBy && (
                <p className="text-xs text-red-700">
                  {t('sessionDetails.cancelledBy', { 
                    by: session.cancelledBy === user.email ? t('sessionDetails.cancelledByYou') : session.cancelledBy 
                  })}
                </p>
              )}
              {session.cancellationReason && (
                <p className="text-xs text-red-600 mt-1">
                  {t('sessionDetails.cancelReason', { reason: session.cancellationReason })}
                </p>
              )}
            </div>
          )}

          {/* Botones de acción si es posible reprogramar o cancelar */}
          {!showCancelConfirm && (canCancel()) && (
            <div className="grid grid-cols-2 gap-3">
              {canCancel() && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className={`py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors ${canReschedule() ? '' : 'col-span-2'}`}
                >
                  {t('sessionDetails.cancelSession')}
                </button>
              )}
            </div>
          )}

          {/* Mostrar mensaje si no se puede cancelar */}
          {!canCancel() && session.status !== 'cancelled' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
              <p className="text-sm text-yellow-800 text-center">
                {t('sessionDetails.timeUntil', { time: getTimeUntilSession() })}
              </p>
              <p className="text-xs text-yellow-700 text-center mt-1">
                {t('sessionDetails.cannotCancelWarning')}
              </p>
            </div>
          )}

          {/* Confirmación de cancelación */}
          {showCancelConfirm && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-red-800">
                {t('sessionDetails.cancelConfirmTitle')}
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('sessionDetails.cancelReasonPlaceholder')}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                rows="3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowCancelConfirm(false);
                    setCancelReason('');
                  }}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                  disabled={cancelling}
                >
                  {t('sessionDetails.cancelKeep')}
                </button>
                <button
                  onClick={handleCancelSession}
                  className="flex-1 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={cancelling || !cancelReason.trim()}
                >
                  {cancelling ? t('sessionDetails.cancelling') : t('sessionDetails.cancelConfirm')}
                </button>
              </div>
            </div>
          )}

          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t('sessionDetails.close')}
          </button>
        </div>
      </div>

      {/* Modal de Reprogramación */}
      <RescheduleSessionModal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        session={session}
        onRescheduleComplete={handleRescheduleComplete}
      />
    </div>
  );
}
