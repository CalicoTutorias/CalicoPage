'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, BarChart3, FileClock, ShieldCheck, Wallet, TrendingUp, UserSearch, CalendarPlus, BookOpen, Bell } from 'lucide-react';
import routes from '../../../../routes';
import { useI18n } from '../../../../lib/i18n';

const NAV_ITEMS = [
  { href: '/home/admin/dashboard', i18nKey: 'admin.shell.nav.dashboard', Icon: BarChart3,  activePrefix: '/home/admin/dashboard' },
  { href: routes.ADMIN_GROWTH,     i18nKey: 'admin.shell.nav.growth',    Icon: TrendingUp, activePrefix: routes.ADMIN_GROWTH },
  { href: routes.ADMIN_USERS,      i18nKey: 'admin.shell.nav.users',     Icon: UserSearch, activePrefix: routes.ADMIN_USERS },
  { href: routes.ADMIN_TUTORS,     i18nKey: 'admin.shell.nav.tutors',    Icon: Users,      activePrefix: routes.ADMIN_TUTORS },
  { href: routes.ADMIN_COURSES,    i18nKey: 'admin.shell.nav.courses',   Icon: BookOpen,   activePrefix: routes.ADMIN_COURSES },
  { href: routes.ADMIN_COURSE_NOTIFY, i18nKey: 'admin.shell.nav.courseNotify', Icon: Bell, activePrefix: routes.ADMIN_COURSE_NOTIFY },
  { href: routes.ADMIN_MANUAL_SESSIONS, i18nKey: 'admin.shell.nav.manualSessions', Icon: CalendarPlus, activePrefix: routes.ADMIN_MANUAL_SESSIONS },
  { href: '/home/admin/payouts',   i18nKey: 'admin.shell.nav.payouts',   Icon: Wallet,     activePrefix: '/home/admin/payouts' },
  { href: '/home/admin/audit',     i18nKey: 'admin.shell.nav.audit',     Icon: FileClock,  activePrefix: '/home/admin/audit' },
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
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">

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

          {/* Sidebar / nav */}
          <nav aria-label={t('admin.shell.title')} className="lg:w-56 flex-shrink-0">
            <ul className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
              {NAV_ITEMS.map(({ href, i18nKey, Icon, activePrefix }) => {
                const isActive = pathname?.startsWith(activePrefix);
                const base =
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition';
                return (
                  <li key={href}>
                    <Link
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
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
