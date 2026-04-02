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

  useEffect(() => {
    const checkExistingReview = async () => {
      if (!user?.email || !session?.id) return;
      
      try {
        const sessionData = await TutoringSessionService.getSessionById(session.id);
        const sessionObj = sessionData?.session || sessionData;
        if (sessionObj) {
          const reviews = sessionObj.reviews || [];
          const existing = reviews.find((r) => r.reviewerEmail === user.email);
          if (existing) {
            setHasExistingReview(true);
            setStars(existing.stars || 0);
            setComment(existing.comment || "");
          }
        }
      } catch (error) {
        console.error("Error checking existing review:", error);
      }
    };
    checkExistingReview();
  }, [user, session?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const parse = reviewSchema.safeParse({ stars, comment });
    if (!parse.success) {
      alert(parse.error.issues[0]?.message || "Datos inválidos");
      return;
    }

    if (!user?.email) {
      alert("Debes iniciar sesión para enviar una reseña.");
      return;
    }

    setIsSubmitting(true);

    const reviewData = {
      stars,
      comment,
      reviewerEmail: user.email, 
      reviewerName: user.displayName || user.name || user.email || "Anonymous",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await TutoringSessionService.addReview(session.id, reviewData);

      setShowSuccess(true);
      const SUCCESS_MS = 1900;
      setTimeout(() => {
        setShowSuccess(false);
        if (typeof onClose === "function") onClose();
      }, SUCCESS_MS);
    } catch (err) {
      console.error("Error al guardar/actualizar la reseña:", err);
      alert(t("review.errors.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!session) return null;

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
              <strong>{t("review.fields.course")}:</strong> {session.course}
            </p>
            <p>
              <strong>{t("review.fields.tutor")}:</strong> {session.tutorName}
            </p>
            <p>
              <strong>{t("review.fields.date")}:</strong>{" "}
              {new Date(session.scheduledDateTime).toLocaleString(lang === "es" ? "es-CO" : "en-US", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>
            <p>
              <strong>{t("review.fields.price")}:</strong> ${session.price} COP
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block font-medium mb-1">{t("review.fields.rating")}</label>
                <div className="flex gap-2">
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
