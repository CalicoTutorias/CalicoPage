"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CreditCard } from 'lucide-react';
import { PaymentService } from '../../services/core/PaymentService';
import { useFileUpload } from '../../hooks/useFileUpload';
import FileUploader from '../../components/FileUploader/FileUploader';

const TOPICS_MAX_LENGTH = 2000;

/**
 * Right column on desktop, bottom stack on mobile. Owns all transactional
 * state: topics text, file uploads, Wompi widget invocation, server-side
 * payment confirmation. The integrations (useFileUpload → S3 presigned URLs,
 * PaymentService.createWompiPayment, /api/payments/confirm-payment) are a
 * verbatim port of SessionConfirmationModal so behavior is identical.
 *
 * Validation rules:
 *   - "Pagar" is disabled until topics is non-empty (required field).
 *   - When topics is filled but no files attached, clicking "Pagar" first
 *     opens a soft confirmation asking if they want to attach material.
 */
export default function BookingForm({ session, onSuccess }) {
    const [topicsToReview, setTopicsToReview] = useState('');
    const [error, setError] = useState('');
    const [isPaymentInitiated, setIsPaymentInitiated] = useState(false);
    const [paymentApprovedMsg, setPaymentApprovedMsg] = useState('');
    const [showNoFilesConfirm, setShowNoFilesConfirm] = useState(false);

    const fileUpload = useFileUpload({ subject: session?.course });

    // Load Wompi widget script once on mount.
    useEffect(() => {
        const scriptId = 'wompi-widget-script';
        if (document.getElementById(scriptId)) return;
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://checkout.wompi.co/widget.js';
        script.async = true;
        document.body.appendChild(script);
    }, []);

    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const trimmedTopics = topicsToReview.trim();
    const hasFiles = fileUpload.files.length > 0;
    const emailOk = isValidEmail(session.studentEmail);
    const isFormValid = trimmedTopics.length > 0 && emailOk;
    const isCTABusy = isPaymentInitiated || fileUpload.isUploading;
    const isCTADisabled = isCTABusy || !isFormValid;

    const ctaLabel = useMemo(() => {
        if (isPaymentInitiated) return 'Procesando…';
        if (fileUpload.isUploading) return 'Subiendo archivos…';
        return 'Pagar con Wompi';
    }, [isPaymentInitiated, fileUpload.isUploading]);

    /** Click handler on the main CTA: enforces validation, then either opens
     *  the no-files dialog or proceeds straight to payment. */
    const handleCTAClick = () => {
        if (!trimmedTopics) {
            setError('Cuéntanos qué temas quieres repasar antes de continuar.');
            document.getElementById('topics-field')?.focus();
            return;
        }
        if (!emailOk) {
            setError('No tenemos un email válido en tu cuenta. Actualízalo desde tu perfil.');
            return;
        }
        setError('');
        if (!hasFiles) {
            setShowNoFilesConfirm(true);
            return;
        }
        proceedToPayment();
    };

    const focusUploader = () => {
        setShowNoFilesConfirm(false);
        const node = document.getElementById('file-uploader-section');
        if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const proceedToPayment = async () => {
        setShowNoFilesConfirm(false);
        setError('');
        setIsPaymentInitiated(true);

        try {
            if (!session?.tutorId || !session?.studentId) {
                setError('Faltan datos de la sesión. Recarga la página e intenta nuevamente.');
                setIsPaymentInitiated(false);
                return;
            }
            if (!session.courseId) {
                setError('No se pudo determinar el curso. Vuelve a buscar e intenta de nuevo.');
                setIsPaymentInitiated(false);
                return;
            }

            const startTime = new Date(session.scheduledDateTime);
            const endTime = new Date(session.endDateTime);
            const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));
            if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                setError('La duración de la sesión no es válida.');
                setIsPaymentInitiated(false);
                return;
            }

            const amountInCents = (session.price || 25000) * 100;
            // Upload any pending/failed files and use the RETURNED metadata.
            // (Reading fileUpload.uploadedFiles here is a stale-closure trap: it
            //  reflects the render before the upload finished, so the files the
            //  user just added would silently be dropped from the payment.)
            const successAttachments = await fileUpload.uploadFiles();

            const paymentInitData = {
                tutorId: session.tutorId,
                studentId: session.studentId,
                courseId: session.courseId,
                amount: amountInCents,
                durationMinutes,
                startTimestamp: startTime.toISOString(),
                endTimestamp: endTime.toISOString(),
                topicsToReview: trimmedTopics,
                attachments: successAttachments,
            };

            const response = await PaymentService.createWompiPayment(paymentInitData);
            const wompiData = response.data || response;

            const reference = wompiData.reference;
            const publicKey = wompiData.public_key || wompiData.publicKey;
            const signatureIntegrity = wompiData.signature;
            // The amount the widget charges MUST be the server's authoritative
            // amount — the integrity signature was computed for it. Using the
            // locally-estimated amount would make Wompi reject the transaction
            // (signature mismatch). The server prices the booking from the
            // course price × duration and ignores any client-sent amount.
            const serverAmountInCents = wompiData.amountInCents;

            if (!reference || !publicKey || !signatureIntegrity || !serverAmountInCents) {
                throw new Error('El servidor no retornó los datos de pago correctamente.');
            }

            const fullName = (session.studentName || 'Estudiante').toString().trim();
            let phoneNumber = (session.studentPhone || '3000000000').toString().trim().replace(/\D/g, '');
            if (!phoneNumber) phoneNumber = '3000000000';
            const legalId = String(session.studentId || '123456789').trim();

            const customerDataForWidget = {
                email: session.studentEmail,
                fullName,
                phoneNumber,
                phoneNumberPrefix: '+57',
                legalId,
                legalIdType: 'CC',
            };

            const checkout = new window.WidgetCheckout({
                currency: 'COP',
                amountInCents: serverAmountInCents,
                reference,
                publicKey,
                signature: { integrity: signatureIntegrity },
                redirectUrl: 'https://transaction-redirect.wompi.co/check',
                customerData: customerDataForWidget,
            });

            checkout.open((result) => {
                const transaction = result.transaction;
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
            console.error('[BookingForm] Error iniciando pago:', err);
            setError('Error al iniciar el pago con Wompi. Intenta nuevamente.');
            setIsPaymentInitiated(false);
        }
    };

    const confirmPaymentAndCreateSession = async (transaction, reference, wompiData) => {
        try {
            const token = localStorage.getItem('calico_auth_token');

            const transactionData = {
                id: transaction.id,
                reference: transaction.reference || reference,
                status: transaction.status,
                amount_in_cents:
                    transaction.amount_in_cents ?? transaction.amountInCents ?? wompiData.amountInCents,
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

            const result = await response.json();

            if (result.success) {
                onSuccess({
                    transaction,
                    reference: wompiData.reference || reference,
                    session: result.result?.session || result.result,
                });
            } else {
                throw new Error(result.error || 'Error confirmando el pago');
            }
        } catch (err) {
            console.error('[BookingForm] Error confirmando pago:', err);
            setError(err?.message || 'Error procesando el pago, intenta nuevamente.');
            setIsPaymentInitiated(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
            {/* Email para Google Meet — read only (comes from auth context) */}
            <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Email para Google Meet</h3>
                <p className="text-xs text-gray-500 mb-2">El link de la sesión llegará a este correo</p>
                <input
                    type="email"
                    value={session.studentEmail}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 cursor-not-allowed text-sm"
                />
            </div>

            {/* Topics — required */}
            <div>
                <label htmlFor="topics-field" className="block text-sm font-semibold text-gray-900 mb-1">
                    ¿Qué temas quieres repasar? <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                    Cuéntale al tutor en qué necesitas ayuda. Mientras más específico, mejor podrá prepararse.
                </p>
                <textarea
                    id="topics-field"
                    value={topicsToReview}
                    onChange={(e) => {
                        if (e.target.value.length <= TOPICS_MAX_LENGTH) {
                            setTopicsToReview(e.target.value);
                            if (e.target.value.trim() && error) setError('');
                        }
                    }}
                    placeholder="Ej: Necesito ayuda con las integrales definidas del capítulo 5 y el taller adjunto sobre series de Taylor..."
                    rows={5}
                    disabled={isPaymentInitiated}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#FF8C00]/30 focus:border-[#FF8C00] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p
                    className={`text-xs mt-1 text-right ${
                        topicsToReview.length > TOPICS_MAX_LENGTH * 0.9 ? 'text-orange-500' : 'text-gray-400'
                    }`}
                >
                    {topicsToReview.length}/{TOPICS_MAX_LENGTH}
                </p>
            </div>

            {/* Files — optional but encouraged */}
            <div id="file-uploader-section">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Material de apoyo <span className="text-xs font-normal text-gray-400">(opcional)</span>
                </h3>
                <p className="text-xs text-gray-500 mb-2">
                    Sube talleres, tareas o material que quieras revisar en la tutoría.
                </p>
                <FileUploader fileUpload={fileUpload} maxFiles={5} disabled={isPaymentInitiated} />
            </div>

            {/* Wompi info card */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Pago Seguro con Wompi
                </h3>
                <p className="text-sm text-blue-800 mb-1">
                    Total:{' '}
                    <strong>
                        {session.price ? `$${session.price.toLocaleString()} COP` : 'Calculando…'}
                    </strong>
                </p>
                <p className="text-xs text-blue-700">
                    Aceptamos tarjetas, PSE, Nequi y Bancolombia. El cobro se procesa al confirmar la sesión.
                </p>
            </div>

            {/* Status messages */}
            {paymentApprovedMsg && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-700 font-medium">{paymentApprovedMsg}</p>
                </div>
            )}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}
            {!trimmedTopics && !error && (
                <p className="text-xs text-gray-500 italic text-center">
                    Completa el campo &quot;¿Qué temas quieres repasar?&quot; para poder continuar.
                </p>
            )}

            {/* Primary CTA */}
            <button
                type="button"
                onClick={handleCTAClick}
                disabled={isCTADisabled}
                className="w-full py-3 bg-[#FF8C00] text-white font-semibold rounded-lg hover:bg-[#e07d00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
                {isCTABusy && (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                )}
                {ctaLabel}
            </button>

            {/* Soft confirmation when no files attached */}
            {showNoFilesConfirm && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                    style={{
                        backgroundColor: 'rgba(17, 24, 39, 0.45)',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowNoFilesConfirm(false);
                    }}
                >
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">¿Continuar sin material?</h3>
                        <p className="text-sm text-gray-600 mb-1">
                            No has adjuntado ningún archivo de apoyo.
                        </p>
                        <p className="text-sm text-gray-600 mb-5">
                            Subir tareas, talleres o material previo ayuda a tu tutor a preparar la sesión y aprovecharla mejor. Es opcional, pero suele mejorar mucho la experiencia.
                        </p>
                        <div className="flex flex-col-reverse sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={proceedToPayment}
                                className="flex-1 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-sm"
                            >
                                Continuar sin material
                            </button>
                            <button
                                type="button"
                                onClick={focusUploader}
                                className="flex-1 py-2.5 bg-[#FF8C00] text-white rounded-lg font-semibold hover:bg-[#e07d00] transition-colors text-sm"
                            >
                                Subir material
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
