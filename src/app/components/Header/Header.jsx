"use client";

import React, { useEffect, useState } from "react";
// Header.css is imported from the root server layout (src/app/layout.jsx) so it
// lands in the initial critical CSS and is applied before the first paint.
// Keeping the import only there avoids the first-load FOUC on this client
// component, which renders nothing until `mounted`.
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
  Shield,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import CalicoLogo from "../../../../public/CalicoLogo.png";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../../context/SecureAuthContext";
import { NotificationService } from "../../services/core/NotificationService";
import NotificationDropdown from "../NotificationDropdown/NotificationDropdown";
import routes from "../../../routes";
import { useI18n } from "../../../lib/i18n";
import LocaleSwitcher from "../LocaleSwitcher";

// ─── Header Avatar ─────────────────────────────────────────────────────────
// Shown in the top-right when the user is logged in. Renders their profile
// picture if available, falling back to initials on the orange chip. Sized
// to fill the existing 40×40 .profile-btn circle (35×35 on smaller screens
// via the existing media queries — the inner content scales via 100%).
//
// `key` on <img> tied to the URL ensures we don't keep showing a stale
// cached image after the user removes / re-uploads their picture.
function HeaderAvatar({ user }) {
  const name = user?.name || '';
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || <UserRound size={20} />;

  if (user?.profilePictureUrl) {
    return (
      <img
        key={user.profilePictureUrl}
        src={user.profilePictureUrl}
        alt={name || 'Perfil'}
        className="header-avatar-img"
      />
    );
  }
  return <span className="header-avatar-initials">{initials}</span>;
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const { t } = useI18n();

  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState("student"); // 'student' | 'tutor'
  const [menuOpen, setMenuOpen] = useState(false);   // ⟵ estado del menú

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Determine role from persisted preference for approved tutors.
    // This allows switching between tutor/student views without being overridden.
    if (user.isLoggedIn) {
      if (user.isTutorApproved) {
        const stored = typeof window !== "undefined" ? localStorage.getItem("rol") || "student" : "student";
        setRole(stored);
      } else {
        setRole("student");
      }
    } else {
      // If not logged in, check localStorage as fallback
      const stored = typeof window !== "undefined" ? localStorage.getItem("rol") || "student" : "student";
      setRole(stored);
    }
  }, [mounted, user.isLoggedIn, user.isTutorApproved]);

  useEffect(() => {
    if (!mounted) return;

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
    <>
    <header className={`header ${menuOpen ? "is-open" : ""} ${tutorMode ? "header--tutor-mode" : ""}`.trim()}>
      <Link href="/" className="logo">
        {/* Class name is intentionally specific (not ".logoImg") because the
            auth pages' stylesheets (Login.css, register.css) also define a
            ".logoImg" rule at 6rem for their branding panel. When navigating
            client-side from /login → /home, the login page's CSS stays loaded
            and its .logoImg wins the cascade against Header.css, blowing the
            header logo up to 96px until a hard reload drops that stylesheet. */}
        <Image src={CalicoLogo} alt="Calico" className="header-logo-img" priority />
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
                  strokeWidth={isActiveRoute(href) ? 2.4 : 1.85}
                  className="nav-icon"
                />
              </div>
              <span className="nav-label">{label}</span>
            </Link>
          )
        )}
      </nav>

      <div className="right-block">
        <div className="header-locale-wrap">
          <LocaleSwitcher />
        </div>
        {!loading && user.isLoggedIn && (
          <div className="role-indicator">
            {user.isTutorApproved ? (
              // Approved tutor: show the original toggle
              <button
                className={`role-badge ${tutorMode ? "tutor" : "student"}`}
                onClick={() => {
                  const newRole = role === "student" ? "tutor" : "student";
                  handleRoleChange(newRole);
                }}
              >
                {tutorMode ? t('header.roles.tutor') : t('header.roles.student')}
              </button>
            ) : user.tutorApplicationStatus === "Pending" ? (
              // Application in review: disabled badge
              <span className="role-badge role-badge--pending" title="Tu solicitud está siendo revisada">
                Solicitud en revisión
              </span>
            ) : null}
          </div>
        )}

        {!loading && (user.isLoggedIn ? (
          <div className="user-actions">
            {/* Admin shortcut — only visible to users with role=ADMIN.
                UX-only; the real guard is server-side in requireAdminUser. */}
            {user.isAdmin && (
              <Link
                href={routes.ADMIN}
                className="profile-btn"
                title={t('admin.shell.tooltip')}
                aria-label={t('admin.shell.tooltip')}
                onClick={() => setMenuOpen(false)}
              >
                <Shield size={20} />
              </Link>
            )}
            <NotificationDropdown />
            <Link
              href={routes.PROFILE}
              className="profile-btn profile-btn--avatar"
              onClick={() => setMenuOpen(false)}
              aria-label={t('header.navigation.profile') || 'Perfil'}
            >
              <HeaderAvatar user={user} />
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
        ))}
      </div>
    </header>
    {/* Bottom mobile nav — fuera del header para evitar que backdrop-filter atrape position:fixed */}
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
              strokeWidth={isActiveRoute(href) ? 2.4 : 1.85}
            />
          </div>
          <span className="bottom-nav-label">{label}</span>
        </Link>
      ))}
    </nav>
    </>
  );
}

