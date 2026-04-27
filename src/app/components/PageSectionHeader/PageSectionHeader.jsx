"use client";

import { ChevronLeft } from "lucide-react";
import "./PageSectionHeader.css";

/**
 * Shared page header: surface card with optional back control, title, subtitle, actions, and optional below row.
 * Styling uses CSS variables from globals.css / .student-app-root / .tutor-app-root.
 */
export default function PageSectionHeader({
  title,
  subtitle,
  actions,
  below,
  belowVariant = "default",
  titleClassName = "",
  className = "",
  backAction = null,
  sticky = false,
}) {
  const headerClass = [
    "page-section-header",
    "page-section-header--surface",
    backAction ? "page-section-header--with-back" : "",
    sticky ? "page-section-header--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const textBlock =
    title != null && title !== false ? (
      <div className="page-section-header__text">
        <h1 className={`page-section-title ${titleClassName}`.trim()}>{title}</h1>
        {subtitle ? <p className="page-section-subtitle">{subtitle}</p> : null}
      </div>
    ) : subtitle ? (
      <div className="page-section-header__text">
        <p className="page-section-subtitle">{subtitle}</p>
      </div>
    ) : null;

  return (
    <header className={headerClass}>
      {backAction ? (
        <div className="page-section-header__nav-main">
          <button
            type="button"
            className="page-section-header__back"
            onClick={backAction.onClick}
            aria-label={backAction.ariaLabel ?? "Back"}
          >
            <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
          </button>
          <div
            className={
              actions
                ? "page-section-header__nav-body page-section-header__nav-body--with-actions"
                : "page-section-header__nav-body"
            }
          >
            {textBlock}
            {actions ? (
              <div className="page-section-header__actions">{actions}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="page-section-header__row">
          {textBlock}
          {actions ? (
            <div className="page-section-header__actions">{actions}</div>
          ) : null}
        </div>
      )}
      {below ? (
        <div
          className={`page-section-header__below ${
            belowVariant === "ruled"
              ? "page-section-header__below--ruled"
              : ""
          }`.trim()}
        >
          {below}
        </div>
      ) : null}
    </header>
  );
}
