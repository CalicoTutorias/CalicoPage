"use client";

import React from "react";
import Image from "next/image";
import { CheckCircle, Calendar, Clock, User, BookOpen, MapPin } from "lucide-react";
import "./SessionBookedModal.css";
import { useI18n } from "../../../lib/i18n";
import { formatColombiaDate, formatColombiaTme } from "../../../lib/utils/timezone";

export default function SessionBookedModal({ 
  isOpen, 
  onClose, 
  sessionData,
  userType = 'student' // 'student' or 'tutor'
}) {
  const { t, locale } = useI18n();
  

  if (!isOpen || !sessionData) return null;

  const formatDate = (dateTime) => {
    // Convert from UTC to Colombia time (UTC-5) for display
    const colombiaDateStr = formatColombiaDate(dateTime);
    const colombiaTimeStr = formatColombiaTme(dateTime, locale === 'en' ? 'en-US' : 'es-ES');
    
    return {
      date: colombiaDateStr,
      time: colombiaTimeStr
    };
  };

  const { date, time } = formatDate(sessionData.scheduledDateTime);

  // Determine content based on user type
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
          {/* Header with title */}
          <div className="session-booked-header">
            <h1 className="session-booked-title">{title}</h1>
          </div>
          {/* Status message */}
          <div className="status-message">
            <p className="status-text">
              {statusText}
            </p>
          </div>
          {/* Calico Cat Image */}
          <div className="cat-illustration" onClick={onClose}>
            <Image
              src="/happy-calico.png"
              alt="Happy Calico Cat"
              width={200}
              height={200}
              className="calico-cat"
              priority
            />
          </div>

          {/* Thank you message */}
          <div className="thank-you-message">
            <p className="thank-you-text">
              {thankYouText}
            </p>
            <p className="session-details">
              {isTutor 
                ? t('availability.bookedModal.scheduled', { date, time })
                : t('availability.bookedModal.seeYou', { date, time })}
            </p>
          </div>

          {/* Session details */}
          <div className="session-info-card">
            <h3 className="session-info-title">
              {isTutor ? t('availability.bookedModal.detailsApproved') : t('availability.bookedModal.detailsYour')}
            </h3>
            <div className="session-details-list">
              <div className="session-detail-item">
                <User className="detail-icon" size={16} />
                <span className="detail-label">{isTutor ? t('availability.bookedModal.labels.student') : t('availability.bookedModal.labels.tutor')}</span>
                <span className="detail-value">
                  {isTutor ? (sessionData.studentName || sessionData.studentEmail || t('common.student')) : (sessionData.tutorName || t('common.tutor'))}
                </span>
              </div>
              
              <div className="session-detail-item">
                <BookOpen className="detail-icon" size={16} />
                <span className="detail-label">{t('availability.bookedModal.labels.course')}</span>
                <span className="detail-value">{sessionData.course}</span>
              </div>
              
              <div className="session-detail-item">
                <Calendar className="detail-icon" size={16} />
                <span className="detail-label">{t('availability.bookedModal.labels.date')}</span>
                <span className="detail-value">{date}</span>
              </div>
              
              <div className="session-detail-item">
                <Clock className="detail-icon" size={16} />
                <span className="detail-label">{t('availability.bookedModal.labels.time')}</span>
                <span className="detail-value">{time}</span>
              </div>
              
              {sessionData.location && (
                <div className="session-detail-item">
                  <MapPin className="detail-icon" size={16} />
                  <span className="detail-label">{t('availability.bookedModal.labels.location')}</span>
                  <span className="detail-value">{sessionData.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Google Meet Link */}
          <div className="meet-link-container">
            <div className="meet-link-header">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="meet-link-title">{t('availability.bookedModal.meetingLink')}</span>
            </div>
            <a 
              href="https://meet.google.com/kbm-rxii-ffo"
              target="_blank"
              rel="noopener noreferrer"
              className="meet-link-button"
            >
              <span>meet.google.com/kbm-rxii-ffo</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Close button */}
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
