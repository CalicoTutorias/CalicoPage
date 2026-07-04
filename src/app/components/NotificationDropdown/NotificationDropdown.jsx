"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  X,
  Check,
  Clock,
  User,
  Calendar,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  XCircle,
  CreditCard,
  Star
} from "lucide-react";
import { NotificationService } from "../../services/core/NotificationService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import { useNotificationContext } from "../../context/NotificationContext";
import TutorApprovalModal from "../TutorApprovalModal/TutorApprovalModal";
import SessionDetailView from "../SessionDetailView/SessionDetailView";
import "./NotificationDropdown.css";
import { useRouter } from "next/navigation";
import routes from "../../../routes";

export default function NotificationDropdown() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { notifications, unreadCount, updateNotifications } = useNotificationContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showTutorSessionModal, setShowTutorSessionModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const dropdownRef = useRef(null);
  const router = useRouter();

  const isTutor = user?.isTutor ?? false;

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

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        return;
      }
      if (Notification.permission !== 'denied') {
        try {
          await Notification.requestPermission();
        } catch (error) {
          console.error('Error requesting notification permission:', error);
        }
      }
    }
  };

  const showBrowserNotification = (title, options = {}) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          icon: '/icon.png',
          ...options,
        });
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  };

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const newUnread = notifications.filter(n => !n.isRead);
    if (newUnread.length > 0) {
      const latestUnread = newUnread[0];
      showBrowserNotification('Nueva notificación', {
        body: latestUnread.message,
        tag: 'notification-' + latestUnread.id,
      });
    }
  }, [unreadCount]);

  const markAsRead = async (notificationId) => {
    try {
      await NotificationService.markNotificationAsRead(notificationId);
      const updatedNotifications = notifications.map(notification => 
        notification.id === notificationId 
          ? { ...notification, isRead: true }
          : notification
      );
      updateNotifications(updatedNotifications);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getSessionData = async (sessionId) => {
    try {
      return await TutoringSessionService.getSessionById(sessionId);
    } catch (error) {
      console.error('Error getting session data:', error);
      return null;
    }
  };

  const handleApprovalComplete = () => {};

  const handleCloseApprovalModal = () => {
    setIsApprovalModalOpen(false);
    setSelectedSession(null);
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

  const getNotificationIcon = (type) => {
    if (isTutor) {
      switch (type) {
        case 'pending_session_request':
          return <Clock className="notification-icon pending" />;
        case 'session_confirmed':
          return <Calendar className="notification-icon reminder" />;
        case 'session_reminder':
          return <Calendar className="notification-icon reminder" />;
        case 'student_review_reminder':
          return <Star className="notification-icon reminder" />;
        case 'message':
        case 'tutor_message':
          return <MessageSquare className="notification-icon message" />;
        default:
          return <Bell className="notification-icon default" />;
      }
    } else {
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
    }
  };

  const getNotificationTypeLabel = (type) => {
    if (isTutor) {
      switch (type) {
        case 'pending_session_request':
          return t('notifications.tutor.pendingSessionRequest');
        case 'session_confirmed':
          return t('notifications.tutor.sessionConfirmed');
        case 'session_reminder':
          return t('notifications.tutor.sessionReminder');
        case 'student_review_reminder':
          return t('notifications.tutor.studentReviewReminder');
        case 'message':
        case 'tutor_message':
          return t('notifications.tutor.message');
        default:
          return t('notifications.common.notification');
      }
    } else {
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
    }
  };

  const formatTimeAgo = (date) => {
    if (!date) return '';
    const toDate = (v) => {
      if (!v) return null;
      if (typeof v === 'string' || typeof v === 'number') return new Date(v);
      if (v.toDate) return v.toDate();
      try { return new Date(v); } catch { return null; }
    };
    const notificationDate = toDate(date);
    if (!notificationDate) return '';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now - notificationDate) / 1000);

    if (diffInSeconds < 60) {
      return t('notifications.timeAgo.justNow');
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return t('notifications.timeAgo.minutesAgo', { count: minutes });
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return t('notifications.timeAgo.hoursAgo', { count: hours });
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return t('notifications.timeAgo.daysAgo', { count: days });
    } else {
      const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
      return notificationDate.toLocaleDateString(localeStr);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }

    if (isTutor) {
      switch (notification.type) {
        case 'pending_session_request':
          const sessionData = await getSessionData(notification.sessionId);
          if (sessionData) {
            setSelectedSession(sessionData);
            setIsApprovalModalOpen(true);
            setIsOpen(false);
          }
          break;
        case 'session_confirmed':
          const tutorSessionData = await getSessionData(notification.sessionId);
          if (tutorSessionData) {
            setSelectedSession(tutorSessionData);
            setShowTutorSessionModal(true);
            setIsOpen(false);
          }
          break;
        case 'student_review_reminder': {
          // Open the session detail — it hosts the "Calificar estudiante" flow
          const completedSessionData = await getSessionData(notification.sessionId);
          if (completedSessionData) {
            setSelectedSession(completedSessionData);
            setShowTutorSessionModal(true);
            setIsOpen(false);
          }
          break;
        }
        case 'session_reminder':
          router.push(routes.TUTOR_DISPONIBILIDAD);
          setIsOpen(false);
          break;
        case 'message':
        case 'tutor_message':
          router.push(routes.TUTOR_DISPONIBILIDAD);
          setIsOpen(false);
          break;
        default:
          setIsOpen(false);
      }
    } else {
      switch (notification.type) {
        case 'session_accepted':
          const sessionData = await getSessionData(notification.sessionId);
          if (sessionData) {
            setSelectedSession(sessionData);
            setShowSessionModal(true);
            setIsOpen(false);
          }
          break;
        case 'session_rejected':
          router.push(routes.SEARCH_TUTORS);
          setIsOpen(false);
          break;
        case 'session_cancelled':
          router.push(routes.SEARCH_TUTORS);
          setIsOpen(false);
          break;
        case 'payment_reminder':
          router.push(routes.HISTORY);
          setIsOpen(false);
          break;
        case 'tutor_message':
          router.push(routes.HISTORY);
          setIsOpen(false);
          break;
        default:
          setIsOpen(false);
      }
    }
  };

  return (
    <div className="notification-dropdown-container" ref={dropdownRef}>
      <button
        className="notification-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={
          unreadCount > 0
            ? t('notifications.ariaLabelUnread', { count: unreadCount })
            : t('notifications.ariaLabel')
        }
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className={`notification-dropdown ${isTutor ? 'notification-dropdown--tutor' : 'notification-dropdown--student'}`}>
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
                title={t('notifications.close')}
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
                    
                    {(notification.studentName || notification.tutorName) && (
                      <div className="notification-student">
                        <User size={14} />
                        <span>{isTutor ? notification.studentName : notification.tutorName}</span>
                      </div>
                    )}
                  </div>
                  
                  {!notification.isRead && (
                    <div className="notification-unread-indicator"></div>
                  )}
                </div>
              ))
            )}
          </div>

          {!isTutor && notifications.length > 0 && (
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

      {isTutor && isApprovalModalOpen && selectedSession && (
        <TutorApprovalModal
          session={selectedSession}
          isOpen={isApprovalModalOpen}
          onClose={handleCloseApprovalModal}
          onApprovalComplete={handleApprovalComplete}
        />
      )}

      {!isTutor && showSessionModal && selectedSession && (
        <SessionDetailView
          session={selectedSession}
          isModal={true}
          onClose={() => {
            setShowSessionModal(false);
            setSelectedSession(null);
          }}
        />
      )}

      {isTutor && showTutorSessionModal && selectedSession && (
        <SessionDetailView
          session={selectedSession}
          isModal={true}
          onClose={() => {
            setShowTutorSessionModal(false);
            setSelectedSession(null);
          }}
        />
      )}
    </div>
  );
}