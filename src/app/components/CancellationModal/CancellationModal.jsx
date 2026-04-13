"use client";

import React, { useState } from "react";
import { AlertCircle, Loader2, Check } from "lucide-react";

/**
 * CancellationModal - 3-step session cancellation flow
 * Step 1: Confirmation
 * Step 2: Reason & Refund Info
 * Step 3: Processing/Success
 */
export default function CancellationModal({ isOpen, onClose, session, onCancellationSuccess }) {
  const [step, setStep] = useState(1); // 1, 2, or 3
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState(session?.price || 0);
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
    setRefundAmount(session?.price || 0);
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
      setError("Please provide a cancellation reason");
      return;
    }

    if (refundAmount < 0 || refundAmount > (session?.price || 0)) {
      setError("Refund amount must be between 0 and the session price");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${session.id}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          refundAmount: Math.round(refundAmount),
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
          <h2 className="text-lg font-semibold text-red-900">Cancelar Sesión</h2>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col">
          {step === 1 && (
            <>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                  <p className="text-gray-700">
                    ¿Estás seguro de que deseas cancelar esta sesión?
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-semibold text-gray-700">Materia: </span>
                    {session.course?.name || "N/A"}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-gray-700">Tutor: </span>
                    {session.tutor?.name || "N/A"}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-gray-700">Fecha: </span>
                    {new Date(session.startTimestamp).toLocaleDateString("es-CO")}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleProceedToStep2}
                  className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
                >
                  Continuar
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Motivo de la cancelación *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe por qué cancelas esta sesión..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                    rows={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Monto del reembolso (COP) *
                  </label>
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    max={session?.price || 0}
                    min={0}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Precio original: ${(session?.price || 0).toLocaleString("es-CO")}
                  </p>
                </div>

                <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  💡 Calico utilizará esta información para procesar tu reembolso
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
                  Atrás
                </button>
                <button
                  onClick={handleCancelSession}
                  disabled={loading || !reason.trim()}
                  className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cancelando...
                    </>
                  ) : (
                    "Confirmar Cancelación"
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
                  ¡Cancelación Exitosa!
                </h3>
                <p className="text-sm text-gray-600 text-center">
                  Tu sesión ha sido cancelada. Revisa tu correo para más detalles.
                </p>
              </div>

              <button
                onClick={handleCancel}
                className="w-full py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors mt-6"
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
