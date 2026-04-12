"use client";

import { useAuth } from "../context/SecureAuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "../components/Header/Header";
import { useI18n } from "../../lib/i18n";
import routes from "../../routes";
import "../globals.css";
import "./tutor-shell.css";

export default function TutorLayout({ children }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Must match server/API: only users with tutor role can access /tutor/*
    if (!user.isLoggedIn || !user.isTutor) {
      router.push(routes.HOME);
      return;
    }

    // If user is a tutor and accessing tutor routes, ensure role is set to "tutor"
    // This allows users to directly access tutor routes via URL or navbar
    const currentRole = typeof window !== 'undefined' ? localStorage.getItem("rol") : null;
    if (currentRole !== "tutor") {
      localStorage.setItem("rol", "tutor");
      // Dispatch event to update Header component's role state
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("role-change", { detail: "tutor" }));
      }
    }
  }, [user.isLoggedIn, user.isTutor, user.email, loading, router]);

  // Mostrar loading mientras se verifica
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{t('common.verifyingPermissions')}</p>
        </div>
      </div>
    );
  }

  // Si no es tutor o no está logueado, no renderizar nada (se redirige)
  if (!user.isLoggedIn || !user.isTutor) {
    return null;
  }

  return (
    <div className="tutor-app-root">
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Poppins:wght@300;400;600&display=swap"
        rel="stylesheet"
      />
      <Header suppressHydrationWarning />
      <main className="tutor-content">
        {children}
      </main>
    </div>
  );
} 