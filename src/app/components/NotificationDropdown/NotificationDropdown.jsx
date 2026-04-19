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
import TutorApprovalModal from "../TutorApprovalModal/TutorApprovalModal";
import "./NotificationDropdown.css";
import { useRouter } from "next/navigation";
import routes from "../../../routes";

export default function NotificationDropdown() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [selectedPendingSession, setSelectedPendingSession] = useState(null);
  const [error, setError] = useState(null);
  const dropdownRef = useRef(null);
  const router = useRouter();

  // Lazy: sólo carga cuando el usuario abre el dropdown por primera vez


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

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load tutor notifications only (use uid to match backend user id)
      const result = await NotificationService.getTutorNotifications(user.uid);

      let notificationList = [];
      if (Array.isArray(result)) {
        notificationList = result;
      } else if (result && Array.isArray(result.notifications)) {
        notificationList = result.notifications;
      } else {
        console.warn('Unexpected notification response format:', result);
      }

      setNotifications(notificationList);
      
      // Count unread notifications
      const unread = notificationList.filter(n => !n.isRead).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setError('Error loading notifications');
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await NotificationService.markNotificationAsRead(notificationId);
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, isRead: true }
            : notification
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
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
    // Reload notifications after approval/decline
    loadNotifications();
  };

  const handleCloseApprovalModal = () => {
    setIsApprovalModalOpen(false);
    setSelectedPendingSession(null);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      // Reload notifications to update the UI
      loadNotifications();
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
          const next = !isOpen;
          setIsOpen(next);
          if (next && !loading && notifications.length === 0) {
            loadNotifications();
          }
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

          {/* Loading State */}
          {loading && (
            <div className="notification-loading">
              <div className="loading-spinner"></div>
              <p>{t('notifications.loading')}</p>
            </div>
          )}

          {/* Notifications List */}
          {!loading && (
            <div className="notification-list">
              {error ? (
                <div className="notification-error">
                  <Bell size={32} />
                  <p>{error}</p>
                </div>
              ) : notifications.length === 0 ? (
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
          )}

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="notification-footer">
              <button 
                className="view-all-btn" 
                onClick={() => {
                  // Navigate to tutor availability
                  router.push(routes.TUTOR_DISPONIBILIDAD);
                  setIsOpen(false); // Close dropdown after navigation
                }}
              >
{t('notifications.viewAll')}
              </button>
            </div>
          )}
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
