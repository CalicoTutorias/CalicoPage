"use client";

/**
 * StudentReviewModal — tutor rates the student(s) of a completed session
 * (reciprocal review, estilo Uber).
 *
 * PRIVACY: the rating + comment are never shown to the student — only the
 * aggregate number feeds users.studentRating. The modal states this so tutors
 * can rate honestly.
 *
 * Group sessions render one rating block per participant; each is submitted
 * independently (skipped students simply stay pending).
 */

import React, { useState, useEffect, useCallback } from "react";
import { FaStar } from "react-icons/fa";
import { useI18n } from "../../../lib/i18n";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { Button } from "../../../components/ui/button";
import SuccessModal from "./StudentReviewSuccess";
import "./StudentReviewModal.css";

export default function StudentReviewModal({ session, onClose, onSubmitted }) {
  const { t } = useI18n();

  const participants = session?.participants || [];

  // Per-student draft state: { [studentId]: { stars, comment } }
  const [drafts, setDrafts] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Write-only: we only learn WHICH students are already rated (status), never
  // the stored stars/comment — those are admin-only. Done students are locked;
  // the tutor cannot read back or edit a published rating.
  useEffect(() => {
    let cancelled = false;
    const prefill = async () => {
      if (!session?.id) return;
      const seed = {};
      const targets = session.studentReviewStatus?.length
        ? session.studentReviewStatus
        : await TutoringSessionService.getMyStudentReviewTargets(session.id);
      if (cancelled) return;
      for (const tg of targets || []) {
        seed[tg.studentId] = { stars: 0, comment: "", wasDone: tg.status === "done" };
      }
      setDrafts((prev) => ({ ...seed, ...prev }));
    };
    prefill();
    return () => { cancelled = true; };
  }, [session?.id]);

  const setDraft = useCallback((studentId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { stars: 0, comment: "", ...prev[studentId], ...patch },
    }));
  }, []);

  if (!session) return null;

  const ratedCount = participants.filter((p) => (drafts[p.studentId]?.stars || 0) > 0).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (ratedCount === 0) {
      setError(t("studentReview.errors.validation"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Never resubmit an already-published (locked) rating — it is immutable.
      const toSubmit = participants.filter(
        (p) => !drafts[p.studentId]?.wasDone && (drafts[p.studentId]?.stars || 0) > 0,
      );
      for (const p of toSubmit) {
        const draft = drafts[p.studentId];
        const result = await TutoringSessionService.submitStudentReview(session.id, {
          studentId: p.studentId,
          rating: draft.stars,
          comment: draft.comment || undefined,
        });
        if (!result.success) {
          setIsSubmitting(false);
          setError(result.error || t("studentReview.errors.saveError"));
          return;
        }
      }

      setShowSuccess(true);
      const SUCCESS_MS = 1900;
      setTimeout(() => {
        setShowSuccess(false);
        if (typeof onSubmitted === "function") onSubmitted();
        if (typeof onClose === "function") onClose();
      }, SUCCESS_MS);
    } catch (err) {
      console.error("Error al guardar la calificación del estudiante:", err);
      setIsSubmitting(false);
      setError(t("studentReview.errors.saveError"));
    }
  };

  const courseName =
    (session.course && typeof session.course === "object"
      ? session.course.name || session.course.code
      : session.course) || t("studentReview.defaultCourse");

  const singleStudent = participants.length === 1 ? participants[0]?.student : null;

  return (
    <>
      {!showSuccess && (
        <div className="student-review-overlay" onClick={onClose}>
          <div className="student-review-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="student-review-title">
              {singleStudent
                ? t("studentReview.titleSingle", { name: singleStudent.name || t("studentReview.fallbackStudent") })
                : t("studentReview.titleGroup")}
            </h2>
            <p className="student-review-course">{courseName}</p>

            <p className="student-review-privacy">{t("studentReview.privacyNote")}</p>

            <form onSubmit={handleSubmit}>
              {participants.map((p) => {
                const draft = drafts[p.studentId] || { stars: 0, comment: "" };
                const locked = !!draft.wasDone;
                return (
                  <div key={p.studentId} className="student-review-block">
                    {!singleStudent && (
                      <p className="student-review-name">{p.student?.name || t("studentReview.fallbackStudent")}</p>
                    )}

                    {locked ? (
                      <p className="student-review-locked">{t("studentReview.alreadyRated")}</p>
                    ) : (
                      <>
                        <div className="rating-stars student-review-stars">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              aria-label={`${n}/5`}
                              onClick={() => setDraft(p.studentId, { stars: n })}
                              className={n <= draft.stars ? "star-on" : "star-off"}
                            >
                              <FaStar />
                            </button>
                          ))}
                        </div>

                        <textarea
                          value={draft.comment}
                          onChange={(e) => setDraft(p.studentId, { comment: e.target.value })}
                          placeholder={t("studentReview.commentPlaceholder")}
                          className="student-review-comment"
                          maxLength={500}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {error && <p className="student-review-error">{error}</p>}

              <div className="student-review-actions">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("studentReview.buttons.close")}
                </Button>
                <Button type="submit" variant="tutor" disabled={ratedCount === 0 || isSubmitting}>
                  {isSubmitting
                    ? t("studentReview.buttons.saving")
                    : t("studentReview.buttons.submit")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccess && (
        <SuccessModal
          onClose={() => {
            setShowSuccess(false);
            if (typeof onSubmitted === "function") onSubmitted();
            if (typeof onClose === "function") onClose();
          }}
        />
      )}
    </>
  );
}
