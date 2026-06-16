"use client";

import React, { useState } from "react";
import { X, Calendar, Clock, MapPin, User, BookOpen, MessageSquare, AlertTriangle, CheckCircle, Star } from "lucide-react";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import SessionBookedModal from "../SessionBookedModal/SessionBookedModal";
import "./TutorApprovalModal.css";

export default function TutorApprovalModal({ 
  session, 
  isOpen, 
  onClose, 
  onApprovalComplete
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);

  if (!isOpen || !session) return null;

  const formatDateTime = (dateTime) => {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    console.log('Formatting dateTime:', dateTime, 'to date object:', date);
    return {
      date: date.toLocaleDateString('es-ES', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const handleAccept = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await TutoringSessionService.acceptSession(session.id);
      if (!result.success) throw new Error(result.error);
      setShowConfirmationModal(true);
      if (onApprovalComplete) onApprovalComplete();
    } catch (error) {
      console.error('Error accepting session:', error);
      setError(error.message || 'Error accepting session');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await TutoringSessionService.rejectSession(session.id);
      if (!result.success) throw new Error(result.error);
      if (onApprovalComplete) onApprovalComplete();
      onClose();
    } catch (error) {
      console.error('Error declining session:', error);
      setError(error.message || 'Error declining session');
    } finally {
      setLoading(false);
    }
  };

  const { date, time } = formatDateTime(session.scheduledStart || session.startTimestamp);

  // The session may arrive flattened (legacy callers) or as the raw API shape
  // (participants[].student). Support both; the API shape also carries the
  // private student rating for tutor payloads (estilo Uber).
  const participantStudent = session.participants?.[0]?.student;
  const studentName =
    session.studentName || participantStudent?.name || session.studentEmail || participantStudent?.email || 'Estudiante';
  const courseName =
    session.course && typeof session.course === 'object'
      ? session.course.name || session.course.code
      : session.course;
  // Pre-accept payload carries ONLY the star average (number), null for "Nuevo".
  // The rating count and any comments never travel to the tutor.
  const studentRating = participantStudent?.studentRating;

  return (
    <div className="tutor-approval-modal-overlay">
      <div className="tutor-approval-modal">
        <div className="modal-header">
          <h2>Solicitud de Tutoría</h2>
          <button 
            className="close-btn" 
            onClick={onClose}
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Announcement Banner */}
          <div className="announcement-banner">
            <div className="announcement-icon">
              <AlertTriangle size={20} />
            </div>
            <div className="announcement-content">
              <h3>¡Importante!</h3>
              <p>
                Antes de aprobar esta solicitud, asegúrate de tener el conocimiento necesario 
                sobre los temas solicitados y disponibilidad de tiempo para brindar una tutoría 
                de calidad al estudiante.
              </p>
            </div>
          </div>

          <div className="session-info">
            <div className="info-section">
              <div className="info-item">
                <User className="info-icon" size={16} />
                <div className="info-content">
                  <span className="info-label">Estudiante</span>
                  <span className="info-value">{studentName}</span>
                  {/* Star average only — no count, no comments (blind acceptance) */}
                  {typeof studentRating === 'number' ? (
                    <span className="student-rating-line">
                      <Star size={13} className="student-rating-star" />
                      <strong>{studentRating.toFixed(1)}</strong>
                    </span>
                  ) : studentRating === null ? (
                    <span className="student-rating-new">Nuevo</span>
                  ) : null}
                </div>
              </div>

              <div className="info-item">
                <BookOpen className="info-icon" size={16} />
                <div className="info-content">
                  <span className="info-label">Materia</span>
                  <span className="info-value">{courseName}</span>
                </div>
              </div>

              <div className="info-item">
                <Calendar className="info-icon" size={16} />
                <div className="info-content">
                  <span className="info-label">Fecha</span>
                  <span className="info-value">{date}</span>
                </div>
              </div>

              <div className="info-item">
                <Clock className="info-icon" size={16} />
                <div className="info-content">
                  <span className="info-label">Hora</span>
                  <span className="info-value">{time}</span>
                </div>
              </div>

              {session.location && (
                <div className="info-item">
                  <MapPin className="info-icon" size={16} />
                  <div className="info-content">
                    <span className="info-label">Ubicación</span>
                    <span className="info-value">{session.location}</span>
                  </div>
                </div>
              )}

              {session.notes && (
                <div className="info-item notes-item">
                  <MessageSquare className="info-icon" size={16} />
                  <div className="info-content">
                    <span className="info-label">Notas</span>
                    <span className="info-value notes-text">{session.notes}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button 
              className="decline-btn"
              onClick={handleDecline}
              disabled={loading}
            >
              {loading ? 'Rechazando...' : 'Rechazar'}
            </button>
            <button 
              className="accept-btn"
              onClick={handleAccept}
              disabled={loading}
            >
              {loading ? 'Aprobando...' : 'Aprobar'}
            </button>
          </div>
        </div>
      </div>

      {/* Session Confirmation Modal */}
      {showConfirmationModal && (
        <SessionBookedModal
          isOpen={showConfirmationModal}
          onClose={() => {
            setShowConfirmationModal(false);
            onClose(); // Close the main approval modal after confirmation
          }}
          sessionData={{
            tutorName: session.tutorName || session.tutor?.name || 'Tutor',
            studentName,
            studentEmail: session.studentEmail || participantStudent?.email,
            course: courseName,
            scheduledStart: session.scheduledStart || session.startTimestamp,
            endDateTime: session.endDateTime || session.endTimestamp,
            location: session.location
          }}
          userType="tutor"
        />
      )}
    </div>
  );
}
