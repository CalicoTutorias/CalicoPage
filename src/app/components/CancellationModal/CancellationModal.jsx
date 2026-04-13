"use client";

import React, { useState } from "react";
import { AlertCircle, Loader2, Check } from "lucide-react";
import { useI18n } from "../../../lib/i18n";

/**
 * CancellationModal - 3-step session cancellation flow
 * Step 1: Confirmation
 * Step 2: Reason & Refund Method Selection
 * Step 3: Processing/Success
 */
export default function CancellationModal({ isOpen, onClose, session, onCancellationSuccess }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1); // 1, 2, or 3
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState(""); // 'llave', 'nequi', 'use_future_session'
  const [refundMethodDetails, setRefundMethodDetails] = useState(""); // Llave account, Nequi number, etc.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !session) return null;

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
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
    if (!reason.trim()) {
      setError(t("sessionDetails.cancellationModal.errors.reasonRequired") || "Please provide a cancellation reason");
      return;
    }

    if (!refundMethod) {
      setError(t("sessionDetails.cancellationModal.errors.methodRequired") || "Please select a refund method");
      return;
    }

    // Validate Llave requires details
    if (refundMethod === "llave" && !refundMethodDetails.trim()) {
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
          reason: reason.trim(),
          refundMethod: refundMethod,
          refundMethodDetails: refundMethodDetails.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel session");
      }

      setSuccess(true);
      setStep(3);

      // Callback after success
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{
        backgroundColor: "rgba(17, 24, 39, 0.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 px-6 py-4 border-b border-red-100">
          <h2 className="text-lg font-semibold text-red-900">
            {t("sessionDetails.cancellationModal.title") || "Cancel Session"}
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col">
          {step === 1 && (
            <>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                  <p className="text-gray-700">
                    {t("sessionDetails.cancellationModal.confirmTitle") || "Are you sure you want to cancel this session?"}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-semibold text-gray-700">{t("common.course")}: </span>
                    {session.course?.name || "N/A"}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-gray-700">{t("common.tutor")}: </span>
                    {session.tutor?.name || "N/A"}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-gray-700">{t("common.date")}: </span>
                    {new Date(session.startTimestamp).toLocaleDateString("es-CO")}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                >
                  {t("common.cancel") || "Cancel"}
                </button>
                <button
                  onClick={handleProceedToStep2}
                  className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
                >
                  {t("common.continue") || "Continue"}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    {t("sessionDetails.cancellationModal.reasonLabel") || "Cancellation reason"} *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("sessionDetails.cancellationModal.reasonPlaceholder") || "Describe why you're cancelling..."}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    {t("sessionDetails.cancellationModal.refundMethodLabel") || "Refund method"} *
                  </label>
                  <div className="space-y-3">
                    {/* Llave Option */}
                    <label className="flex items-start gap-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
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
                        <p className="font-semibold text-gray-900">
                          {t("sessionDetails.cancellationModal.llave.title") || "Llave (Bre-B)"} *
                        </p>
                        <p className="text-xs text-gray-600">
                          {t("sessionDetails.cancellationModal.llave.subtitle") || "Colombian instant transfer"}
                        </p>
                      </div>
                    </label>

                    {/* Nequi Option */}
                    <label className="flex items-start gap-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
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
                        <p className="font-semibold text-gray-900">
                          {t("sessionDetails.cancellationModal.nequi.title") || "Nequi"}
                        </p>
                        <p className="text-xs text-gray-600">
                          {t("sessionDetails.cancellationModal.nequi.subtitle") || "Mobile wallet transfer"}
                        </p>
                      </div>
                    </label>

                    {/* Future Session Option */}
                    <label className="flex items-start gap-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
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
                        <p className="font-semibold text-gray-900">
                          {t("sessionDetails.cancellationModal.useFutureSession.title") || "Credit for future sessions"}
                        </p>
                        <p className="text-xs text-gray-600">
                          {t("sessionDetails.cancellationModal.useFutureSession.subtitle") || "Use as credit for another session"}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Conditional Details Field - Only show for llave and nequi */}
                {refundMethod && refundMethod !== "use_future_session" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                )}

                <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  {t("sessionDetails.cancellationModal.detailHint") || "This will help us process your refund faster"}
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleBack}
                  className="flex-1 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {t("common.back") || "Back"}
                </button>
                <button
                  onClick={handleCancelSession}
                  disabled={loading || !reason.trim() || !refundMethod}
                  className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("sessionDetails.cancellationModal.processing") || "Cancelling..."}
                    </>
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
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("sessionDetails.cancellationModal.success") || "Cancellation Successful!"}
                </h3>
                <p className="text-sm text-gray-600 text-center">
                  {t("sessionDetails.cancellationModal.successMessage") || "Your session has been cancelled. Check your email for details."}
                </p>
              </div>

              <button
                onClick={handleCancel}
                className="w-full py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors mt-6"
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
