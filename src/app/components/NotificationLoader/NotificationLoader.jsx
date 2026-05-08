"use client";

import { useEffect } from "react";
import { useAuth } from "../../context/SecureAuthContext";
import { NotificationService } from "../../services/core/NotificationService";
import { useNotificationContext } from "../../context/NotificationContext";

/**
 * Global notification loader that runs as soon as the user is authenticated.
 * Handles all notification fetching and polling for the app.
 * This ensures notifications are fetched and available app-wide without needing
 * to click the notification bell first.
 */
export default function NotificationLoader() {
  const { user } = useAuth();
  const { updateNotifications } = useNotificationContext();

  useEffect(() => {
    if (!user?.uid) return;

    // Request browser notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch((error) => {
        console.error("Error requesting notification permission:", error);
      });
    }

    // Fetch notifications function - handles both tutors and students
    const fetchNotifications = async () => {
      try {
        let result;
        // Check if user is a tutor
        if (user.isTutor) {
          result = await NotificationService.getTutorNotifications(user.uid);
        } else {
          // Students get student notifications
          result = await NotificationService.getStudentNotifications(user.uid);
        }

        let notificationList = [];
        if (Array.isArray(result)) {
          notificationList = result;
        } else if (result && Array.isArray(result.notifications)) {
          notificationList = result.notifications;
        } else if (result && result.data && Array.isArray(result.data)) {
          notificationList = result.data;
        }
        // Update shared context so all components display notifications
        updateNotifications(notificationList);
      } catch (error) {
        console.error("Error loading notifications:", error);
      }
    };

    // Fetch immediately on auth
    fetchNotifications();

    // Then poll every 30 seconds
    const pollInterval = setInterval(fetchNotifications, 30000);

    return () => clearInterval(pollInterval);
  }, [user?.uid, user?.isTutor, updateNotifications]);

  return null;
}
