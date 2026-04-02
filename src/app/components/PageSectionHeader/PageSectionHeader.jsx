"use client";

import "./PageSectionHeader.css";

/**
 * Shared page header: large title + section description, optional actions (right) and optional block below (tabs, etc.).
 * Matches the tutor availability page header pattern.
 */
export default function PageSectionHeader({
  title,
  subtitle,
  actions,
  below,
  belowVariant = "default",
  titleClassName = "",
  className = "",
}) {
  return (
    <header
      className={`page-section-header page-section-header--surface ${className}`.trim()}
    >
      <div className="page-section-header__row">
        <div className="page-section-header__text">
          <h1
            className={`page-section-title ${titleClassName}`.trim()}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="page-section-subtitle">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="page-section-header__actions">{actions}</div>
        ) : null}
      </div>
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
