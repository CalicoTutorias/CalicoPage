'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, BarChart3, FileClock, ShieldCheck, Wallet, TrendingUp, UserSearch, CalendarPlus, BookOpen, Bell } from 'lucide-react';
import routes from '../../../../routes';
import { useI18n } from '../../../../lib/i18n';

/**
 * Nav is grouped into four buckets so the sidebar reads as four intents
 * (analizar · gestionar personas · catálogo · dinero) instead of nine flat
 * links. Routes/pages are unchanged — this is purely how they're presented.
 */
const NAV_GROUPS = [
  {
    i18nKey: 'admin.shell.groups.analytics',
    items: [
      { href: '/home/admin/dashboard', i18nKey: 'admin.shell.nav.dashboard', Icon: BarChart3,  activePrefix: '/home/admin/dashboard' },
      { href: routes.ADMIN_GROWTH,     i18nKey: 'admin.shell.nav.growth',    Icon: TrendingUp, activePrefix: routes.ADMIN_GROWTH },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.community',
    items: [
      { href: routes.ADMIN_USERS,  i18nKey: 'admin.shell.nav.users',  Icon: UserSearch, activePrefix: routes.ADMIN_USERS },
      { href: routes.ADMIN_TUTORS, i18nKey: 'admin.shell.nav.tutors', Icon: Users,      activePrefix: routes.ADMIN_TUTORS },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.academic',
    items: [
      { href: routes.ADMIN_COURSES,         i18nKey: 'admin.shell.nav.courses',        Icon: BookOpen,     activePrefix: routes.ADMIN_COURSES },
      { href: routes.ADMIN_COURSE_NOTIFY,   i18nKey: 'admin.shell.nav.courseNotify',   Icon: Bell,         activePrefix: routes.ADMIN_COURSE_NOTIFY },
      { href: routes.ADMIN_MANUAL_SESSIONS, i18nKey: 'admin.shell.nav.manualSessions', Icon: CalendarPlus, activePrefix: routes.ADMIN_MANUAL_SESSIONS },
    ],
  },
  {
    i18nKey: 'admin.shell.groups.finance',
    items: [
      { href: '/home/admin/payouts', i18nKey: 'admin.shell.nav.payouts', Icon: Wallet,    activePrefix: '/home/admin/payouts' },
      { href: '/home/admin/audit',   i18nKey: 'admin.shell.nav.audit',   Icon: FileClock, activePrefix: '/home/admin/audit' },
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
                <div key={group.i18nKey} className="flex lg:flex-col gap-2 lg:gap-1">
                  <p className="hidden lg:block px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {t(group.i18nKey)}
                  </p>
                  {group.items.map(({ href, i18nKey, Icon, activePrefix }) => {
                    const isActive = pathname?.startsWith(activePrefix);
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
