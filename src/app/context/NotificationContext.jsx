"use client";

import React, { createContext, useState, useContext, useCallback } from "react";

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const updateNotifications = useCallback((newNotifications) => {
    setNotifications(newNotifications);
    const unread = newNotifications.filter(n => !n.isRead).length;
    setUnreadCount(unread);
  }, []);

  const value = {
    notifications,
    unreadCount,
    updateNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotificationContext must be used within NotificationProvider");
  }
  return context;
}
