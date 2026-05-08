import "./globals.css";
import AuthWrapper from "./context/AuthWrapper";
import CalendarConnectionHandler from "./components/CalendarConnectionHandler";
import NotificationLoader from "./components/NotificationLoader/NotificationLoader";
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
        </I18nProvider>
      </body>
    </html>
  );
}
 
