import "./globals.css";
import AuthWrapper from "./context/AuthWrapper";
import CalendarConnectionHandler from "./components/CalendarConnectionHandler";
import { I18nProvider } from "../lib/i18n";
import LocaleSwitcher from "./components/LocaleSwitcher";

export const metadata = {
  title: "Calico",
  description: "Proyecto de monitorías",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <I18nProvider>
          <AuthWrapper>
            {/* Optional locale switcher in layout header for quick testing */}
            <LocaleSwitcher />
            {children}
          </AuthWrapper>
          {/* Componente seguro para manejar la conexión de Google Calendar */}
          <CalendarConnectionHandler />
        </I18nProvider>
      </body>
    </html>
  );
}
 
