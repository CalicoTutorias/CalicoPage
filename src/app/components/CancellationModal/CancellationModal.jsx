"use client";

import React, { useState, useEffect } from "react";
import { AlertCircle, Loader2, Check } from "lucide-react";
import { useI18n } from "../../../lib/i18n";

/**
 * CancellationModal - Session cancellation flow
 *
 * Student cancels (not tutor canceled): reason + refund method
 * Tutor cancels: reason only
 * Student after tutor canceled: refund method only
 */
export default function CancellationModal({ isOpen, onClose, session, onCancellationSuccess, currentUser }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [refundMethodDetails, setRefundMethodDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [isTutor, setIsTutor] = useState(false);
  const [tutorCancelled, setTutorCancelled] = useState(false);
  const [refundOnly, setRefundOnly] = useState(false);

useEffect(() => {
    if (isOpen && session && currentUser) {
      const tutorId = session.tutorId;
      const userId = currentUser.uid || currentUser.id;
      const isCurrentUserTutor = userId === tutorId || String(userId) === String(tutorId);
      setIsTutor(isCurrentUserTutor);

      const status = session.status || "";
      const isCanceled = status.toLowerCase() === 'canceled';
      const hasRefundMethod = !!session.refundMethod;
      const wasCanceledByTutor = isCanceled && session.cancelledBy && (String(session.cancelledBy) === String(tutorId));

      // Simple check: if canceled AND no refund method → student needs to provide refund
      const shouldSkipConfirm = isCanceled && !hasRefundMethod;

      setTutorCancelled(wasCanceledByTutor);
      setRefundOnly(shouldSkipConfirm);

      if (shouldSkipConfirm) {
        setStep(2);
      } else {
        setStep(1);
      }
    }
  }, [isOpen, session, currentUser]);

  if (!isOpen || !session) return null;

  const handleBack = () => {
    if (refundOnly) {
      onClose();
    } else if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCancel = () => {
    setStep(1);
    setReason("");
    setRefundMethod("");
    setRefundMethodDetails("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleProceedToStep2 = () => {
    setStep(2);
    setError(null);
  };

  const handleCancelSession = async () => {
    // Validate based on mode
    if (!isTutor && !refundOnly && !reason.trim()) {
      setError(t("sessionDetails.cancellationModal.errors.reasonRequired") || "Please provide a cancellation reason");
      return;
    }

    if (!refundOnly && !isTutor && !refundMethod) {
      setError(t("sessionDetails.cancellationModal.errors.methodRequired") || "Please select a refund method");
      return;
    }

    if (!refundOnly && refundMethod === "llave" && !refundMethodDetails.trim()) {
      setError(t("sessionDetails.cancellationModal.llave.detailRequired") || "Llave account details are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('calico_auth_token');
      const response = await fetch(`/api/sessions/${session.id}/cancel`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          ...(reason.trim() && { reason: reason.trim() }),
          ...(refundMethod && { refundMethod }),
          ...(refundMethodDetails.trim() && { refundMethodDetails: refundMethodDetails.trim() }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel session");
      }

      setSuccess(true);
      setStep(3);

      if (onCancellationSuccess) {
        setTimeout(() => {
          onCancellationSuccess(data.session);
        }, 2000);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getStep2Title = () => {
    if (refundOnly) {
      return t("sessionDetails.cancellationModal.refundMethodOnlyTitle") || "Select refund method";
    }
    if (isTutor) {
      return t("sessionDetails.cancellationModal.tutorReasonTitle") || "Cancellation reason";
    }
    return t("sessionDetails.cancellationModal.reasonLabel") || "Cancellation reason";
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{
        backgroundColor: "var(--modal-backdrop)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${refundOnly ? 'bg-[var(--calico-info-soft)] border-[var(--calico-info-soft)]' : 'bg-[var(--calico-danger-soft)] border-[var(--calico-danger-soft)]'}`}>
          <h2 className={`text-lg font-semibold ${refundOnly ? 'text-[var(--calico-info-text)]' : 'text-[var(--calico-danger-strong)]'}`}>
            {refundOnly
              ? (t("sessionDetails.cancellationModal.refundMethodOnlyTitle") || "Select refund method")
              : (t("sessionDetails.cancellationModal.title") || "Cancel Session")
            }
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col">
          {step === 1 && !refundOnly && (
            <>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-[var(--calico-danger)]" />
                  <p className="text-[var(--calico-body-muted)]">
                    {t("sessionDetails.cancellationModal.confirmTitle") || "Are you sure you want to cancel this session?"}
                  </p>
                </div>
                <div className="bg-[var(--calico-slate-50)] rounded-lg p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-semibold text-[var(--calico-ink)]">{t("common.course")}: </span>
                    {session.course?.name || "N/A"}
                  </p>
                  {isTutor ? (
                    <p className="text-sm">
                      <span className="font-semibold text-[var(--calico-ink)]">{t("common.student") || "Student"}: </span>
                      {session.participants?.[0]?.student?.name || "N/A"}
                    </p>
                  ) : (
                    <p className="text-sm">
                      <span className="font-semibold text-[var(--calico-ink)]">{t("common.tutor")}: </span>
                      {session.tutor?.name || "N/A"}
                    </p>
                  )}
                  <p className="text-sm">
                    <span className="font-semibold text-[var(--calico-ink)]">{t("common.date")}: </span>
                    {new Date(session.startTimestamp).toLocaleDateString("es-CO")}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2 bg-[var(--calico-slate-200)] text-[var(--calico-ink)] font-semibold rounded-lg hover:bg-[var(--calico-slate-300)] transition-colors"
                >
                  {t("common.cancel") || "Cancel"}
                </button>
                <button
                  onClick={handleProceedToStep2}
                  className="flex-1 py-2 bg-[var(--calico-danger)] text-white font-semibold rounded-lg hover:bg-[var(--calico-danger-strong)] transition-colors"
                >
                  {t("common.continue") || "Continue"}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex-1 space-y-4">
                {/* Reason field - for student cancellation (not refund only) */}
                {!isTutor && !refundOnly && (
                  <div>
                    <label className="block text-sm font-semibold text-[var(--calico-ink)] mb-2">
                      {t("sessionDetails.cancellationModal.reasonLabel") || "Cancellation reason"} *
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("sessionDetails.cancellationModal.reasonPlaceholder") || "Describe why you're cancelling..."}
                      className="w-full px-4 py-2 border border-[var(--calico-slate-300)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--calico-danger)] resize-none"
                      rows={3}
                    />
                  </div>
                )}

                {/* Reason for tutor */}
                {isTutor && (
                  <div>
                    <label className="block text-sm font-semibold text-[var(--calico-ink)] mb-2">
                      {t("sessionDetails.cancellationModal.tutorReasonLabel") || "Why are you canceling?"} *
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("sessionDetails.cancellationModal.tutorReasonPlaceholder") || "Explain why you need to cancel..."}
                      className="w-full px-4 py-2 border border-[var(--calico-slate-300)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--calico-danger)] resize-none"
                      rows={3}
                    />
                    <p className="text-xs text-[var(--calico-body-muted)] mt-2 bg-[var(--calico-info-soft)] border border-[var(--calico-info-soft)] rounded-lg p-3">
                      {t("sessionDetails.cancellationModal.tutorCancelHint") || "The student will be notified and can select a refund method."}
                    </p>
                  </div>
                )}

                {/* Refund Method - student cancellation OR refund only */}
                {((!isTutor && !refundOnly) || refundOnly) && (
                  <div>
                    <label className="block text-sm font-semibold text-[var(--calico-ink)] mb-3">
                      {t("sessionDetails.cancellationModal.refundMethodLabel") || "Refund method"} *
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 p-3 border border-[var(--calico-slate-300)] rounded-lg hover:bg-[var(--calico-slate-50)] cursor-pointer">
                        <input
                          type="radio"
                          name="refundMethod"
                          value="llave"
                          checked={refundMethod === "llave"}
                          onChange={(e) => {
                            setRefundMethod(e.target.value);
                            setRefundMethodDetails("");
                            setError(null);
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-[var(--calico-ink)]">
                            {t("sessionDetails.cancellationModal.llave.title") || "Llave (Bre-B)"} *
                          </p>
                          <p className="text-xs text-[var(--calico-body-muted)]">
                            {t("sessionDetails.cancellationModal.llave.subtitle") || "Colombian instant transfer"}
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 border border-[var(--calico-slate-300)] rounded-lg hover:bg-[var(--calico-slate-50)] cursor-pointer">
                        <input
                          type="radio"
                          name="refundMethod"
                          value="nequi"
                          checked={refundMethod === "nequi"}
                          onChange={(e) => {
                            setRefundMethod(e.target.value);
                            setRefundMethodDetails("");
                            setError(null);
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-[var(--calico-ink)]">
                            {t("sessionDetails.cancellationModal.nequi.title") || "Nequi"}
                          </p>
                          <p className="text-xs text-[var(--calico-body-muted)]">
                            {t("sessionDetails.cancellationModal.nequi.subtitle") || "Mobile wallet transfer"}
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 border border-[var(--calico-slate-300)] rounded-lg hover:bg-[var(--calico-slate-50)] cursor-pointer">
                        <input
                          type="radio"
                          name="refundMethod"
                          value="use_future_session"
                          checked={refundMethod === "use_future_session"}
                          onChange={(e) => {
                            setRefundMethod(e.target.value);
                            setRefundMethodDetails("");
                            setError(null);
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-[var(--calico-ink)]">
                            {t("sessionDetails.cancellationModal.useFutureSession.title") || "Credit for future sessions"}
                          </p>
                          <p className="text-xs text-[var(--calico-body-muted)]">
                            {t("sessionDetails.cancellationModal.useFutureSession.subtitle") || "Use as credit for another session"}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* Conditional Details Field */}
                {((!isTutor && !refundOnly) || refundOnly) && refundMethod && refundMethod !== "use_future_session" && (
                  <div>
                    <label className="block text-sm font-semibold text-[var(--calico-ink)] mb-2">
                      {t(`sessionDetails.cancellationModal.${refundMethod}.detailLabel`) || "Details"}
                      {refundMethod === "llave" && " *"}
                    </label>
                    <input
                      type="text"
                      value={refundMethodDetails}
                      onChange={(e) => {
                        setRefundMethodDetails(e.target.value);
                        setError(null);
                      }}
                      placeholder={t(`sessionDetails.cancellationModal.${refundMethod}.detailPlaceholder`) || "Enter details"}
                      className="w-full px-4 py-2 border border-[var(--calico-slate-300)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--calico-danger)]"
                    />
                  </div>
                )}

                {!isTutor && !refundOnly && (
                  <p className="text-xs text-[var(--calico-body-muted)] bg-[var(--calico-info-soft)] border border-[var(--calico-info-soft)] rounded-lg p-3">
                    {t("sessionDetails.cancellationModal.detailHint") || "This will help us process your refund faster"}
                  </p>
                )}

                {refundOnly && (
                  <p className="text-xs text-[var(--calico-body-muted)] bg-[var(--calico-info-soft)] border border-[var(--calico-info-soft)] rounded-lg p-3">
                    {t("sessionDetails.cancellationModal.detailHint") || "This will help us process your refund faster"}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-[var(--calico-danger-soft)] border border-[var(--calico-danger-soft)] rounded-lg p-3 mt-4">
                  <p className="text-sm text-[var(--calico-danger-strong)]">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleBack}
                  className="flex-1 py-2 bg-[var(--calico-slate-200)] text-[var(--calico-ink)] font-semibold rounded-lg hover:bg-[var(--calico-slate-300)] transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {refundOnly ? "Cerrar" : (t("common.back") || "Back")}
                </button>
                <button
                  onClick={handleCancelSession}
                  disabled={loading || (!isTutor && !refundOnly && (!reason.trim() || !refundMethod)) || (refundOnly && !refundMethod)}
                  className={`flex-1 py-2 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${refundOnly ? 'bg-[var(--calico-blue-tutor)] text-white hover:bg-[var(--calico-blue-tutor-dark)]' : 'bg-[var(--calico-danger)] text-white hover:bg-[var(--calico-danger-strong)]'}`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("sessionDetails.cancellationModal.processing") || "Processing..."}
                    </>
                  ) : refundOnly ? (
                    t("sessionDetails.cancellationModal.confirmRefundBtn") || "Confirm"
                  ) : (
                    t("sessionDetails.cancellationModal.confirmBtn") || "Confirm Cancellation"
                  )}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-[var(--calico-green-success-soft)] rounded-full flex items-center justify-center mb-4">
                  <Check className="w-8 h-8 text-[var(--calico-green-success-dark)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--calico-ink)] mb-2">
                  {t("sessionDetails.cancellationModal.success") || "Cancellation Successful!"}
                </h3>
                <p className="text-sm text-[var(--calico-body-muted)] text-center">
                  {isTutor
                    ? (t("sessionDetails.cancellationModal.tutorSuccessMessage") || "The student has been notified to select a refund method.")
                    : (t("sessionDetails.cancellationModal.successMessage") || "Your session has been cancelled. Check your email for details.")}
                </p>
              </div>

              <button
                onClick={handleCancel}
                className="w-full py-2 bg-[var(--calico-orange)] text-white font-semibold rounded-lg hover:bg-[var(--calico-orange-strong)] transition-colors mt-6"
              >
                {t("common.close") || "Close"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
