"use client";

import React, { useState, useEffect, useCallback } from "react";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import { authFetch } from "../../services/authFetch";
import RescheduleSessionModal from "../RescheduleSessionModal/RescheduleSessionModal";
import CancellationModal from "../CancellationModal/CancellationModal";
import AttachmentList from "../AttachmentList/AttachmentList";
import "./TutoringDetailsModal.css";

export default function TutoringDetailsModal({ isOpen, onClose, session, onSessionUpdate }) {
  const { user } = useAuth();
  const { t, locale, formatCurrency } = useI18n();
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState(null);

  // Fetch attachments when modal opens
  const loadAttachments = useCallback(async () => {
    if (!session?.id) return;
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const { ok, data } = await authFetch(`/api/sessions/${session.id}/attachments`);
      if (ok && data?.success) {
        setAttachments(data.attachments || []);
      } else {
        setAttachmentsError(data?.error || 'Error');
      }
    } catch {
      setAttachmentsError('Error al cargar adjuntos.');
    } finally {
      setAttachmentsLoading(false);
    }
  }, [session?.id]);

  useEffect(() => {
    if (isOpen && session?.id) {
      loadAttachments();
    }
    if (!isOpen) {
      setAttachments([]);
      setAttachmentsError(null);
    }
  }, [isOpen, session?.id, loadAttachments]);

  if (!isOpen || !session) return null;

  const handleCancelClick = () => {
    setShowCancellationModal(true);
  };

  const handleCancellationSuccess = (updatedSession) => {
    setShowCancellationModal(false);
    // Close the details modal
    if (onClose) {
      onClose();
    }
    // Update the parent component to refresh the sessions list
    if (onSessionUpdate) {
      onSessionUpdate();
    }
  };

  const canCancel = () => {
    // Cannot cancel if already canceled or completed
    if (session.status === 'Canceled' || session.status === 'Completed') return false;
    
    const now = new Date();
    const sessionDate = new Date(session.startTimestamp || session.scheduledStart);
    
    // Session must be in the future
    if (sessionDate <= now) return false;
    
    // Cannot cancel if session is within 6 hours
    const hoursUntilSession = (sessionDate - now) / (1000 * 60 * 60);
    if (hoursUntilSession < 6) return false;
    
    return true;
  };

  const canReschedule = () => {
    if (session.status === 'Canceled' || session.status === 'Completed') return false;
    const now = new Date();
    const sessionDate = new Date(session.startTimestamp || session.scheduledStart);
    if (sessionDate <= now) return false;
    return (sessionDate - now) / (1000 * 60 * 60) >= 2;
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
    const sessionDate = new Date(session.startTimestamp || session.scheduledStart);
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
  
  // Use startTimestamp and endTimestamp from the database (not scheduledStart/scheduledEnd)
  const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
  const startDate = new Date(session.startTimestamp || session.scheduledStart);
  const endDate = new Date(session.endTimestamp || session.scheduledEnd);
  const formattedDate = startDate.toLocaleDateString(localeStr, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const timeRange = `${startDate.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;

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
          {/* Session Status Badge */}
          <div className="flex flex-wrap items-center gap-2">
            {session.status === 'Pending' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Pendiente — Esperando confirmación del tutor
              </span>
            )}
            {session.status === 'Accepted' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Tutoría Confirmada
              </span>
            )}
            {session.status === 'Rejected' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Rechazada — Debes reagendar
              </span>
            )}
            {session.status === 'Canceled' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Cancelada
              </span>
            )}
            {session.status === 'Completed' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Completada
              </span>
            )}
            {session.paymentStatus && getPaymentStatusBadge(session.paymentStatus)}
          </div>

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
                <p className="font-semibold text-gray-900">{session.course?.name || session.course}</p>
                {(session.course?.code || session.courseCode) && <p className="text-sm text-gray-500">{session.course?.code || session.courseCode}</p>}
              </div>
            </div>
          </div>

          {/* Tutor - Solo mostrar si el usuario NO es el tutor */}
          {user.email !== session.tutorEmail && user.email !== session.tutor?.email && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.tutor')}</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="font-medium text-gray-900">{session.tutorName || session.tutor?.name || session.tutor?.email}</p>
              </div>
            </div>
          )}

          {/* Student - Siempre mostrar si existe información del estudiante */}
          {(session.studentName || session.studentEmail || session.participants?.[0]?.student) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('sessionDetails.student')}</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="font-medium text-gray-900">
                  {session.studentName || session.participants?.[0]?.student?.name || session.studentEmail || session.participants?.[0]?.student?.email}
                </p>
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
          {session.googleMeetLink && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-semibold text-indigo-900">{t('sessionDetails.meetingLink')}</h3>
              </div>
              <a 
                href={session.googleMeetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 bg-white border-2 border-indigo-300 rounded-lg px-4 py-3 text-indigo-700 font-semibold text-sm hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all hover:shadow-md"
              >
                <span className="truncate">{session.googleMeetLink.replace('https://', '')}</span>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

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

          {/* Topics to Review */}
          {session.topicsToReview && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Lo que solicitaste repasar</h3>
              <div className="rounded-lg bg-[#FFF8F0] border border-orange-100 p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                  {session.topicsToReview}
                </p>
              </div>
            </div>
          )}

          {/* Attachments */}
          {(attachments.length > 0 || attachmentsLoading) && !attachmentsError && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Material adjunto</h3>
              <AttachmentList
                attachments={attachments}
                loading={attachmentsLoading}
                error={attachmentsError}
              />
            </div>
          )}

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

          {/* Botón cancelar sesión - solo mostrar si puede cancelar */}
          {canCancel() && (
            <button
              onClick={handleCancelClick}
              className="w-full py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
            >
              {t('sessionDetails.cancelSession')}
            </button>
          )}

          {/* Mostrar mensaje si no se puede cancelar */}
          {!canCancel() && session.status !== 'Canceled' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800 text-center">
                {t('sessionDetails.timeUntil', { time: getTimeUntilSession() })}
              </p>
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

      {/* Modal de Cancelación */}
      <CancellationModal
        isOpen={showCancellationModal}
        onClose={() => setShowCancellationModal(false)}
        session={session}
        onCancellationSuccess={handleCancellationSuccess}
      />

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
