"use client";

import React, { useState, useEffect } from "react";
import { PaymentService } from "../../services/core/PaymentService";
import { useI18n } from "../../../lib/i18n";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";

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
    
    setError('');
    setIsPaymentInitiated(true);

    try {
      const courseId = session.courseId;
      if (!courseId) {
        setError('No se pudo determinar el curso. Por favor, intenta nuevamente.');
        setIsPaymentInitiated(false);
        return;
      }

      // 0. Crear tutoring session
      const sessionData = {
        tutorId: session.tutorId,
        courseId: courseId,
        startTimestamp: session.scheduledDateTime,
        endTimestamp: session.endDateTime,
      }

      console.log('Creando sesión de tutoría con datos!!!!:', sessionData);

      const createdSession = await TutoringSessionService.createSession(sessionData);
      if (!createdSession.success || !createdSession.session) {
        setError(createdSession.error || 'No se pudo crear la sesión. Por favor, intenta nuevamente.');
        setIsPaymentInitiated(false);
        return;
      }
      const sessionPayload = createdSession.session;
      console.log('Sesión de tutoría creada:', sessionPayload);

      // 1. Obtener datos de pago del backend (Referencia y Firma)
      const amountInCents = (session.price || 25000) * 100; 
      
      const paymentInitData = {
        sessionId: sessionPayload.id,
        tutorId: session.tutorId,
        studentId: session.studentId,
        courseId: courseId,
        amount: amountInCents,
        startTimestamp: session.scheduledDateTime,
        endTimestamp: session.endDateTime,
      };

      console.log('Iniciando pago con datos:', paymentInitData);

      const response = await PaymentService.createWompiPayment(paymentInitData);
      const wompiData = response.data || response;
      
      console.log('Respuesta del Backend (Wompi):', wompiData);

      // Intentar obtener los valores con diferentes nombres de propiedad (camelCase o snake_case)
      const reference = wompiData.reference || wompiData.payment_reference || wompiData.id || `TEST-${Date.now()}`;
      
      // Usar la llave pública del backend o del .env
      const publicKey = wompiData.publicKey || wompiData.public_key || process.env.WOMPI_PUBLIC_KEY;
      console.log(publicKey)

      // Generar firma localmente si el backend no la envía (SOLO PARA PRUEBAS)
      let signatureIntegrity = wompiData.signature || wompiData.integrity_signature || wompiData.hash;

      if (!signatureIntegrity) {
        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
        const stringToSign = `${reference}${amountInCents}COP${integritySecret}`;
        
        // Generar SHA-256 usando Web Crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(stringToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        signatureIntegrity = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        console.log('Firma generada localmente:', signatureIntegrity);
      }

      console.log('Datos usados para Wompi:', { reference, publicKey, signatureIntegrity });

      if (!publicKey) {
        throw new Error(`No se encontró la Llave Pública de Wompi. Verifica tu archivo .env.`);
      }

      // 2. Configurar el Widget
      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents: amountInCents,
        reference: reference,
        publicKey: publicKey, 
        signature: { integrity: signatureIntegrity }, 
        redirectUrl: null, 
        customerData: {
          email: studentEmail,
          fullName: session.studentName || 'Estudiante', 
          phoneNumber: session.studentPhone || '3000000000', 
          phoneNumberPrefix: '+57',
          legalId: session.studentId || '123456789',
          legalIdType: 'CC'
        }
      });

      // 3. Abrir el Widget
      checkout.open((result) => {
        const transaction = result.transaction;
        
        if (transaction.status === 'APPROVED') {
          // Pago exitoso -> Proceder a confirmar la reserva
          console.log('Pago aprobado:', transaction);
          onConfirm({
            transaction,
            tutoringSession: sessionPayload,
            paymentId: wompiData.reference || wompiData.payment_reference || reference,
          });
        } else if (transaction.status === 'DECLINED' || transaction.status === 'ERROR') {
          setError('El pago fue rechazado o ocurrió un error. Por favor intenta de nuevo.');
          setIsPaymentInitiated(false);
        }
        // Si es VOIDED o PENDING, manejar según corresponda
      });

    } catch (err) {
      console.error('Error iniciando pago:', err);
      setError('Error al iniciar el pago con Wompi. Intenta nuevamente.');
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
                <span className="text-lg">👨‍🏫</span>
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
            onClick={handleWompiPayment}
            disabled={confirmLoading || isPaymentInitiated}
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
