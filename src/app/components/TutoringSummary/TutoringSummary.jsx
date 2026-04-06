"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Calendar, ArrowRight, BookOpen, Clock, MapPin, DollarSign } from "lucide-react";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
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
    if (!user.uid) return [];
    const fetched = userType === 'tutor'
      ? await TutoringSessionService.getTutorSessions()
      : await TutoringSessionService.getStudentSessions();
    const list = Array.isArray(fetched) ? fetched : [];
    const now = new Date();
    return list
      .filter(session => {
        const validStatus = userType === 'student'
          ? (session.status === 'Accepted' || session.status === 'Pending')
          : session.status === 'Accepted';
        // Use startTimestamp from the database (not scheduledDateTime)
        return validStatus && session.startTimestamp && new Date(session.startTimestamp) > now;
      })
      .sort((a, b) => new Date(a.startTimestamp) - new Date(b.startTimestamp))
      .slice(0, 3)
      .map(session => ({
        ...session,
        // Normalize for display: extract first student from participants array
        studentEmail: session.participants?.[0]?.student?.email || 'N/A',
        studentName: session.participants?.[0]?.student?.name || session.participants?.[0]?.student?.email,
      }));
  }, [user.uid, userType]);

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
  }, [fetchUpcomingSessions]);

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

  const getSessionColor = (index, type) => {
    const studentColors = [
      { border: 'border-[#ff9505]', bg: 'bg-[#fff8ed]', text: 'text-[#c27200]', dot: 'bg-[#ff9505]' },
      { border: 'border-[#faa324]', bg: 'bg-[#fffbf0]', text: 'text-[#b07a00]', dot: 'bg-[#faa324]' },
      { border: 'border-[#cf3476]', bg: 'bg-[#fff0f6]', text: 'text-[#cf3476]', dot: 'bg-[#cf3476]' },
    ];
    const tutorColors = [
      { border: 'border-[#006bb3]', bg: 'bg-[#e8f4fc]', text: 'text-[#003d66]', dot: 'bg-[#006bb3]' },
      { border: 'border-[#005694]', bg: 'bg-[#dbeafe]', text: 'text-[#002a47]', dot: 'bg-[#005694]' },
      { border: 'border-[#0090e0]', bg: 'bg-[#eff6ff]', text: 'text-[#0c4a6e]', dot: 'bg-[#0090e0]' },
    ];
    const palette = type === 'tutor' ? tutorColors : studentColors;
    return palette[index % palette.length];
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

  const accentColor = userType === 'tutor' ? '#006bb3' : '#ff9505';
  const accentBg = userType === 'tutor' ? 'bg-[#006bb3]/10' : 'bg-[#ff9505]/10';
  const accentText = userType === 'tutor' ? 'text-[#006bb3]' : 'text-[#ff9505]';
  const accentHover = userType === 'tutor' ? 'hover:text-[#005694]' : 'hover:text-[#e8920a]';

  if (loading) {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 tutoring-card${userType === 'tutor' ? ' tutoring-card--tutor' : ''}`}>
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2">
            <div className={`p-2 ${accentBg} rounded-xl`}>
              <Calendar className={`w-5 h-5 ${accentText}`} />
            </div>
            <h2 className="text-xl font-bold text-[#262528]">{title}</h2>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl session-loading"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 tutoring-card${userType === 'tutor' ? ' tutoring-card--tutor' : ''}`}>
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-2">
          <div className={`p-2 ${accentBg} rounded-xl`}>
            <Calendar className={`w-5 h-5 ${accentText}`} />
          </div>
          <h2 className="text-xl font-bold text-[#262528]">{title}</h2>
        </div>
        {linkHref && linkText && (
          <Link
            href={linkHref}
            className={`flex items-center gap-1 text-sm font-semibold ${accentText} ${accentHover} transition-colors`}
          >
            {linkText}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-10">
          <div className={`p-4 ${accentBg} rounded-2xl w-fit mx-auto mb-3`}>
            <BookOpen className={`w-7 h-7 ${accentText}`} />
          </div>
          <h3 className="text-base font-semibold text-[#262528] mb-1">
            {t('tutoringSummary.noSessions')}
          </h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            {userType === 'tutor'
              ? t('tutoringSummary.noSessionsTutor')
              : t('tutoringSummary.noSessionsStudent')
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, index) => {
            const colors = getSessionColor(index, userType);
            return (
              <div
                key={session.id}
                className={`border-l-4 ${colors.border} ${colors.bg} rounded-r-xl px-4 py-3.5 session-item`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold text-[#262528] text-sm">{session.course?.name || session.course}</p>
                      {session.status === 'pending' && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                          {t('tutoringSummary.pendingApproval')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-500">{formatDateTime(session.startTimestamp)}</p>
                    </div>
                    <p className={`text-xs font-medium ${colors.text}`}>
                      {userType === 'tutor'
                        ? `${t('tutoringSummary.student')} ${session.studentEmail}`
                        : `${t('tutoringSummary.tutor')} ${session.tutorEmail}`
                      }
                    </p>
                    {session.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <p className="text-xs text-gray-400">{session.location}</p>
                      </div>
                    )}
                    {session.price && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <DollarSign className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <p className="text-xs text-gray-400">{formatCurrency(session.price)}</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleShowDetails(session)}
                    className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors details-button`}
                    style={{ borderColor: accentColor, color: accentColor }}
                    onMouseEnter={e => { e.currentTarget.style.background = accentColor; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = accentColor; }}
                  >
                    {t('tutoringSummary.viewDetails')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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