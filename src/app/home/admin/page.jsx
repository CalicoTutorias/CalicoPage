'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, BookPlus, CalendarClock, CalendarDays, CalendarPlus, DollarSign, GraduationCap,
  Megaphone, RefreshCcw, TicketPercent, UserPlus, UserSearch, Users, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '@/app/services/core/AdminService';
import { useI18n } from '@/lib/i18n';
import routes from '@/routes';
import InboxCard from './_components/home/InboxCard';
import KpiCard from './_components/KpiCard';
import { ERROR_BOX, INK, MUTED } from './eventos/_components/ui';

const NS = 'admin.home';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Nombre del día de la semana (0 = domingo) en el idioma activo. */
function weekdayName(weekday, locale) {
  // 2024-01-07 fue domingo.
  return new Date(Date.UTC(2024, 0, 7 + weekday))
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', timeZone: 'UTC' });
}

function fetchHome() {
  return Promise.all([
    AdminService.getInbox(),
    AdminService.metricsOverview().catch(() => null),
  ]);
}

/**
 * /home/admin — Inicio: centro de operación
 * (docs/admin/ADMIN-REORG-FUNCTIONAL.md §4).
 *   A. «Requiere acción»: una tarjeta por cola, con contador, antigüedad y
 *      enlace a la vista ya filtrada (GET /api/admin/inbox).
 *   B. Pulso: KPIs de solo lectura, con las mismas definiciones de Métricas.
 *   C. Accesos rápidos.
 */
