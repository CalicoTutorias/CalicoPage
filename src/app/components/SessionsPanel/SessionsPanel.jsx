"use client";

/**
 * The sessions box on the tutor and student homes: Today / Upcoming / History.
 * A whole row opens the session detail (Meet link, attachments, materials, and
 * for the student the review); while a session is about to start or in
 * progress, the Meet button is right on the row. A student also sees which
 * past sessions still wait for their review (it unlocks the material).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, ArrowRight, BookOpen, Clock, Video, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import SessionDetailView from "../SessionDetailView/SessionDetailView";
import routes from "../../../routes";
import { classifySessions, sessionPhase, canJoinNow, needsStudentReview } from "./classifySessions";

const TABS = ["today", "upcoming", "history"];
const VISIBLE_ROWS = 5;
const REFRESH_MS = 60_000;

/** What changes between the two homes: data, accent colour, who is on the other side. */
const ROLES = {
  tutor: {
    load: () => TutoringSessionService.getTutorSessions(),
    titleKey: "sessionsPanel.title.tutor",
    viewAllHref: routes.TUTOR_MIS_TUTORIAS,
    tabVariant: "tutor",
    accent: {
      text: "text-[var(--calico-blue-tutor)]",
      hoverText: "hover:text-[var(--calico-blue-tutor-dark)]",
      soft: "bg-[var(--calico-blue-tutor-soft)]",
      hoverRow: "hover:border-[var(--calico-blue-tutor)] hover:bg-[var(--calico-blue-tutor-soft)]",
    },
    counterpartKey: "sessionsPanel.student",
    counterpart: (session) => {
      const student = session.participants?.[0]?.student;
      return student?.name || student?.email || "—";
    },
  },
  student: {
    load: () => TutoringSessionService.getStudentSessions(),
    titleKey: "sessionsPanel.title.student",
    viewAllHref: routes.HISTORY,
    tabVariant: "cta",
    accent: {
      text: "text-[var(--calico-orange-text)]",
      hoverText: "hover:text-[var(--calico-orange-strong)]",
      soft: "bg-[var(--calico-orange-soft)]",
      hoverRow: "hover:border-[var(--calico-orange)] hover:bg-[var(--calico-orange-soft)]",
    },
    counterpartKey: "sessionsPanel.tutor",
    counterpart: (session) => session.tutor?.name || session.tutor?.email || "—",
  },
};

const PHASE_CHIP = {
  live: "bg-[var(--calico-green-success)] text-white",
  ended: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  canceled: "bg-rose-50 text-rose-700",
  scheduled: "bg-gray-100 text-gray-700",
};

export default function SessionsPanel({ role = "tutor" }) {
  const config = ROLES[role] ?? ROLES.tutor;
  const { t, locale, formatDate } = useI18n();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState(null); // chosen once the sessions arrive
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState(null);

  // State is only set in the promise callbacks, never synchronously in the effect.
  const load = useCallback(() => config.load()
    .then((list) => {
      setSessions(Array.isArray(list) ? list : []);
      setError(false);
    })
    .catch(() => setError(true))
    .finally(() => setLoading(false)), [config]);

  useEffect(() => { load(); }, [load]);

  // Keeps "in progress" and the Meet button honest while the page stays open.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(() => classifySessions(sessions, now), [sessions, now]);
  const activeTab = tab ?? (groups.today.length > 0 ? "today" : "upcoming");
  const rows = groups[activeTab].slice(0, VISIBLE_ROWS);
  const hiddenCount = groups[activeTab].length - rows.length;

  const timeRange = (session) => {
    const localeTag = locale === "en" ? "en-US" : "es-CO";
    const hour = (value) => new Date(value).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
    const day = activeTab === "today"
      ? t("sessionsPanel.today")
      : formatDate(session.startTimestamp, { weekday: "short", day: "numeric", month: "short" });
    return `${day} · ${hour(session.startTimestamp)} – ${hour(session.endTimestamp)}`;
  };

  const closeDetail = () => {
    setSelected(null);
    load(); // a cancellation, a review or new material made in the detail shows up at once
  };

  const { accent } = config;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${accent.soft}`}>
            <Calendar className={`w-5 h-5 ${accent.text}`} />
          </div>
          <h2 className="text-xl font-bold text-[#262528]">{t(config.titleKey)}</h2>
        </div>
        <Link
          href={config.viewAllHref}
          className={`flex items-center gap-1 text-sm font-semibold ${accent.text} ${accent.hoverText}`}
        >
          {t("sessionsPanel.viewAll")}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div role="tablist" aria-label={t(config.titleKey)} className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((name) => (
          <Button
            key={name}
            type="button"
            role="tab"
            size="sm"
            variant={activeTab === name ? config.tabVariant : "outline"}
            aria-selected={activeTab === name}
            onClick={() => setTab(name)}
          >
            {t(`sessionsPanel.tabs.${name}`)}
            <span className="text-xs opacity-80">({groups[name].length})</span>
          </Button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-4">
          {t("sessionsPanel.error")}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-8">
          <BookOpen className={`w-7 h-7 mx-auto mb-2 ${accent.text}`} />
          <p className="text-sm text-gray-500">{t(`sessionsPanel.empty.${role}.${activeTab}`)}</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((session) => {
            const phase = sessionPhase(session, now);
            const joinable = canJoinNow(session, now);
            const reviewDue = role === "student" && needsStudentReview(session, user?.uid, now);
            return (
              <li key={session.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(session)}
                  className={`flex-1 min-w-0 flex items-center justify-between gap-3 text-left rounded-xl border border-gray-100 px-4 py-3 transition-colors ${accent.hoverRow}`}
                  aria-label={t("sessionsPanel.openDetail", { course: session.course?.name || "" })}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="font-semibold text-sm text-[#262528] truncate">{session.course?.name}</p>
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${phase === "scheduled" ? `${accent.soft} ${accent.text}` : PHASE_CHIP[phase]}`}>
                        {t(`sessionsPanel.phase.${phase}`)}
                      </span>
                      {reviewDue && (
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-[var(--calico-orange-soft)] text-[var(--calico-orange-text)]">
                          {t("sessionsPanel.reviewDue")}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      {timeRange(session)}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {t(config.counterpartKey)} {config.counterpart(session)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
                {joinable && (
                  <Button asChild variant="success" className="h-auto self-stretch">
                    <a href={session.googleMeetLink} target="_blank" rel="noopener noreferrer">
                      <Video />
                      {t("sessionsPanel.joinMeet")}
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && hiddenCount > 0 && (
        <Link
          href={config.viewAllHref}
          className={`inline-flex items-center gap-1 mt-3 text-xs font-semibold ${accent.text} ${accent.hoverText}`}
        >
          {t("sessionsPanel.more", { count: hiddenCount })}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}

      {selected && <SessionDetailView session={selected} isModal onClose={closeDetail} />}
    </section>
  );
}
