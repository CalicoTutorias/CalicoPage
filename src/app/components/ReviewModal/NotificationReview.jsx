"use client";

import React from "react";
import { useI18n } from "../../../lib/i18n"; 

export default function SuccessModal({ onClose }) {
  const { t } = useI18n(); 

  return (
    <div
      className="modal-overlay success-overlay"
      onClick={onClose}
      style={{ zIndex: 10000 }}
      data-testid="success-modal"
    >
      <div
        className="modal-content large success-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111" }}>
          {t("successModal.title")}
        </h3>

        <div style={{ marginTop: 14, marginBottom: 12, textAlign: "center" }}>
          <img
            src="/happy-calico.png"
            alt="Happy cat"
            style={{
              width: 220,
              height: "auto",
              display: "block",
              margin: "0 auto",
            }}
          />
        </div>

        <p
          style={{
            margin: 0,
            whiteSpace: "pre-line",
            fontSize: 14,
            color: "#4a4a4a",
            lineHeight: 1.4,
          }}
        >
          {t("successModal.message")}
        </p>

        <button
          onClick={onClose}
          style={{
            marginTop: 16,
            backgroundColor: "#ff9505",
            color: "white",
            padding: "8px 16px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {t("successModal.close")}
        </button>
      </div>
    </div>
  );

}
