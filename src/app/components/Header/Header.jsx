"use client";

import React, { useEffect, useState } from "react";
import "./Header.css";
import {
  UserRound,
  Menu,
  X,
  Home,
  Search,
  BarChart3,
  BookOpen,
  Bell,
  Calendar,
  GraduationCap,
  CreditCard,
  History,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import CalicoLogo from "../../../../public/CalicoLogo.png";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../../context/SecureAuthContext";
import { NotificationService } from "../../services/utils/NotificationService";
import NotificationDropdown from "../NotificationDropdown/NotificationDropdown";
import StudentNotificationDropdown from "../NotificationDropdown/StudentNotificationDropdown";
import routes from "../../../routes";
import { useI18n } from "../../../lib/i18n";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState("student"); // 'student' | 'tutor'
  const [menuOpen, setMenuOpen] = useState(false);   // ⟵ estado del menú

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const initial =
      typeof window !== "undefined"
        ? localStorage.getItem("rol") || "student"
        : "student";
    setRole(initial);

    const onRoleChange = (e) => {
      setRole(e?.detail || localStorage.getItem("rol") || "student");
    };
    window.addEventListener("role-change", onRoleChange);

    const onStorage = (e) => {
      if (e.key === "rol") setRole(e.newValue || "student");
    };
    window.addEventListener("storage", onStorage);

    // cerrar menú si ensanchas la pantalla
    const onResize = () => {
      if (window.innerWidth > 950) setMenuOpen(false);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("role-change", onRoleChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("resize", onResize);
    };
  }, [mounted]);


  if (!mounted) return null;

  const tutorMode = user.isLoggedIn && role === "tutor";

  // Navigation items configuration
  const studentNavItems = [
    { href: routes.HOME, label: t('header.navigation.home'), icon: Home },
    { href: routes.SEARCH_TUTORS, label: t('header.navigation.search'), icon: Search },
    { href: routes.HISTORY, label: t('header.navigation.history'), icon: History }
  ];

  const tutorNavItems = [
    { href: routes.TUTOR_INICIO, label: t('header.navigation.home'), icon: Home },
    { href: routes.TUTOR_DISPONIBILIDAD, label: t('header.navigation.availability'), icon: Calendar },
    { href: routes.TUTOR_STATISTICS, label: t('header.navigation.statistics'), icon: BarChart3 },
    { href: routes.TUTOR_COURSES, label: t('header.navigation.courses'), icon: BookOpen },
  ];

  // Check if current path matches navigation item
  const isActiveRoute = (href) => {
    // Special handling for home routes
    if (href === routes.HOME) {
      return pathname === routes.HOME || pathname === "/";
    }
    if (href === routes.TUTOR_INICIO) {
      return pathname === routes.TUTOR_INICIO;
    }
    // For other routes, check if pathname starts with the href
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      router.push(routes.LOGIN);
    }
  };

  // Función para cambiar rol con refresh y redirección
  const handleRoleChange = (newRole) => {
    localStorage.setItem("rol", newRole);
    window.dispatchEvent(
      new CustomEvent("role-change", { detail: newRole })
    );
    
    // Determinar la ruta de home según el rol
    const homeRoute = newRole === "tutor" ? routes.TUTOR_INICIO : routes.HOME;
    
    // Refrescar la página y redirigir al home correspondiente
    window.location.href = homeRoute;
  };

  return (
    <header className={`header ${menuOpen ? 'is-open' : ''}`}>
      <Link href="/" className="logo">
        <Image src={CalicoLogo} alt="Calico" className="logoImg" priority />
      </Link>

      {/* Botón hamburguesa solo móvil */}
      <button
        className="hamburger"
        aria-label={menuOpen ? t('header.menu.close') : t('header.menu.open')}
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <nav
        id="site-nav"
        className={`navbar ${tutorMode ? "navbar-tutor" : "navbar-student"}`}
        onClick={() => setMenuOpen(false)} // cerrar al elegir una opción
      >
        {(tutorMode ? tutorNavItems : studentNavItems).map(
          ({ href, label, icon: IconComponent }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${isActiveRoute(href) ? "active" : ""}`}
            >
              <div className="nav-icon-container">
                <IconComponent
                  size={24}
                  fill={isActiveRoute(href) ? "currentColor" : "none"}
                  className="nav-icon"
                />
              </div>
              <span className="nav-label">{label}</span>
            </Link>
          )
        )}
      </nav>

      <div className="right-block">
        {user.isLoggedIn && (
          <div className="role-indicator">
            <button
              className={`role-badge ${tutorMode ? "tutor" : "student"}`}
              onClick={() => {
                const newRole = role === "student" ? "tutor" : "student";
                handleRoleChange(newRole);
              }}
            >
              {tutorMode ? t('header.roles.tutor') : t('header.roles.student')}
            </button>
          </div>
        )}

        {user.isLoggedIn ? (
          <div className="user-actions">
            {tutorMode ? (
              <NotificationDropdown />
            ) : (
              <StudentNotificationDropdown />
            )}
            <Link
              href={routes.PROFILE}
              className="profile-btn"
              onClick={() => setMenuOpen(false)}
            >
              <UserRound size={20} />
            </Link>
          </div>
        ) : (
          <div className="auth-buttons">
            <Link
              href={routes.LOGIN}
              className="btn-header"
              onClick={() => setMenuOpen(false)}
            >
              {t('header.auth.login')}
            </Link>
            <Link
              href={routes.REGISTER}
              className="btn-header btn-header--primary"
              onClick={() => setMenuOpen(false)}
            >
              {t('header.auth.register')}
            </Link>
          </div>
        )}
      </div>
      {/* Bottom mobile nav */}
      <nav className={`bottom-nav ${tutorMode ? 'bottom-nav-tutor' : 'bottom-nav-student'}`} aria-label="Mobile bottom navigation">
        {(tutorMode ? tutorNavItems : studentNavItems).map(({ href, label, icon: IconComponent }) => (
          <Link 
            key={`bottom-${href}`}
            href={href}
            className={`bottom-nav-item ${isActiveRoute(href) ? 'active' : ''}`}
          >
            <div className="bottom-nav-icon-container">
              <IconComponent 
                size={22} 
                className="bottom-nav-icon" 
                fill={isActiveRoute(href) ? 'currentColor' : 'none'}
              />
            </div>
            <span className="bottom-nav-label">{label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}

