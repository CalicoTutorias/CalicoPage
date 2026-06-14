"use client";

import React from "react";
import { useI18n } from "../../../lib/i18n";

export default function StudentReviewSuccess({ onClose }) {
  const { t } = useI18n();

  return (
    <div
      className="student-review-overlay student-review-overlay--success"
      onClick={onClose}
      data-testid="student-review-success-modal"
    >
      <div
        className="student-review-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="student-review-success-title">{t("studentReview.success.title")}</h3>

        <img
          src="/happy-calico.png"
          alt=""
          className="student-review-success-img"
        />

        <p className="student-review-success-message">{t("studentReview.success.message")}</p>
      </div>
    </div>
  );
}
