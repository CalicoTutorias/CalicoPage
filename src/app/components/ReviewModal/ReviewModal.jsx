"use client";
import React, { useState, useEffect } from "react";
import { FaStar } from "react-icons/fa";
import { z } from "zod";
import "./ReviewModal.css";
import SuccessModal from "./NotificationReview";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n"; 
import { TutoringSessionService } from "../../services/core/TutoringSessionService";

const reviewSchema = z.object({
  stars: z.number().min(1, "Debes seleccionar al menos 1 estrella").max(5),
  comment: z.string().max(500).optional().or(z.literal("")),
});

export default function ReviewModal({ session, onClose, currentUser = null }) {
  const { t, lang } = useI18n();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [hasExistingReview, setHasExistingReview] = useState(false);

  const { user: authUser } = useAuth ? useAuth() : { user: null };
  const user = currentUser || authUser;

  // Log authentication state for debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('ReviewModal - Auth user:', authUser);
    }
  }, [authUser]);

  // Check if review is pending and can be rated
  const pendingReview = session?.pendingReview;
  const canRateReview = pendingReview && pendingReview.status === 'pending' && pendingReview.rating === null;

  useEffect(() => {
    const checkExistingReview = async () => {
      if (!user?.id || !session?.id) return;
      
      try {
        const sessionData = await TutoringSessionService.getSessionById(session.id);
        if (sessionData) {
          const reviews = sessionData.reviews || [];
          // Find review created by current student
          const existing = reviews.find((r) => r.studentId === user.id);
          if (existing && existing.rating) {
            setHasExistingReview(true);
            setStars(existing.rating || 0);
            setComment(existing.comment || "");
          }
        }
      } catch (error) {
        console.error("Error checking existing review:", error);
      }
    };
    checkExistingReview();
  }, [user?.id, session?.id]);

  if (!session || !canRateReview) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    const parse = reviewSchema.safeParse({ stars, comment });
    if (!parse.success) {
      alert(parse.error.issues[0]?.message || "Datos inválidos");
      return;
    }

    if (!user?.id && !user?.uid) {
      console.error('User not authenticated:', user);
      alert("Debes iniciar sesión para enviar una reseña.");
      return;
    }

    if (!session?.tutorId) {
      alert("Falta información del tutor");
      return;
    }

    // Disable button immediately before the async call
    setIsSubmitting(true);

    const reviewData = {
      tutorId: session.tutorId,
      rating: stars,
      comment: comment || undefined,
    };

    try {
      const result = await TutoringSessionService.submitReview(session.id, reviewData);

      if (!result.success) {
        setIsSubmitting(false); // re-enable only on failure
        alert(result.error || "Error al guardar la reseña");
        return;
      }

      // Success — keep button disabled, show success notification
      setShowSuccess(true);
      const SUCCESS_MS = 1900;
      setTimeout(() => {
        setShowSuccess(false);
        if (typeof onClose === "function") onClose();
      }, SUCCESS_MS);
    } catch (err) {
      setIsSubmitting(false); // re-enable only on error
      console.error("Error al guardar/actualizar la reseña:", err);
      alert(t("review.errors.saveError"));
    }
  };

  if (!session) return null;

  // Get course name - handle different possible formats
  const getCourseName = () => {
    if (session.course && typeof session.course === "object") {
      return session.course.name || session.course.code || "Tutoría";
    }
    return session.course || "Tutoría";
  };

  // Get session date - handle different possible formats
  const getSessionDateTime = () => {
    const dateField = session.scheduledDateTime || session.startTimestamp;
    if (!dateField) return new Date();
    return dateField instanceof Date ? dateField : new Date(dateField);
  };

  return (
    <>
      {/* Show review modal only when success modal is not showing */}
      {!showSuccess && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {hasExistingReview
                ? t("review.updateTitle")
                : t("review.newTitle")}
            </h2>

            <p>
              <strong>{t("review.fields.course")}:</strong> {getCourseName()}
            </p>
            <p>
              <strong>{t("review.fields.tutor")}:</strong> {session.tutorName || session.tutor?.name || "Tutor"}
            </p>
            <p>
              <strong>{t("review.fields.date")}:</strong>{" "}
              {getSessionDateTime().toLocaleString(lang === "es" ? "es-CO" : "en-US", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block font-medium mb-1">{t("review.fields.rating")}</label>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStars(n)}
                      className={`text-3xl ${n <= stars ? "text-yellow-500" : "text-gray-300"}`}
                    >
                      <FaStar />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">{t("review.fields.comment")}</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("review.placeholders.comment")}
                  className="border p-2 w-full rounded h-32 resize-none"
                  maxLength={500}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={stars === 0 || isSubmitting}
                  className="px-4 py-2 rounded text-white font-semibold"
                  style={{
                    background: stars > 0 && !isSubmitting ? "#ff9505" : "#9ca3af",
                  }}
                >
                  {isSubmitting
                    ? t("review.buttons.saving")
                    : hasExistingReview
                    ? t("review.buttons.update")
                    : t("review.buttons.submit")}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded border"
                  onClick={onClose}
                >
                  {t("review.buttons.close")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Show success modal after submission */}
      {showSuccess && (
        <SuccessModal
          onClose={() => {
            setShowSuccess(false);
            if (typeof onClose === "function") onClose();
          }}
        />
      )}
    </>
  );
}
