'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Roboto } from 'next/font/google';
import { useI18n } from '../../../lib/i18n';
import CalendarService from '../../services/integrations/CalendarService';
import GoogleGLogo from './GoogleGLogo';
import './GoogleCalendarButton.css';

/** Roboto Medium — required for custom Sign in with Google–style buttons per Google branding */
const robotoMedium = Roboto({
  weight: '500',
  subsets: ['latin'],
  display: 'swap',
});

export default function GoogleCalendarButton() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [connectionStatus, setConnectionStatus] = useState('checking');
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
      CalendarService.initiateAuth();
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);

      await CalendarService.disconnect();

      setConnectionStatus('disconnected');

      window.dispatchEvent(new CustomEvent('calendar-status-update'));
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const tryRefreshToken = async () => {
    try {
      setIsLoading(true);

      const result = await CalendarService.refreshToken();

      if (result.success) {
        setConnectionStatus('connected');
        alert(` ${t('googleCalendar.connectionRenewed')}`);

        window.dispatchEvent(new CustomEvent('calendar-status-update'));
      } else {
        setConnectionStatus('expired');

        const shouldReconnect = window.confirm(
          `${t('googleCalendar.sessionExpiredMessage')}\n\n${t('googleCalendar.reconnectNow')}`
        );

        if (shouldReconnect) {
          handleConnect();
        }
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      setConnectionStatus('expired');

      const shouldReconnect = window.confirm(
        `${t('googleCalendar.sessionExpiredMessage')}\n\n${t('googleCalendar.reconnectNow')}`
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
    const timer = setTimeout(() => {
      checkConnectionStatus();
    }, 1200);
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.delete('calendar_connected');
      const newUrl =
        window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }
    return () => clearTimeout(timer);
  }, [searchParams, checkConnectionStatus]);

  const getButtonContent = () => {
    if (isLoading) {
      return <span>{t('googleCalendar.loading')}</span>;
    }

    switch (connectionStatus) {
      case 'checking':
        return <span>{t('googleCalendar.checking')}</span>;
      case 'connected':
        return <span>{t('googleCalendar.disconnectCalendar')}</span>;
      case 'expired':
        return (
          <>
            <GoogleGLogo size={18} />
            <span>{t('googleCalendar.continueWithGoogle')}</span>
          </>
        );
      case 'disconnected':
      default:
        return (
          <>
            <GoogleGLogo size={18} />
            <span>{t('googleCalendar.continueWithGoogle')}</span>
          </>
        );
    }
  };

  const getButtonClassName = () => {
    const base = `google-calendar-btn ${robotoMedium.className}`;
    if (isLoading || connectionStatus === 'checking') {
      return `${base} google-calendar-btn--neutral`;
    }
    switch (connectionStatus) {
      case 'connected':
        return `${base} google-calendar-btn--status-connected`;
      case 'expired':
        return `${base} google-calendar-btn--gsi-warning`;
      case 'disconnected':
      default:
        return `${base} google-calendar-btn--gsi`;
    }
  };

  const verifiedTimeLabel =
    lastChecked?.toLocaleTimeString() ?? '—';

  const getAriaLabel = () => {
    if (isLoading) return t('googleCalendar.loading');
    switch (connectionStatus) {
      case 'checking':
        return t('googleCalendar.checking');
      case 'connected':
        return t('googleCalendar.connectedTooltip', { time: verifiedTimeLabel });
      case 'expired':
        return t('googleCalendar.expiredTooltip');
      default:
        return t('googleCalendar.connectTooltip');
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
        type="button"
        className={getButtonClassName()}
        onClick={handleButtonClick}
        disabled={isLoading || connectionStatus === 'checking'}
        title={
          connectionStatus === 'connected'
            ? t('googleCalendar.connectedTooltip', { time: verifiedTimeLabel })
            : connectionStatus === 'expired'
              ? t('googleCalendar.expiredTooltip')
              : t('googleCalendar.connectTooltip')
        }
        aria-label={getAriaLabel()}
      >
        {getButtonContent()}
      </button>

      {connectionStatus === 'expired' && (
        <div className="token-expired-notice" role="status">
          <small>{t('googleCalendar.sessionExpiredNotice')}</small>
        </div>
      )}
    </div>
  );
}
