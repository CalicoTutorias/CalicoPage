import React from 'react';
import { User, Calendar, DollarSign, ExternalLink, CreditCard, Star } from 'lucide-react';
import { TutoringHistoryService } from '../../services/utils/TutoringHistoryService';
import './TutoringHistoryCard.css';

const TutoringHistoryCard = ({ session, onRateClick }) => {
  const {
    tutorName,
    tutorEmail,
    course,
    price,
    scheduledDateTime,
    endDateTime,
    endTimestamp,
    paymentStatus = 'pending',
    calicoCalendarHtmlLink,
    status,
    tutorProfilePicture,
    pendingReview,
  } = session;

  const formattedDate = TutoringHistoryService.formatDate(scheduledDateTime);
  const formattedPrice = TutoringHistoryService.formatPrice(price);
  const paymentColors = TutoringHistoryService.getPaymentStatusColor(paymentStatus);
  const paymentStatusText = TutoringHistoryService.translatePaymentStatus(paymentStatus);

  // Check if session has ended
  const now = new Date();
  const sessionEnd = endDateTime || (endTimestamp ? new Date(endTimestamp) : null);
  const hasEnded = sessionEnd && sessionEnd < now;

  // Check if we can show "rate" button
  const canRate = hasEnded && pendingReview && !pendingReview.score;

  const handleViewDetails = () => {
    if (calicoCalendarHtmlLink) {
      window.open(calicoCalendarHtmlLink, '_blank');
    }
  };

  const handleRateClick = () => {
    if (onRateClick) {
      onRateClick(session);
    }
  };

  return (
    <div className="tutoring-history-card">
      {/* Header de la card con información del tutor */}
      <div className="card-header">
        <div className="tutor-info">
          <div className="tutor-avatar">
            {tutorProfilePicture ? (
              <img src={tutorProfilePicture} alt={tutorName} />
            ) : (
              <User size={24} />
            )}
          </div>
          <div className="tutor-details">
            <h3 className="tutor-name">{tutorName}</h3>
            <p className="tutor-email">{tutorEmail}</p>
          </div>
        </div>

        {/* Estado de pago */}
        <div 
          className="payment-status"
          style={{
            backgroundColor: paymentColors.bg,
            color: paymentColors.text,
            border: `1px solid ${paymentColors.border}`
          }}
        >
          <CreditCard size={14} />
          {paymentStatusText}
        </div>
      </div>

      {/* Contenido principal de la card */}
      <div className="card-content">
        <div className="session-details">
          {/* Materia */}
          <div className="detail-item">
            <div className="course-badge">{course}</div>
          </div>

          {/* Fecha y hora */}
          <div className="detail-item">
            <Calendar size={16} />
            <span className="detail-text">{formattedDate}</span>
          </div>

          {/* Precio */}
          <div className="detail-item">
            <DollarSign size={16} />
            <span className="detail-text price-text">{formattedPrice}</span>
          </div>
        </div>
      </div>

      {/* Footer con acciones */}
      <div className="card-footer">
        <div className="session-status">
          <span className={`status-indicator ${status || 'scheduled'}`}>
            {status === 'Completed' ? 'Completada' : 
             status === 'Canceled' ? 'Cancelada' : 
             status === 'scheduled' ? 'Programada' : 
             status === 'Pending' ? 'Pendiente' :
             status === 'Rejected' ? 'Rechazada' :
             'Pendiente'}
          </span>
        </div>

        <div className="action-buttons">
          {canRate && (
            <button 
              className="rate-btn"
              onClick={handleRateClick}
              title="Calificar al tutor"
            >
              <Star size={16} />
              Calificar
            </button>
          )}

          {calicoCalendarHtmlLink && (
            <button 
              className="view-details-btn"
              onClick={handleViewDetails}
              title="Ver detalles completos del evento"
            >
              <ExternalLink size={16} />
              Ver Detalles
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutoringHistoryCard;