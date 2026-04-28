"use client";

import React, { useState, useEffect } from "react";
import { PaymentService } from "../../services/core/PaymentService";
import { useI18n } from "../../../lib/i18n";
import { useFileUpload } from "../../hooks/useFileUpload";
import FileUploader from "../FileUploader/FileUploader";

/**
 * Controlled booking flow:
 *   step='idle'      — form is editable
 *   step='checking'  — verifying S3 and Wompi health
 *   step='paying'    — Wompi widget is open
 *   step='uploading' — uploading cached attachments to S3 post-payment
 *   step='done'      — finished; parent is notified
 */
export default function SessionConfirmationModal({
  isOpen,
  onClose,
  session,
  onConfirm,
  confirmLoading = false
}) {
  const { t, locale } = useI18n();
  const [studentEmail, setStudentEmail] = useState(session?.studentEmail || '');
  const [error, setError] = useState('');
  const [step, setStep] = useState('idle');
  const [topicsToReview, setTopicsToReview] = useState('');
  const [createdSessionId, setCreatedSessionId] = useState(null);
  const fileUpload = useFileUpload();

  const TOPICS_MAX_LENGTH = 2000;
  const isBusy = step !== 'idle' || confirmLoading;

  // Cargar el script de Wompi dinámicamente
  useEffect(() => {
    if (isOpen) {
      const scriptId = 'wompi-widget-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://checkout.wompi.co/widget.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, [isOpen]);

  if (!isOpen || !session) return null;

  // DEBUG: Log received session
  console.log('[SessionConfirmationModal] Received session:', {
    ...session,
    courseId: session?.courseId
  });

  const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
  const formattedDate = new Date(session.scheduledDateTime).toLocaleDateString(localeStr, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const timeRange = `${new Date(session.scheduledDateTime).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })} - ${new Date(session.endDateTime).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  /**
   * Convert a timestamp (Date or string) to an ISO UTC string.
   */
  function toISOString(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      if (value.endsWith('Z')) return value;
      return new Date(value).toISOString();
    }
    return null;
  }

  /**
   * Step 1: validate form inputs. Returns true if all good, false otherwise.
   */
  function validateForm() {
    if (!isValidEmail(studentEmail)) {
      setError(t('availability.confirmationModal.errors.invalidEmail'));
      return false;
    }
    if (!topicsToReview.trim()) {
      setError('Debes describir qué temas quieres repasar.');
      return false;
    }
    if (!session?.tutorId || !session?.studentId || !session?.courseId) {
      setError('Faltan datos de la sesión. Recarga e intenta de nuevo.');
      return false;
    }
    if (!session.scheduledDateTime || !session.endDateTime) {
      setError('Las fechas de la sesión no son válidas.');
      return false;
    }
    return true;
  }

  /**
   * Step 2: verify S3 + Wompi are reachable before opening the widget.
   * Fails fast so we don't charge a user who wouldn't be able to upload later.
   */
  async function checkInfra() {
    setStep('checking');
    const health = await PaymentService.checkInfraHealth();
    if (!health.ok) {
      setError(`Servicios no disponibles: ${health.failures.join('; ')}. Intenta de nuevo en unos minutos.`);
      setStep('idle');
      return false;
    }
    return true;
  }

  /**
   * Step 3: create Wompi intent and open widget. Returns when the widget closes.
   */
  async function openWompiWidget() {
    const amountInCents = (session.price || 25000) * 100;
    const startISO = toISOString(session.scheduledDateTime);
    const endISO = toISOString(session.endDateTime);
    const durationMinutes = Math.round((new Date(endISO) - new Date(startISO)) / 60000);
    if (durationMinutes <= 0) throw new Error('La duración de la sesión no es válida.');

    const wompiData = await PaymentService.createWompiPayment({
      tutorId: session.tutorId,
      studentId: session.studentId,
      courseId: session.courseId,
      amount: amountInCents,
      durationMinutes,
      startTimestamp: startISO,
      endTimestamp: endISO,
      topicsToReview: topicsToReview.trim(),
    });

    const reference = wompiData.reference;
    const publicKey = wompiData.public_key || wompiData.publicKey;
    const signatureIntegrity = wompiData.signature;
    if (!reference || !publicKey || !signatureIntegrity) {
      throw new Error('El servidor no retornó los datos de pago correctamente.');
    }

    const phoneNumber = (session.studentPhone || '3000000000').toString().replace(/\D/g, '') || '3000000000';
    const customerData = {
      email: studentEmail,
      fullName: (session.studentName || 'Estudiante').toString().trim(),
      phoneNumber,
      phoneNumberPrefix: '+57',
      legalId: String(session.studentId || '123456789').trim(),
      legalIdType: 'CC',
    };

    return new Promise((resolve, reject) => {
      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents,
        reference,
        publicKey,
        signature: { integrity: signatureIntegrity },
        redirectUrl: 'https://transaction-redirect.wompi.co/check',
        customerData,
      });

      checkout.open((widgetResult) => {
        const transaction = widgetResult.transaction;
        if (transaction.status === 'APPROVED') {
          resolve({ transaction, reference, wompiData });
        } else {
          reject(new Error(`Pago ${transaction.status?.toLowerCase() || 'no aprobado'}. Intenta de nuevo.`));
        }
      });
    });
  }

  /**
   * Step 4: server-side confirmation → creates the session in the DB.
   */
  async function confirmPaymentOnServer({ transaction, reference, wompiData }) {
    const token = localStorage.getItem('calico_auth_token');
    const transactionData = {
      id: transaction.id,
      reference: transaction.reference || reference,
      status: transaction.status,
      amount_in_cents: transaction.amountInCents,
      metadata: wompiData.metadata,
    };

    const response = await fetch('/api/payments/confirm-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ reference, transactionData }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Error confirmando el pago');
    return data.result;
  }

  /**
   * Step 5: upload cached files to S3 and register them with the new session.
   * Non-blocking — if uploads fail, the session remains valid and the user can
   * retry from the success screen.
   */
  async function uploadAttachmentsIfAny(sessionId) {
    if (!fileUpload.hasPendingUploads) return { ok: true };
    setStep('uploading');
    return fileUpload.uploadToSession(sessionId);
  }

  /**
   * Orchestrates the full flow. Each step logs and aborts cleanly on failure.
   */
  const handleReserveAndPay = async () => {
    setError('');
    if (!validateForm()) return;

    try {
      if (!(await checkInfra())) return;

      setStep('paying');
      const paid = await openWompiWidget();

      const result = await confirmPaymentOnServer(paid);
      const sessionId = result?.session?.id;
      setCreatedSessionId(sessionId);

      if (sessionId) {
        const uploadResult = await uploadAttachmentsIfAny(sessionId);
        if (!uploadResult.ok) {
          // Payment succeeded, but upload failed. Surface an error without
          // cancelling the booking — the user can retry per-file.
          setError(uploadResult.error || 'La sesión fue creada pero los archivos no se subieron. Puedes reintentarlos.');
          setStep('idle');
          return;
        }
      }

      setStep('done');
      onClose();
      onConfirm({ transaction: paid.transaction, reference: paid.reference, result });
    } catch (err) {
      console.error('[SessionConfirmationModal]:', err);
      setError(err.message || 'Error procesando la reserva.');
      setStep('idle');
    }
  };

  const handleRetryUpload = async (fileId) => {
    if (!createdSessionId) return;
    const res = await fileUpload.retryFile(createdSessionId, fileId);
    if (!res.ok) setError(res.error);
  };

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
          <button onClick={onClose} className="mr-3 text-gray-600 hover:text-gray-900" disabled={isBusy}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{t('availability.confirmationModal.title')}</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Course */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('availability.confirmationModal.course')}</h3>
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

          {/* Tutor */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('availability.confirmationModal.tutor')}</h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-lg">‍</span>
              </div>
              <p className="font-medium text-gray-900">{session.tutorName || session.tutorEmail}</p>
            </div>
          </div>

          {/* Session Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('availability.confirmationModal.sessionDetails')}</h3>
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

          {/* Email for Google Meet */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('availability.confirmationModal.emailForMeet')}</h3>
            <p className="text-xs text-gray-500 mb-2">{t('availability.confirmationModal.emailHint')}</p>
            <input
              type="email"
              value={studentEmail}
              readOnly
              className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-900 cursor-not-allowed"
            />
          </div>

          {/* Topics to Review (required) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              ¿Qué temas quieres repasar? <span className="text-red-500">*</span>
            </h3>
            <textarea
              value={topicsToReview}
              onChange={(e) => {
                if (e.target.value.length <= TOPICS_MAX_LENGTH) {
                  setTopicsToReview(e.target.value);
                }
              }}
              placeholder="Ej: Necesito ayuda con las integrales definidas del capítulo 5 y el taller adjunto sobre series de Taylor..."
              rows={4}
              disabled={isBusy}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#FF8C00]/30 focus:border-[#FF8C00] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className={`text-xs mt-1 text-right ${topicsToReview.length > TOPICS_MAX_LENGTH * 0.9 ? 'text-orange-500' : 'text-gray-400'}`}>
              {topicsToReview.length}/{TOPICS_MAX_LENGTH}
            </p>
          </div>

          {/* File Attachments (optional) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Material de apoyo <span className="text-xs font-normal text-gray-400">(opcional)</span>
            </h3>
            <p className="text-xs text-gray-500 mb-2">
              Sube talleres, tareas o material que quieras revisar en la tutoría.
            </p>
            <FileUploader
              fileUpload={fileUpload}
              maxFiles={5}
              disabled={isBusy && step !== 'uploading'}
              onRetry={createdSessionId ? handleRetryUpload : null}
            />
          </div>

          {/* Payment Information - Wompi */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Pago Seguro con Wompi
            </h3>
            <div className="space-y-2">
              <p className="text-sm text-blue-800">
                Para confirmar tu reserva, debes realizar el pago de <strong>${session.price ? session.price.toLocaleString() : '25,000'} COP</strong>.
              </p>
              <p className="text-xs text-blue-700">
                Serás redirigido a la pasarela de pagos segura de Wompi. Aceptamos tarjetas, PSE, Nequi y Bancolombia.
              </p>
            </div>
          </div>

          {/* Cost */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('availability.confirmationModal.cost')}</h3>
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">${session.price ? session.price.toLocaleString() : '25,000'} COP</span>
              <span className="text-sm text-gray-500">{t('availability.confirmationModal.total')}</span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleReserveAndPay}
            disabled={isBusy || !topicsToReview.trim()}
            className="w-full py-3 bg-[#FF8C00] text-white font-semibold rounded-lg hover:bg-[#e07d00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isBusy ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {step === 'checking' && 'Verificando servicios…'}
                {step === 'paying' && 'Procesando pago…'}
                {step === 'uploading' && 'Subiendo archivos…'}
                {step === 'idle' && confirmLoading && 'Procesando…'}
                {step === 'done' && 'Listo'}
              </>
            ) : (
              'Reservar y pagar'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="w-full py-3 bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t('availability.confirmationModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
