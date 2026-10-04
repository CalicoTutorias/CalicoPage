"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageSectionHeader from "../../components/PageSectionHeader/PageSectionHeader";
import { Button } from "../../../components/ui/button";
import { useI18n } from "../../../lib/i18n";
import { countKey, formatEventDate, formatEventTimeRange } from "../../../lib/utils/event-format";
import routes from "../../../routes";
import { EventService } from "../../services/core/EventService";
import "./TutorEventos.css";

const isCanceled = (event) => event.status === "Canceled";
/** Canceled events go after the active ones; `byDate` orders inside each group. */
const canceledLast = (byDate) => (a, b) => isCanceled(a) - isCanceled(b) || byDate(a, b);

function EventRow({ event, t, locale }) {
  // A canceled event's meeting link is dead: never print it.
  const meetingUrl = event.modality === "Virtual" && !isCanceled(event) ? event.meetingUrl : null;
  const where = meetingUrl ? (
    <a className="tutor-eventos-row__link" href={meetingUrl} target="_blank" rel="noopener noreferrer">
      {meetingUrl}
    </a>
  ) : event.modality === "Virtual" ? (
    t("events.common.virtual")
  ) : (
    event.location || t("events.common.inPerson")
  );
  return (
    <li className="tutor-eventos-row">
      <div>
        <h3 className="tutor-eventos-row__title">
          <Link href={routes.EVENT_DETAIL(event.slug)}>{event.title}</Link>
          {event.status === "Canceled" && (
            <span className="tutor-eventos-badge">{t("events.common.canceled")}</span>
          )}
        </h3>
        <p className="tutor-eventos-row__meta">
          {formatEventDate(event.startsAt, locale)} · {formatEventTimeRange(event.startsAt, event.endsAt, locale)} ({t("events.common.bogotaTime")})
        </p>
        <p className="tutor-eventos-row__meta">
          {t(countKey("events.tutor.confirmed", event.confirmedCount), { count: event.confirmedCount })} · {where}
        </p>
      </div>
      <Button asChild variant="tutor" size="sm">
        <Link href={routes.EVENT_DETAIL(event.slug)}>{t("events.tutor.publicLink")}</Link>
      </Button>
    </li>
  );
}

function Section({ id, title, events, t, locale }) {
  if (events.length === 0) return null;
  return (
    <section className="tutor-eventos-section">
      <h2 className="tutor-eventos-section__title">{title}</h2>
      <ul className="tutor-eventos-list" data-testid={id}>
        {events.map((event) => (
          <EventRow key={event.id} event={event} t={t} locale={locale} />
        ))}
      </ul>
    </section>
  );
}

export default function TutorEventos() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    EventService.getTutorEvents().then((res) => {
      if (!active) return;
      if (!res?.success) {
        setError(true);
        return;
      }
      const now = Date.now();
      const events = res.events ?? [];
      setData({
        total: events.length,
        upcoming: events
          .filter((e) => new Date(e.endsAt).getTime() > now)
          .sort(canceledLast((a, b) => new Date(a.startsAt) - new Date(b.startsAt))),
        past: events
          .filter((e) => new Date(e.endsAt).getTime() <= now)
          .sort(canceledLast((a, b) => new Date(b.startsAt) - new Date(a.startsAt))),
      });
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="tutor-eventos-page">
      <PageSectionHeader title={t("events.tutor.title")} subtitle={t("events.tutor.subtitle")} />
      {error && <p className="tutor-eventos-empty" role="alert">{t("events.tutor.loadError")}</p>}
      {data && data.total === 0 && (
        <div className="tutor-eventos-empty">
          <h2>{t("events.tutor.emptyTitle")}</h2>
          <p>{t("events.tutor.emptyText")}</p>
        </div>
      )}
      <Section id="tutor-events-upcoming" title={t("events.tutor.upcoming")} events={data?.upcoming ?? []} t={t} locale={locale} />
      <Section id="tutor-events-past" title={t("events.tutor.past")} events={data?.past ?? []} t={t} locale={locale} />
    </div>
  );
}
