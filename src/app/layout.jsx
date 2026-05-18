import "./globals.css";
import AuthWrapper from "./context/AuthWrapper";
import CalendarConnectionHandler from "./components/CalendarConnectionHandler";
import NotificationLoader from "./components/NotificationLoader/NotificationLoader";
import SupportFAB from "./components/SupportFAB/SupportFAB";
import { NotificationProvider } from "./context/NotificationContext";
import { I18nProvider } from "../lib/i18n";

export const metadata = {
  title: "Calico",
  description: "Proyecto de monitorías",
  icons: {
    icon: "/CalicoLogoSimple.png",
    shortcut: "/CalicoLogoSimple.png",
    apple: "/CalicoLogoSimple.png",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Lets the page extend under the notch / Dynamic Island and the home
  // indicator. Components that should not sit under those areas use
  // env(safe-area-inset-*) (header, bottom-nav, FAB, etc.).
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <I18nProvider>
          <AuthWrapper>
            <NotificationProvider>
              <NotificationLoader />
              {children}
            </NotificationProvider>
          </AuthWrapper>
          {/* Componente seguro para manejar la conexión de Google Calendar */}
          <CalendarConnectionHandler />
          <SupportFAB />
        </I18nProvider>
      </body>
    </html>
  );
}
 
