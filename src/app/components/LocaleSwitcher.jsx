"use client";

import React from "react";
import { useI18n } from "../../lib/i18n";

/**
 * Selector ES/EN compacto (segmented).
 * @param {"default"|"onDark"} variant — `onDark` para fondos oscuros (footer).
 */
export default function LocaleSwitcher({ className = "", variant = "default" }) {
  const { locale, setLocale } = useI18n();

  const shell =
    variant === "onDark"
      ? "border border-white/15 bg-white/[0.08] text-white/75 shadow-none"
      : "border border-white/80 bg-white/95 text-[#b45309]/70 shadow-sm backdrop-blur-sm";

  const active =
    variant === "onDark"
      ? "bg-white text-stone-900"
      : "bg-[#fff7ed] text-[#c2410c] ring-1 ring-[#ff9505]/50";

  const idle =
    variant === "onDark"
      ? "hover:bg-white/[0.12] hover:text-white"
      : "hover:bg-[#fff7ed]/60 hover:text-[#c2410c]";

  return (
    <div
      className={`inline-flex items-center rounded-full p-0.5 text-[11px] font-semibold tracking-wide ${shell} ${className}`.trim()}
      role="group"
      aria-label="Idioma / Language"
    >
      <button
        type="button"
        onClick={() => setLocale("es")}
        aria-pressed={locale === "es"}
        title="Español"
        className={`rounded-full px-2 py-1 transition-colors ${locale === "es" ? active : idle}`}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        title="English"
        className={`rounded-full px-2 py-1 transition-colors ${locale === "en" ? active : idle}`}
      >
        EN
      </button>
    </div>
  );
}
