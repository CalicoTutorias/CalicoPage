"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TutoringSessionService } from "../../services/utils/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import TutoringDetailsModal from "../TutoringDetailsModal/TutoringDetailsModal";
import routes from "../../../routes";
import "./TutoringSummary.css";

export default function TutoringSummary({ userType, title, linkText, linkHref }) {
  const { user } = useAuth();
  const { t, locale, formatCurrency } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Lógica de fetch extraída para no duplicarla en handleSessionUpdate
  const fetchUpcomingSessions = useCallback(async () => {
    if (!user.email) return [];
    const fetched = userType === 'tutor'
      ? await TutoringSessionService.getTutorSessions(user.email)
      : await TutoringSessionService.getStudentSessions(user.email);
    const list = Array.isArray(fetched) ? fetched : [];
    const now = new Date();
    return list
      .filter(session => {
        // Para estudiantes: pending + scheduled. Para tutores: solo scheduled
        const validStatus = userType === 'student'
          ? (session.status === 'scheduled' || session.status === 'pending')
          : session.status === 'scheduled';
        return validStatus && session.scheduledDateTime && new Date(session.scheduledDateTime) > now;
      })
      .sort((a, b) => new Date(a.scheduledDateTime) - new Date(b.scheduledDateTime))
      .slice(0, 3);
  }, [user.email, userType]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchUpcomingSessions()
      .then(setSessions)
      .catch(err => {
        console.error('Error fetching sessions:', err);
        setError(t('tutoringSummary.error'));
      })
      .finally(() => setLoading(false));
  }, [fetchUpcomingSessions, t]);

  const formatDateTime = (dateTime) => {
    if (!dateTime) return '';
    
    const date = new Date(dateTime);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
    
    let dayText = '';
    if (sessionDate.getTime() === today.getTime()) {
      dayText = t('tutoringSummary.today');
    } else if (sessionDate.getTime() === today.getTime() + 86400000) {
      dayText = t('tutoringSummary.tomorrow');
    } else {
      dayText = date.toLocaleDateString(localeStr, { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'short' 
      });
    }
    
    const timeText = date.toLocaleTimeString(localeStr, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const endTime = new Date(date.getTime() + 60 * 60 * 1000); // Agregar 1 hora
    const endTimeText = endTime.toLocaleTimeString(localeStr, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    return `${dayText} ${timeText} - ${endTimeText}`;
  };

  const getSessionColor = (index) => {
    const colors = [
      { border: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-600' },
      { border: 'border-green-500', bg: 'bg-green-50', text: 'text-green-600' },
      { border: 'border-purple-500', bg: 'bg-purple-50', text: 'text-purple-600' }
    ];
    return colors[index % colors.length];
  };

  const handleShowDetails = (session) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSession(null);
  };

  const handleSessionUpdate = async () => {
    try {
      setSessions(await fetchUpcomingSessions());
    } catch (err) {
      console.error('Error updating sessions:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8 tutoring-card">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">{title}</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 rounded-lg session-loading"></div>
          <div className="h-20 bg-gray-200 rounded-lg session-loading"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-8 tutoring-card">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        {linkHref && linkText && (
          <Link 
            href={linkHref}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {linkText} →
          </Link>
        )}
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">📚</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {t('tutoringSummary.noSessions')}
          </h3>
          <p className="text-gray-600">
            {userType === 'tutor' 
              ? t('tutoringSummary.noSessionsTutor')
              : t('tutoringSummary.noSessionsStudent')
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session, index) => {
            const colors = getSessionColor(index);
            return (
              <div 
                key={session.id}
                className={`border-l-4 ${colors.border} pl-4 py-3 ${colors.bg} rounded-r-lg session-item relative`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 session-content">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-700">{session.course}</p>
                      {session.status === 'pending' && (
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                          {t('tutoringSummary.pendingApproval')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {formatDateTime(session.scheduledDateTime)}
                    </p>
                    <p className={`text-sm ${colors.text}`}>
                      {userType === 'tutor' 
                        ? `${t('tutoringSummary.student')} ${session.studentEmail}`
                        : `${t('tutoringSummary.tutor')} ${session.tutorEmail}`
                      }
                    </p>
                    {session.location && (
                      <p className="text-sm text-gray-500">
                         {session.location}
                      </p>
                    )}
                    {session.price && (
                      <p className="text-sm text-gray-500">
                         {formatCurrency(session.price)}
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={() => handleShowDetails(session)}
                    className="ml-3 px-3 py-1 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors font-medium text-gray-700 details-button"
                  >
                    {t('tutoringSummary.viewDetails')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de detalles renderizado con Portal */}
      {typeof window !== 'undefined' && isModalOpen && createPortal(
        <TutoringDetailsModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          session={selectedSession}
          userType={userType}
          onSessionUpdate={handleSessionUpdate}
        />,
        document.body
      )}
    </div>
  );
} 