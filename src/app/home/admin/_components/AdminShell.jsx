'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, BarChart3, FileClock, ShieldCheck, Wallet, TrendingUp, UserSearch, CalendarDays, CalendarCheck, BookOpen, Megaphone, TicketPercent, Images, House } from 'lucide-react';
import routes from '../../../../routes';
import { useI18n } from '../../../../lib/i18n';

/**
 * Navegación del admin (docs/admin/ADMIN-REORG-FUNCTIONAL.md §3), ordenada
 * por intención y frecuencia: Inicio (lo pendiente) arriba, luego operar,
 * gestionar, analizar. Las variantes de una tarea son sub-pestañas dentro de
 * su sección (Tutorías → Registrar manual, Tutores → Reclutamiento…), no
 * entradas del menú. Auditoría va al pie: es del sistema.
 *
 * `exact`: activo solo en esa ruta (Inicio es prefijo de todas las demás).
 */
const NAV_GROUPS = [
  {
    i18nKey: null,
    items: [
      { href: routes.ADMIN, i18nKey: 'admin.shell.nav.home', Icon: House, activePrefix: routes.ADMIN, exact: true },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.operations',
    items: [
      { href: routes.ADMIN_SESSIONS, i18nKey: 'admin.shell.nav.sessions', Icon: CalendarCheck, activePrefix: routes.ADMIN_SESSIONS },
      { href: routes.ADMIN_EVENTS,   i18nKey: 'admin.shell.nav.events',   Icon: CalendarDays,  activePrefix: routes.ADMIN_EVENTS },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.people',
    items: [
      { href: routes.ADMIN_TUTORS, i18nKey: 'admin.shell.nav.tutors', Icon: Users,      activePrefix: routes.ADMIN_TUTORS },
      { href: routes.ADMIN_USERS,  i18nKey: 'admin.shell.nav.users',  Icon: UserSearch, activePrefix: routes.ADMIN_USERS },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.catalog',
    items: [
      { href: routes.ADMIN_COURSES, i18nKey: 'admin.shell.nav.courses', Icon: BookOpen, activePrefix: routes.ADMIN_COURSES },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.money',
    items: [
      { href: routes.ADMIN_PAYOUTS, i18nKey: 'admin.shell.nav.payouts', Icon: Wallet,        activePrefix: routes.ADMIN_PAYOUTS },
      { href: routes.ADMIN_COUPONS, i18nKey: 'admin.shell.nav.coupons', Icon: TicketPercent, activePrefix: routes.ADMIN_COUPONS },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.content',
    items: [
      { href: routes.ADMIN_NEWS,  i18nKey: 'admin.shell.nav.news',  Icon: Megaphone, activePrefix: routes.ADMIN_NEWS },
      { href: routes.ADMIN_POSTS, i18nKey: 'admin.shell.nav.posts', Icon: Images,    activePrefix: routes.ADMIN_POSTS },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.analytics',
    items: [
      { href: routes.ADMIN_METRICS, i18nKey: 'admin.shell.nav.dashboard', Icon: BarChart3,  activePrefix: routes.ADMIN_METRICS },
      { href: routes.ADMIN_GROWTH,  i18nKey: 'admin.shell.nav.growth',    Icon: TrendingUp, activePrefix: routes.ADMIN_GROWTH },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.system',
    footer: true,
    items: [
      { href: routes.ADMIN_AUDIT, i18nKey: 'admin.shell.nav.audit', Icon: FileClock, activePrefix: routes.ADMIN_AUDIT },
    ],
  },
];

/**
 * Layout shell shared by every /home/admin/** page.
 * Renders a fixed sidebar on desktop, a horizontal scroll-bar of pills on
 * mobile. Active item is highlighted by URL prefix match.
 */
export default function AdminShell({ children }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f7f6f1]">
      {/* Bottom padding is deliberately larger on mobile: the fixed bottom-nav
          (Header.css .bottom-nav) overlays the viewport there, and the global
          .app-shell-content reserve is only the bar's own height — this adds a
          comfortable gap so the last row of any list/table clears it. Resets to
          the normal rhythm at lg where the bottom-nav is gone. */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 lg:pt-8 lg:pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-100 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-800 leading-tight">
              {t('admin.shell.title')}
            </h1>
            <p className="text-xs text-gray-500">{t('admin.shell.subtitle')}</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar / nav — four groups. Desktop: vertical with group
              headings. Mobile: one horizontal scroll of pills, headings hidden. */}
          <nav aria-label={t('admin.shell.title')} className="lg:w-56 flex-shrink-0">
            <div className="flex lg:flex-col gap-2 lg:gap-5 overflow-x-auto lg:overflow-visible">
              {NAV_GROUPS.map((group) => (
                <div
                  key={group.i18nKey ?? 'home'}
                  className={`flex lg:flex-col gap-2 lg:gap-1 ${group.footer ? 'lg:mt-2 lg:pt-4 lg:border-t lg:border-[var(--calico-slate-200)]' : ''}`}
                >
                  {group.i18nKey && (
                    <p className="hidden lg:block px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {t(group.i18nKey)}
                    </p>
                  )}
                  {group.items.map(({ href, i18nKey, Icon, activePrefix, exact }) => {
                    const isActive = exact ? pathname === activePrefix : pathname?.startsWith(activePrefix);
                    const base =
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition';
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`${base} ${
                          isActive
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'text-gray-700 hover:bg-orange-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {t(i18nKey)}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </nav>

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
