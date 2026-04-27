"use client";

import React, { useState, useEffect } from "react";
import { PaymentService } from "../../services/core/PaymentService";
import { useI18n } from "../../../lib/i18n";
import { useFileUpload } from "../../hooks/useFileUpload";
import FileUploader from "../FileUploader/FileUploader";

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
  const [isPaymentInitiated, setIsPaymentInitiated] = useState(false);
  const [paymentApprovedMsg, setPaymentApprovedMsg] = useState('');
  const [topicsToReview, setTopicsToReview] = useState('');
  const fileUpload = useFileUpload();

  const TOPICS_MAX_LENGTH = 2000;

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

  const handleWompiPayment = async () => {
    if (!isValidEmail(studentEmail)) {
      setError(t('availability.confirmationModal.errors.invalidEmail'));
      return;
    }

    // Validate topicsToReview
    if (!topicsToReview.trim()) {
      setError('Debes describir qué temas quieres repasar.');
      return;
    }

    setError('');
    setIsPaymentInitiated(true);

    try {
      // Upload pending files before payment (if any are pending/error)
      const hasPending = fileUpload.files.some((f) => f.status === 'pending' || f.status === 'error');
      if (hasPending) {
        await fileUpload.uploadFiles();
      }

      // Validar que session tenga todos los datos necesarios
      if (!session || !session.tutorId || !session.studentId) {
        setError('Faltan datos de la sesión. Por favor recarga e intenta nuevamente.');
        setIsPaymentInitiated(false);
        return;
      }

      const courseId = session.courseId;
      if (!courseId) {
        console.error('[SessionConfirmationModal] Missing courseId - session:', session);
        setError('No se pudo determinar el curso. Por favor, intenta nuevamente.');
        setIsPaymentInitiated(false);
        return;
      }

      // Validar timestamps
      if (!session.scheduledDateTime || !session.endDateTime) {
        setError('Las fechas de la sesión no son válidas. Por favor intenta nuevamente.');
        setIsPaymentInitiated(false);
        return;
      }

      // 1. Crear payment intent (sin session aún)
      // Session será creada automáticamente en el webhook cuando Wompi confirme el pago
      const amountInCents = (session.price || 25000) * 100;

      // Calculate duration in minutes
      const startTime = new Date(session.scheduledDateTime);
      const endTime = new Date(session.endDateTime);
      const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

      if (durationMinutes <= 0) {
        setError('La duración de la sesión no es válida. Por favor intenta nuevamente.');
        setIsPaymentInitiated(false);
        return;
      }

      // Ensure timestamps are ISO UTC strings for proper timezone handling
      let startISOString = session.scheduledDateTime;
      let endISOString = session.endDateTime;

      // If they're Date objects, convert to ISO strings
      if (session.scheduledDateTime instanceof Date) {
        startISOString = session.scheduledDateTime.toISOString();
      } else if (typeof session.scheduledDateTime === 'string' && !session.scheduledDateTime.endsWith('Z')) {
        // If it's a local datetime string without Z, parse and convert to UTC ISO
        const dt = new Date(session.scheduledDateTime);
        startISOString = dt.toISOString();
      }

      if (session.endDateTime instanceof Date) {
        endISOString = session.endDateTime.toISOString();
      } else if (typeof session.endDateTime === 'string' && !session.endDateTime.endsWith('Z')) {
        const dt = new Date(session.endDateTime);
        endISOString = dt.toISOString();
      }

      // Only include successfully uploaded files in the payment metadata
      const successAttachments = fileUpload.uploadedFiles;

      const paymentInitData = {
        tutorId: session.tutorId,
        studentId: session.studentId,
        courseId: courseId,
        amount: amountInCents,
        durationMinutes,
        startTimestamp: startISOString,
        endTimestamp: endISOString,
        topicsToReview: topicsToReview.trim(),
        attachments: successAttachments,
      };

      const response = await PaymentService.createWompiPayment(paymentInitData);
      const wompiData = response.data || response;
      
      console.log('Respuesta del Backend (Wompi):', wompiData);

      // El backend genera la firma (integritySecret nunca debe estar en el cliente)
      const reference = wompiData.reference;
      const publicKey = wompiData.public_key || wompiData.publicKey;
      const signatureIntegrity = wompiData.signature;

      if (!reference || !publicKey || !signatureIntegrity) {
        throw new Error('El servidor no retornó los datos de pago correctamente. Verifica la configuración de Wompi.');
      }

      // Validar y preparar datos del cliente para Wompi
      const fullName = (session.studentName || 'Estudiante').toString().trim();
      let phoneNumber = (session.studentPhone || '3000000000').toString().trim();
      // Remover caracteres especiales del teléfono (solo dígitos)
      phoneNumber = phoneNumber.replace(/\D/g, '');
      if (!phoneNumber) phoneNumber = '3000000000';
      
      const legalId = String(session.studentId || '123456789').trim();

      const customerDataForWidget = {
        email: studentEmail,
        fullName: fullName,
        phoneNumber: phoneNumber,
        phoneNumberPrefix: '+57',
        legalId: legalId,
        legalIdType: 'CC'
      };

      console.log('=== DATOS ENVIADOS A WOMPI WIDGET ===');
      console.log('Currency:', 'COP');
      console.log('Amount (cents):', amountInCents);
      console.log('Reference:', reference);
      console.log('Public Key:', publicKey);
      console.log('Signature (integrity):', signatureIntegrity);
      console.log('Customer Data:', JSON.stringify(customerDataForWidget, null, 2));

      // 2. Configurar el Widget
      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents: amountInCents,
        reference: reference,
        publicKey: publicKey, 
        signature: { integrity: signatureIntegrity },
        redirectUrl: 'https://transaction-redirect.wompi.co/check',
        customerData: customerDataForWidget
      });

      // 3. Abrir el Widget
      checkout.open((result) => {
        const transaction = result.transaction;
        console.log("Payment status from Wompi:", transaction.status);
        
        if (transaction.status === 'APPROVED') {
          setPaymentApprovedMsg('Pago exitoso');
          confirmPaymentAndCreateSession(transaction, reference, wompiData);
        } else if (transaction.status === 'DECLINED') {
          setError('Pago rechazado (fondos insuficientes u otro motivo).');
          setIsPaymentInitiated(false);
        } else if (transaction.status === 'ERROR') {
          setError('Error procesando el pago, intenta nuevamente.');
          setIsPaymentInitiated(false);
        }
      });

    } catch (err) {
      console.error('Error iniciando pago:', err);
      setError('Error al iniciar el pago con Wompi. Intenta nuevamente.');
      setIsPaymentInitiated(false);
    }
  };

  /**
   * Confirmar el pago en el servidor y crear sesión
   * Esto se llama cuando Wompi widget retorna APPROVED
   */
  const confirmPaymentAndCreateSession = async (transaction, reference, wompiData) => {
    try {
      const token = localStorage.getItem('calico_auth_token');
      
      console.log('Confirmando pago en servidor...');
      console.log('Metadata que se envía:', wompiData.metadata);

      // Construir transactionData con la metadata que tenemos del servidor
      const transactionData = {
        id: transaction.id,
        reference: transaction.reference || reference,
        status: transaction.status,
        // Wompi widget returns snake_case; fall back to the intent amount we already know
        amount_in_cents: transaction.amount_in_cents ?? transaction.amountInCents ?? wompiData.amountInCents,
        metadata: wompiData.metadata,
      };

      console.log('TransactionData a enviar:', JSON.stringify(transactionData, null, 2));

      const response = await fetch('/api/payments/confirm-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          reference,
          transactionData,
        }),
      });

      const result = await response.json();

      console.log('Respuesta del servidor:', result);

      if (result.success) {
        console.log(' Sesión creada exitosamente:', result.result);
        onClose(); // Cerrar modal
        // Notificar al padre sobre el pago exitoso
        onConfirm({
          transaction,
          reference: wompiData.reference || reference,
          result: result.result,
        });
      } else {
        throw new Error(result.error || 'Error confirmando el pago');
      }
    } catch (err) {
      console.error('Error confirmando pago:', err);
      setError(err?.message || 'Error procesando el pago, intenta nuevamente.');
      setIsPaymentInitiated(false);
    }
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
          <button onClick={onClose} className="mr-3 text-gray-600 hover:text-gray-900" disabled={confirmLoading || isPaymentInitiated}>
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
              disabled={isPaymentInitiated}
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
              disabled={isPaymentInitiated}
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

          {/* Payment approved confirmation */}
          {paymentApprovedMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700 font-medium">{paymentApprovedMsg}</p>
            </div>
          )}

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
            onClick={handleWompiPayment}
            disabled={
              confirmLoading ||
              isPaymentInitiated ||
              !topicsToReview.trim() ||
              fileUpload.isUploading
            }
            className="w-full py-3 bg-[#FF8C00] text-white font-semibold rounded-lg hover:bg-[#e07d00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {confirmLoading || isPaymentInitiated ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </>
            ) : fileUpload.isUploading ? (
              'Subiendo archivos...'
            ) : (
              'Pagar con Wompi'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={confirmLoading || isPaymentInitiated}
            className="w-full py-3 bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t('availability.confirmationModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
