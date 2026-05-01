"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  X,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  CreditCard,
  MessageSquare,
  AlertCircle,
  User
} from "lucide-react";
import { NotificationService } from "../../services/core/NotificationService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import { useNotificationContext } from "../../context/NotificationContext";
import SessionBookedModal from "../SessionBookedModal/SessionBookedModal";
import "./NotificationDropdown.css";
import { useRouter } from "next/navigation";
import routes from "../../../routes";

export default function StudentNotificationDropdown() {
  const { user}  = useAuth();
  const { t, locale } = useI18n();
  const { notifications, unreadCount, updateNotifications } = useNotificationContext();
  const [isOpen, setIsOpen] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const dropdownRef = useRef(null);
  const router = useRouter();

  // Lazy: sólo carga cuando el usuario abre el dropdown por primera vez


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      await NotificationService.markNotificationAsRead(notificationId);
      const updatedNotifications = notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      );
      updateNotifications(updatedNotifications);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getConfirmedSessionData = async (sessionId) => {
    try {
      return await TutoringSessionService.getSessionById(sessionId);
    } catch (error) {
      console.error('Error getting confirmed session data:', error);
      return null;
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      const updatedNotifications = notifications.map(n => ({ ...n, isRead: true }));
      updateNotifications(updatedNotifications);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }

    switch (notification.type) {
      case 'session_accepted':
        // Get session data and show session details modal
        const sessionData = await getConfirmedSessionData(notification.sessionId);
        if (sessionData) {
          setSelectedSession(sessionData);
          setShowSessionModal(true);
          setIsOpen(false); // Close notification dropdown
        }
        break;
      case 'session_rejected':
        // Navigate to available slots or show alternative options
        router.push(routes.SEARCH_TUTORS);
        setIsOpen(false);
        break;
      case 'session_cancelled':
        // Navigate to available slots
        router.push(routes.SEARCH_TUTORS);
        setIsOpen(false);
        break;
      case 'payment_reminder':
        // Navigate to payment page
        router.push(routes.HISTORY);
        setIsOpen(false);
        break;
      case 'tutor_message':
        // Navigate to messages or show message details
        router.push(routes.HISTORY);
        setIsOpen(false);
        break;
      default:
        // Default action - close dropdown
        setIsOpen(false);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'session_accepted':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'session_rejected':
        return <XCircle size={16} className="text-red-600" />;
      case 'session_cancelled':
        return <AlertCircle size={16} className="text-orange-600" />;
      case 'payment_reminder':
        return <CreditCard size={16} className="text-blue-600" />;
      case 'tutor_message':
        return <MessageSquare size={16} className="text-purple-600" />;
      default:
        return <Bell size={16} className="text-gray-600" />;
    }
  };

  const getNotificationTypeLabel = (type) => {
    switch (type) {
      case 'session_accepted':
        return t('notifications.student.sessionAccepted');
      case 'session_rejected':
        return t('notifications.student.sessionRejected');
      case 'session_cancelled':
        return t('notifications.student.sessionCancelled');
      case 'payment_reminder':
        return t('notifications.student.paymentReminder');
      case 'tutor_message':
        return t('notifications.student.tutorMessage');
      default:
        return t('notifications.common.notification');
    }
  };

  const formatTimeAgo = (value) => {
    if (!value) return '';
    const toDate = (v) => {
      if (!v) return null;
      if (typeof v === 'string' || typeof v === 'number') return new Date(v);
      if (v.toDate) return v.toDate();
      try { return new Date(v); } catch { return null; }
    };
    const notificationTime = toDate(value);
    if (!notificationTime) return '';
    const now = new Date();
    const diffInMinutes = Math.floor((now - notificationTime) / (1000 * 60));

    if (diffInMinutes < 1) return t('notifications.timeAgo.justNow');
    if (diffInMinutes < 60) return t('notifications.timeAgo.minutesAgoShort', { count: diffInMinutes });
    if (diffInMinutes < 1440) return t('notifications.timeAgo.hoursAgoShort', { count: Math.floor(diffInMinutes / 60) });
    return t('notifications.timeAgo.daysAgoShort', { count: Math.floor(diffInMinutes / 1440) });
  };

  return (
    <div className="notification-dropdown-container" ref={dropdownRef}>
      <button
        className="notification-btn"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3 className="notification-title">
              <Bell size={18} />
              {t('notifications.title')}
            </h3>
            <div className="notification-actions">
              {unreadCount > 0 && (
                <button
                  className="mark-all-read-btn"
                  onClick={handleMarkAllAsRead}
                  title={t('notifications.markAllAsRead')}
                >
                  ✓
                </button>
              )}
              <button
                className="close-dropdown-btn"
                onClick={() => setIsOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <Bell size={32} />
                <p>{t('notifications.empty')}</p>
                <span>{t('notifications.emptyDescription')}</span>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-icon-container">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-header-item">
                      <span className="notification-type">
                        {getNotificationTypeLabel(notification.type)}
                      </span>
                      <span className="notification-time">
                        {formatTimeAgo(notification.createdAt || notification.timestamp)}
                      </span>
                    </div>
                    <p className="notification-message">
                      {notification.message}
                    </p>
                  </div>
                  {!notification.isRead && <div className="notification-unread-indicator"></div>}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-footer">
              <button
                className="view-all-btn"
                onClick={() => {
                  router.push(routes.HISTORY);
                  setIsOpen(false);
                }}
              >
{t('notifications.viewAll')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Session Details Modal for Students */}
      {showSessionModal && selectedSession && (
        <SessionBookedModal
          isOpen={showSessionModal}
          onClose={() => {
            setShowSessionModal(false);
            setSelectedSession(null);
          }}
          sessionData={{
            tutorName: selectedSession.tutorName || t('notifications.defaultTutorName'),
            studentName: selectedSession.studentName || selectedSession.studentEmail,
            studentEmail: selectedSession.studentEmail,
            course: selectedSession.course,
            scheduledDateTime: selectedSession.scheduledDateTime,
            endDateTime: selectedSession.endDateTime,
            location: selectedSession.location
          }}
          userType="student"
        />
      )}
    </div>
  );
}
