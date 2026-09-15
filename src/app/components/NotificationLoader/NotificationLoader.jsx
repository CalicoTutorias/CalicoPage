"use client";

import { useEffect } from "react";
import { useAuth } from "../../context/SecureAuthContext";
import { NotificationService } from "../../services/core/NotificationService";
import { useNotificationContext } from "../../context/NotificationContext";

// Two minutes between polls. Notifications are also refreshed on every
// user-driven action (booking, accepting, etc.) and whenever the tab regains
// focus, so a longer gap is invisible to the user while cutting the number of
// background API hits by ~4x versus the previous 30 s.
const POLL_INTERVAL_MS = 120_000;

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

    // Poll only while the tab is actually visible. Every poll is a serverless
    // invocation (JWT check + DB query) billed as Active CPU on Vercel, and a
    // tab left open in the background all day was the single biggest source of
    // wasted invocations. On hidden we stop the timer; on visible we refresh
    // right away (if the data is older than one interval) and resume.
    let pollInterval = null;
    let lastFetchedAt = 0;

    const fetchAndStamp = async () => {
      lastFetchedAt = Date.now();
      await fetchNotifications();
    };

    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(fetchAndStamp, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (!pollInterval) return;
      clearInterval(pollInterval);
      pollInterval = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastFetchedAt >= POLL_INTERVAL_MS) {
          fetchAndStamp();
        }
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Fetch immediately on auth, then keep polling while visible.
    fetchAndStamp();
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.uid, user?.isTutor, updateNotifications]);

  return null;
}