export default function AdminHomePage() {
  const { t, locale, formatCurrency, formatDate } = useI18n();
  // `loadedAt`: momento de la carga, referencia para «hace N días» (leer el
  // reloj durante el render no es puro).
  const [inbox, setInbox] = useState({ loading: true, items: [], error: false, loadedAt: null });
  const [overview, setOverview] = useState(null);

  const apply = useCallback(([inboxRes, ovRes]) => {
    setInbox(inboxRes.success
      ? { loading: false, items: inboxRes.items || [], error: false, loadedAt: Date.parse(inboxRes.generatedAt) || null }
      : { loading: false, items: [], error: true, loadedAt: null });
    setOverview(ovRes?.success ? ovRes : null);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchHome().then((res) => { if (!ignore) apply(res); });
    return () => { ignore = true; };
  }, [apply]);

  const refresh = async () => {
    setInbox((s) => ({ ...s, loading: true }));
    apply(await fetchHome());
  };

  const age = (date) => {
    if (!date || !inbox.loadedAt) return null;
    const days = Math.floor((inbox.loadedAt - new Date(date).getTime()) / DAY_MS);
    return days <= 0 ? t(`${NS}.oldestToday`) : t(`${NS}.oldestDays`, { days });
  };
  const shortDate = (date) => formatDate(date, { day: 'numeric', month: 'short' });

  // Contenido de cada tarjeta según su cola. Devuelve las props de InboxCard.
  const CARDS = {
    unbooked: (it) => ({
      icon: AlertTriangle,
      href: routes.ADMIN_SESSIONS_TAB('unbooked'),
      details: [age(it.oldestAt)],
    }),
    applications: (it) => ({
      icon: UserPlus,
      href: routes.ADMIN_TUTORS,
      details: [age(it.oldestAt)],
    }),
    recruitment: (it) => ({
      icon: GraduationCap,
      href: routes.ADMIN_TUTORS_TAB('recruitment'),
      headline: t(`${NS}.cards.recruitment.headline`, { waiting: it.waitingStudents ?? 0 }),
      children: it.top?.length ? (
        <ul className="mt-2 flex flex-col gap-1">
          {it.top.map((c) => (
            <li key={c.courseId} className="flex items-baseline justify-between gap-2 text-xs">
              <span className={`min-w-0 truncate ${INK}`}>
                <span className="font-mono font-semibold">{c.courseCode}</span> {c.courseName}
              </span>
              <span className={`shrink-0 ${MUTED}`}>{t(`${NS}.cards.recruitment.waiting`, { count: c.waiting })}</span>
            </li>
          ))}
        </ul>
      ) : null,
    }),
    eventApprovals: (it) => ({
      icon: CalendarDays,
      href: it.nextEvent ? routes.ADMIN_EVENT_DETAIL(it.nextEvent.id) : routes.ADMIN_EVENTS,
      headline: it.nextEvent
        ? t(`${NS}.cards.eventApprovals.next`, {
          title: it.nextEvent.title, date: shortDate(it.nextEvent.startsAt), count: it.nextEvent.count,
        })
        : null,
      details: [it.eventsCount > 1 ? t(`${NS}.cards.eventApprovals.events`, { count: it.eventsCount }) : null],
    }),
    payouts: (it) => ({
      icon: Wallet,
      href: routes.ADMIN_PAYOUTS,
      headline: t(`${NS}.cards.payouts.owed`, { amount: formatCurrency(it.amountOwed ?? 0, 'COP') }),
      details: [
        it.cutoffToday
          ? t(`${NS}.cards.payouts.cutoffToday`)
          : t(`${NS}.cards.payouts.cutoff`, { day: weekdayName(it.cutoffWeekday ?? 5, locale) }),
      ],
    }),
    courseRequests: () => ({
      icon: BookPlus,
      href: routes.ADMIN_COURSES_TAB('courseRequests'),
    }),
    suggestions: (it) => ({
      icon: Megaphone,
      href: routes.ADMIN_COURSES_TAB('suggestions'),
      details: [age(it.oldestAt)],
    }),
    pendingSoon: (it) => ({
      icon: CalendarClock,
      href: routes.ADMIN_SESSIONS,
      details: [it.nextAt ? t(`${NS}.cards.pendingSoon.next`, { date: formatDate(it.nextAt, { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', day: 'numeric', month: 'short' }) }) : null],
    }),
  };

  const QUICK_ACTIONS = [
    { key: 'manualSession', href: routes.ADMIN_MANUAL_SESSIONS, Icon: CalendarPlus },
    { key: 'newEvent', href: routes.ADMIN_EVENT_NEW, Icon: CalendarDays },
    { key: 'coupons', href: routes.ADMIN_COUPONS, Icon: TicketPercent },
    { key: 'news', href: routes.ADMIN_NEWS, Icon: Megaphone },
    { key: 'users', href: routes.ADMIN_USERS, Icon: UserSearch },
  ];

  const pending = inbox.items.filter((it) => it.ok && it.count > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-lg font-bold ${INK}`}>{t(`${NS}.title`)}</h2>
          <p className={`text-xs ${MUTED}`}>
            {inbox.loading
              ? t('common.loading')
              : pending > 0
                ? t(`${NS}.pendingSummary`, { count: pending })
                : t(`${NS}.allClear`)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={inbox.loading}>
          <RefreshCcw className={inbox.loading ? 'animate-spin' : ''} />
          {t(`${NS}.refresh`)}
        </Button>
      </div>

      {/* A. Requiere acción */}
      <section aria-labelledby="admin-home-inbox" className="flex flex-col gap-3">
        <h3 id="admin-home-inbox" className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
          {t(`${NS}.inboxTitle`)}
        </h3>
        {inbox.error && <p className={ERROR_BOX}>{t(`${NS}.error`)}</p>}
        {inbox.loading && inbox.items.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-36 rounded-[var(--radius-xl)] bg-[var(--calico-slate-100)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {inbox.items.map((it) => {
              const extra = CARDS[it.key]?.(it) ?? {};
              return (
                <InboxCard
                  key={it.key}
                  {...extra}
                  title={t(`${NS}.cards.${it.key}.title`)}
                  cta={t(`${NS}.cards.${it.key}.cta`)}
                  failed={!it.ok}
                  errorLabel={t(`${NS}.cardError`)}
                  okLabel={t(`${NS}.ok`)}
                  severity={it.ok ? it.severity : 'ok'}
                  severityLabel={t(`${NS}.severity.${it.severity}`)}
                  count={it.count}
                  overdueLabel={it.overdue ? t(`${NS}.overdue`) : null}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* B. Pulso */}
      <section aria-labelledby="admin-home-pulse" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="admin-home-pulse" className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
            {t(`${NS}.pulseTitle`)}
          </h3>
          <Link href={routes.ADMIN_METRICS} className="text-xs font-semibold text-[var(--calico-orange-text)] hover:underline">
            {t(`${NS}.seeMetrics`)}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            icon={CalendarDays}
            label={t('admin.dashboard.kpi.sessionsThisWeek')}
            value={overview?.sessionsThisWeek ?? '—'}
            tone="emerald"
            loading={inbox.loading && !overview}
          />
          <KpiCard
            icon={DollarSign}
            label={t('admin.dashboard.kpi.revenueThisMonth')}
            value={overview ? formatCurrency(overview.revenueThisMonth, 'COP') : '—'}
            loading={inbox.loading && !overview}
          />
          <KpiCard
            icon={Users}
            label={t('admin.dashboard.kpi.activeTutors')}
            value={overview?.activeTutors ?? '—'}
            tone="blue"
            loading={inbox.loading && !overview}
          />
        </div>
      </section>

      {/* C. Accesos rápidos */}
      <section aria-labelledby="admin-home-quick" className="flex flex-col gap-3">
        <h3 id="admin-home-quick" className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
          {t(`${NS}.quickTitle`)}
        </h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ key, href, Icon }) => (
            <Button key={key} asChild size="sm" variant="outline">
              <Link href={href}>
                <Icon />
                {t(`${NS}.quick.${key}`)}
              </Link>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
