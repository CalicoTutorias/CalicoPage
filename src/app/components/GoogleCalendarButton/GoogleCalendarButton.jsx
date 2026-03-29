'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '../../../lib/i18n';
import CalendarService from '../../services/integrations/CalendarService';
import './GoogleCalendarButton.css';

export default function GoogleCalendarButton() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [connectionStatus, setConnectionStatus] = useState('checking'); // 'checking', 'connected', 'disconnected', 'expired'
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const checkConnectionStatus = useCallback(async () => {
    try {
      setConnectionStatus('checking');
      const data = await CalendarService.checkConnection();

      if (data.connected && data.tokenValid) {
        setConnectionStatus('connected');
      } else if (data.hasAccessToken && !data.tokenValid) {
        setConnectionStatus('expired');
      } else {
        setConnectionStatus('disconnected');
      }
      
      setLastChecked(new Date());
    } catch (error) {
      console.error('Error checking Google Calendar connection:', error);
      setConnectionStatus('disconnected');
    }
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      // Use CalendarService to redirect to auth
      CalendarService.initiateAuth();
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      
      // Use CalendarService to disconnect
      await CalendarService.disconnect();
      
      setConnectionStatus('disconnected');
      
      // Notify other components that the state changed
      window.dispatchEvent(new CustomEvent('calendar-status-update'));
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Try to refresh token when necessary
  const tryRefreshToken = async () => {
    try {
      setIsLoading(true);
      
      const result = await CalendarService.refreshToken();

      if (result.success) {
        setConnectionStatus('connected');
        alert(` ${t('googleCalendar.connectionRenewed')}`);
        
        // Notify other components
        window.dispatchEvent(new CustomEvent('calendar-status-update'));
      } else {
        setConnectionStatus('expired');
        
        const shouldReconnect = window.confirm(
          `🔑 ${t('googleCalendar.sessionExpiredMessage')}\n\n${t('googleCalendar.reconnectNow')}`
        );
        
        if (shouldReconnect) {
          handleConnect();
        }
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      setConnectionStatus('expired');
      
      const shouldReconnect = window.confirm(
        `🔑 ${t('googleCalendar.sessionExpiredMessage')}\n\n${t('googleCalendar.reconnectNow')}`
      );
      
      if (shouldReconnect) {
        handleConnect();
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkConnectionStatus();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(() => {
          checkConnectionStatus();
        }, 400);
      }
    };

    const handleStorageChange = () => {
      checkConnectionStatus();
    };

    const handleCalendarUpdate = () => {
      setTimeout(() => {
        checkConnectionStatus();
      }, 400);
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('calendar-status-update', handleCalendarUpdate);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('calendar-status-update', handleCalendarUpdate);
    };
  }, [checkConnectionStatus]);

  useEffect(() => {
    if (searchParams?.get('calendar_connected') !== 'true') return;
    const t = setTimeout(() => {
      checkConnectionStatus();
    }, 1200);
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.delete('calendar_connected');
      const newUrl =
        window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }
    return () => clearTimeout(t);
  }, [searchParams, checkConnectionStatus]);

  const getButtonText = () => {
    if (isLoading) return `🔄 ${t('googleCalendar.loading')}`;
    
    switch (connectionStatus) {
      case 'checking':
        return `🔄 ${t('googleCalendar.checking')}`;
      case 'connected':
        return ` ${t('googleCalendar.connected')}`;
      case 'expired':
        return `🔑 ${t('googleCalendar.sessionExpired')}`;
      case 'disconnected':
      default:
        return `📅 ${t('googleCalendar.connect')}`;
    }
  };

  const getButtonClass = () => {
    const base = 'google-calendar-btn';
    switch (connectionStatus) {
      case 'connected':
        return `${base} connected`;
      case 'expired':
        return `${base} expired`;
      case 'disconnected':
      default:
        return `${base} disconnected`;
    }
  };

  const handleButtonClick = () => {
    if (isLoading) return;
    
    switch (connectionStatus) {
      case 'connected':
        handleDisconnect();
        break;
      case 'expired':
        tryRefreshToken();
        break;
      case 'disconnected':
      default:
        handleConnect();
        break;
    }
  };

  return (
    <div className="google-calendar-container">
      <button
        className={getButtonClass()}
        onClick={handleButtonClick}
        disabled={isLoading}
        title={
          connectionStatus === 'connected' 
            ? t('googleCalendar.connectedTooltip', { time: lastChecked?.toLocaleTimeString() })
            : connectionStatus === 'expired'
            ? t('googleCalendar.expiredTooltip')
            : t('googleCalendar.connectTooltip')
        }
      >
        {getButtonText()}
      </button>
      
      {connectionStatus === 'expired' && (
        <div className="token-expired-notice">
          <small>⚠️ {t('googleCalendar.sessionExpiredNotice')}</small>
        </div>
      )}
    </div>
  );
} 