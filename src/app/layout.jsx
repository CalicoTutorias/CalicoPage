import "./globals.css";
import AuthWrapper from "./context/AuthWrapper";
import CalendarConnectionHandler from "./components/CalendarConnectionHandler";
import { I18nProvider } from "../lib/i18n";

export const metadata = {
  title: "Calico",
  description: "Proyecto de monitorías",
  icons: {
    icon: "/happy-calico.png",
    shortcut: "/happy-calico.png",
    apple: "/happy-calico.png",
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
            {children}
          </AuthWrapper>
          {/* Componente seguro para manejar la conexión de Google Calendar */}
          <CalendarConnectionHandler />
        </I18nProvider>
      </body>
    </html>
  );
}
 
