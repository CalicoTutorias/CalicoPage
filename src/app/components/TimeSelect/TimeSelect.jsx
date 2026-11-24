"use client";

import "./TimeSelect.css";

/**
 * Hora en formato 24 h con dos selects (hora y minutos). Reemplaza
 * <input type="time">, que según el idioma del sistema muestra AM/PM y deja
 * escribir minutos que la API rechaza: aquí solo se ofrecen las marcas válidas
 * de un bloque de disponibilidad.
 *
 * value / onChange usan "HH:MM" ("" si aún no hay hora).
 */
export const SLOT_MINUTES = [0, 10, 20, 30, 40, 45, 50];

const pad = (n) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));

export default function TimeSelect({ id, value, onChange, hourLabel, minuteLabel, disabled = false }) {
  const [hour = "", minute = ""] = value ? value.split(":") : [];
  // Un valor viejo fuera de las marcas (p. ej. :15) se sigue mostrando.
  const minutes = SLOT_MINUTES.map(pad);
  if (minute && !minutes.includes(minute)) minutes.push(minute);

  return (
    <span className="time-select">
      <select
        id={id}
        value={hour}
        disabled={disabled}
        aria-label={hourLabel}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${minute || "00"}` : "")}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        id={id ? `${id}-minute` : undefined}
        value={minute}
        disabled={disabled || !hour}
        aria-label={minuteLabel}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
      >
        {!minute && <option value="">--</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </span>
  );
}
