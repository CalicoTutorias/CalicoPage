"use client";

import { useMemo } from "react";
import { Trash2, Plus, CalendarDays } from "lucide-react";
import { AvailabilityService } from "../../services/core/AvailabilityService";
import "./TutorWeeklyBlocksPanel.css";

function timeToHHMM(value) {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default function TutorWeeklyBlocksPanel({ blocks, locale, t, onReload, onAddForDay }) {
  const dayOrder = useMemo(() => [1, 2, 3, 4, 5, 6, 0], []);

  const byDay = useMemo(() => {
    const map = new Map();
    dayOrder.forEach((d) => map.set(d, []));
    (blocks || []).forEach((b) => {
      const dow = b.dayOfWeek;
      if (!map.has(dow)) map.set(dow, []);
      map.get(dow).push(b);
    });
    map.forEach((list) => {
      list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    });
    return map;
  }, [blocks, dayOrder]);

  const dayLabel = (dow) => {
    const d = new Date(2024, 0, dow === 0 ? 7 : dow);
    return d.toLocaleDateString(locale === "en" ? "en-US" : "es-ES", { weekday: "long" });
  };

  const handleDelete = async (id) => {
    const r = await AvailabilityService.deleteAvailability(id);
    if (r.success) onReload?.();
  };

  return (
    <section className="weekly-blocks-panel" id="weekly-availability-editor">
      <div className="weekly-blocks-panel__head">
        <div className="weekly-blocks-panel__title-row">
          <CalendarDays className="weekly-blocks-panel__icon" size={22} aria-hidden />
          <div>
            <h3 className="weekly-blocks-panel__title">{t("tutorAvailability.weeklySectionTitle")}</h3>
            <p className="weekly-blocks-panel__hint">{t("tutorAvailability.weeklySectionHint")}</p>
          </div>
        </div>
      </div>

      <div className="weekly-blocks-panel__grid">
        {dayOrder.map((dow) => {
          const list = byDay.get(dow) || [];
          return (
            <div key={dow} className="weekly-blocks-panel__day">
              <div className="weekly-blocks-panel__day-name">{dayLabel(dow)}</div>
              <ul className="weekly-blocks-panel__slots">
                {list.length === 0 ? (
                  <li className="weekly-blocks-panel__empty">{t("tutorAvailability.noBlocksThisDay")}</li>
                ) : (
                  list.map((b) => (
                    <li key={b.id} className="weekly-blocks-panel__slot">
                      <span className="weekly-blocks-panel__time">
                        {timeToHHMM(b.startTime)} – {timeToHHMM(b.endTime)}
                      </span>
                      <button
                        type="button"
                        className="weekly-blocks-panel__delete"
                        onClick={() => handleDelete(b.id)}
                        title={t("tutorAvailability.removeBlock")}
                        aria-label={t("tutorAvailability.removeBlock")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                className="weekly-blocks-panel__add"
                onClick={() => onAddForDay?.(dow)}
              >
                <Plus size={16} />
                {t("tutorAvailability.addBlockForDay")}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
