"use client";

import React, {createContext, useContext, useEffect, useMemo, useState} from "react";

const I18nContext = createContext({
  locale: "es",
  t: (key, vars) => key,
  setLocale: () => {},
  formatCurrency: (n, currency) => String(n ?? 0),
  formatDate: (d, opts) => String(d ?? ""),
  formatDateTime: (d, opts) => String(d ?? ""),
});

function loadMessages(locale) {
  try {
    switch (locale) {
      case "en":
        return require("./locales/en.json");
      case "es":
      default:
        return require("./locales/es.json");
    }
  } catch (e) {
    return {};
  }
}

export function I18nProvider({ children, initialLocale = "es" }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [messages, setMessages] = useState(() => loadMessages(initialLocale));

  useEffect(() => {
    // try to restore from localStorage
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("locale");
      if (saved && saved !== locale) {
        setLocaleState(saved);
        setMessages(loadMessages(saved));
      }
    }
  }, []);

  const setLocale = (next) => {
    setLocaleState(next);
    setMessages(loadMessages(next));
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem("locale", next); } catch {}
      try { document.cookie = `locale=${next};path=/;max-age=31536000`; } catch {}
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      try { document.documentElement.lang = locale === "en" ? "en" : "es"; } catch {}
    }
  }, [locale]);

  const t = useMemo(() => {
    const get = (obj, path) => path.split(".").reduce((o, p) => (o && o[p] != null ? o[p] : undefined), obj);
    const interpolate = (str, vars) =>
      typeof str === "string"
        ? str.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : `{${k}}`))
        : str;
    return (key, vars) => {
      const val = get(messages, key) ?? key;
      if (val === key && typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        // Warn when a translation key is missing, to help verify i18n coverage
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Missing translation for key: ${key}`);
      }
      return interpolate(val, vars);
    };
  }, [messages]);

  const formatCurrency = (value, currency = "COP") => {
    try {
      return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value || 0);
    } catch {
      return String(value ?? 0);
    }
  };

  const formatDate = (date, options) => {
    if (!date) return "—";
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleDateString(locale === "en" ? "en-US" : "es-CO", options);
    } catch {
      return "—";
    }
  };

  const formatDateTime = (date, options) => {
    if (!date) return "—";
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleString(locale === "en" ? "en-US" : "es-CO", options ?? {
        year: "numeric", month: "short", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const value = useMemo(() => ({ locale, t, setLocale, formatCurrency, formatDate, formatDateTime }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
