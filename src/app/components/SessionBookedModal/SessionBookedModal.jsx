"use client";

import React from "react";
import "./SessionBookedModal.css";
import { useI18n } from "../../../lib/i18n";
import { formatColombiaDate, formatColombiaTme } from "../../../lib/utils/timezone";

export default function SessionBookedModal({ 
  isOpen, 
  onClose, 
  sessionData,
  userType = 'student'
}) {
  const { t, locale } = useI18n();
  
  if (!isOpen || !sessionData) return null;

  const formatDate = (dateTime) => {
    const colombiaDateStr = formatColombiaDate(dateTime);
    const colombiaTimeStr = formatColombiaTme(dateTime, locale === 'en' ? 'en-US' : 'es-ES');
    return {
      date: colombiaDateStr,
      time: colombiaTimeStr
    };
  };

  const { date, time } = sessionData.scheduledDateTime ? formatDate(sessionData.scheduledDateTime) : { date: '', time: '' };

  const isTutor = userType === 'tutor';
  const title = isTutor ? t('availability.bookedModal.approvedTitle') : t('availability.bookedModal.reservedTitle');
  const thankYouText = isTutor 
    ? t('availability.bookedModal.thanksTutor')
    : t('availability.bookedModal.thanksStudent');
  const statusText = isTutor
    ? t('availability.bookedModal.statusTutor')
    : t('availability.bookedModal.statusStudent');

  return (
    <div className="session-booked-overlay" onClick={onClose}>
      <div className="session-booked-modal" onClick={(e) => e.stopPropagation()}>
        <div className="session-booked-content">
          <div className="session-booked-header">
            <h1 className="session-booked-title">{title}</h1>
          </div>
          
          <div className="status-message">
            <p className="status-text">{statusText}</p>
          </div>

          <div className="cat-illustration" onClick={onClose}>
            <img
              src="/happy-calico.png"
              alt="Happy Calico Cat"
              style={{
                width: 280,
                height: "auto",
                display: "block",
                margin: "0 auto",
              }}
            />
          </div>

          <div className="thank-you-message">
            <p className="thank-you-text">{thankYouText}</p>
            {date && time && (
              <p className="session-details">
                {isTutor 
                  ? t('availability.bookedModal.scheduled', { date, time })
                  : t('availability.bookedModal.seeYou', { date, time })}
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button 
              className="close-modal-btn"
              onClick={onClose}
            >
              {t('availability.bookedModal.ok')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}