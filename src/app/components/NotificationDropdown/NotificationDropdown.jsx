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
  XCircle
} from "lucide-react";
import { NotificationService } from "../../services/core/NotificationService";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import { useNotificationContext } from "../../context/NotificationContext";
import TutorApprovalModal from "../TutorApprovalModal/TutorApprovalModal";
import "./NotificationDropdown.css";
import { useRouter } from "next/navigation";
import routes from "../../../routes";

export default function NotificationDropdown() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { notifications, unreadCount, updateNotifications } = useNotificationContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [selectedPendingSession, setSelectedPendingSession] = useState(null);
  const dropdownRef = useRef(null);
  const router = useRouter();

  // Close dropdown when clicking outside
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
        // Already granted
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

  // Request browser notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Send browser notification when new unread notifications arrive
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
      
      // Update shared context
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

  const getPendingSessionData = async (sessionId) => {
    try {
      return await TutoringSessionService.getSessionById(sessionId);
    } catch (error) {
      console.error('Error getting pending session data:', error);
      return null;
    }
  };

  const handleApprovalComplete = () => {
    // Approval is complete, notifications will be refreshed by the polling in NotificationLoader
    // No action needed here
  };

  const handleCloseApprovalModal = () => {
    setIsApprovalModalOpen(false);
    setSelectedPendingSession(null);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      // Update context to mark all as read locally
      const updatedNotifications = notifications.map(n => ({ ...n, isRead: true }));
      updateNotifications(updatedNotifications);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      // Tutor notifications only
      case 'pending_session_request':
        return <Clock className="notification-icon pending" />;
      case 'session_confirmed':
        return <Calendar className="notification-icon reminder" />;
      case 'session_reminder':
        return <Calendar className="notification-icon reminder" />;
      case 'message':
      case 'tutor_message':
        return <MessageSquare className="notification-icon message" />;
      
      // Common notifications
      default:
        return <Bell className="notification-icon default" />;
    }
  };

  const getNotificationTypeLabel = (type) => {
    switch (type) {
      // Tutor notifications
      case 'pending_session_request':
        return t('notifications.tutor.pendingSessionRequest');
      case 'session_confirmed':
        return t('notifications.tutor.sessionConfirmed');
      case 'session_reminder':
        return t('notifications.tutor.sessionReminder');
      case 'message':
      case 'tutor_message':
        return t('notifications.tutor.message');
      
      // Common notifications
      default:
        return t('notifications.common.notification');
    }
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const notificationDate = new Date(date);
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
    // Mark as read when clicked
    if (!notification.isRead) {
      markAsRead(notification.id);
    }

    // Handle tutor notification actions
    switch (notification.type) {
      case 'pending_session_request':
        // Get session data and open approval modal
        const sessionData = await getPendingSessionData(notification.sessionId);
        if (sessionData) {
          setSelectedPendingSession(sessionData);
          setIsApprovalModalOpen(true);
          setIsOpen(false); // Close notification dropdown
        }
        break;
      case 'session_confirmed':
        // Paid + auto-confirmed session — navigate to the session detail view
        router.push(`/sessions/${notification.sessionId}/detail`);
        setIsOpen(false);
        break;
      case 'session_reminder':
        // Navigate to availability page
        router.push(routes.TUTOR_DISPONIBILIDAD);
        setIsOpen(false);
        break;
      case 'message':
      case 'tutor_message':
        // Navigate to messages or show message details
        router.push(routes.TUTOR_DISPONIBILIDAD);
        setIsOpen(false);
        break;
      default:
        // Default action - close dropdown
        setIsOpen(false);
    }
  };

  return (
    <div className="notification-dropdown-container" ref={dropdownRef}>
      {/* Notification Button */}
      <button
        className="notification-btn"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="notification-dropdown">
          {/* Header */}
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

          {/* Notifications List */}
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
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>
                      
                      <p className="notification-message">
                        {notification.message}
                      </p>
                      
                      {(notification.studentName || notification.tutorName) && (
                        <div className="notification-student">
                          <User size={14} />
                          <span>{user.isTutor ? notification.studentName : notification.tutorName}</span>
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
          </div>
        )}

        {/* Tutor Approval Modal */}
      {isApprovalModalOpen && selectedPendingSession && (
        <TutorApprovalModal
          session={selectedPendingSession}
          isOpen={isApprovalModalOpen}
          onClose={handleCloseApprovalModal}
          onApprovalComplete={handleApprovalComplete}
        />
      )}
    </div>
  );
}
