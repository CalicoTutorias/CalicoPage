"use client";

import { useEffect, useRef, useState } from "react";
import {
  LifeBuoy,
  X,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  Bug,
  BookOpen,
  Mail,
  ExternalLink,
} from "lucide-react";
import { FaWhatsapp, FaDiscord } from "react-icons/fa";
import { useI18n } from "../../../lib/i18n";
import {
  SUPPORT_CONFIG,
  buildMailtoLink,
  buildWhatsAppLink,
} from "./supportConfig";
import "./SupportFAB.css";

const VIEW_MENU = "menu";
const VIEW_CONTACT = "contact";

export default function SupportFAB() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState(VIEW_MENU);
  const containerRef = useRef(null);

  const close = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        close();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Reset to menu view whenever the panel reopens.
  useEffect(() => {
    if (isOpen) setView(VIEW_MENU);
  }, [isOpen]);

  const togglePanel = () => setIsOpen((prev) => !prev);

  const openExternal = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    close();
  };

  const { contact, bugReportUrl, faqUrl } = SUPPORT_CONFIG;
  const hasFaq = Boolean(faqUrl);

  const contactChannels = [
    contact.email && {
      key: "email",
      icon: <Mail size={18} aria-hidden />,
      label: t("support.contact.email"),
      value: contact.email,
      href: buildMailtoLink(contact.email),
      external: false,
    },
    contact.whatsappNumber && {
      key: "whatsapp",
      icon: <FaWhatsapp size={18} aria-hidden />,
      label: t("support.contact.whatsapp"),
      value: contact.whatsappLabel || contact.whatsappNumber,
      href: buildWhatsAppLink(contact.whatsappNumber),
      external: true,
    },
    contact.discordUrl && {
      key: "discord",
      icon: <FaDiscord size={18} aria-hidden />,
      label: t("support.contact.discord"),
      value: t("support.contact.discordValue"),
      href: contact.discordUrl,
      external: true,
    },
  ].filter(Boolean);

  return (
    <div
      className="support-fab-root"
      ref={containerRef}
      data-open={isOpen ? "true" : "false"}
    >
      <div
        className={`support-fab-panel ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="support-fab-title"
        aria-hidden={!isOpen}
      >
        {view === VIEW_MENU ? (
          <>
            <header className="support-fab-header">
              <div className="support-fab-header-text">
                <h2 id="support-fab-title" className="support-fab-title">
                  {t("support.title")}
                </h2>
                <p className="support-fab-subtitle">{t("support.subtitle")}</p>
              </div>
              <button
                type="button"
                className="support-fab-close"
                onClick={close}
                aria-label={t("support.close")}
              >
                <X size={16} aria-hidden />
              </button>
            </header>

            <nav className="support-fab-menu">
              <button
                type="button"
                className="support-fab-menu-item"
                onClick={() => setView(VIEW_CONTACT)}
              >
                <span className="support-fab-menu-icon support-fab-menu-icon--contact">
                  <MessageCircle size={18} aria-hidden />
                </span>
                <span className="support-fab-menu-text">
                  <span className="support-fab-menu-label">
                    {t("support.menu.contact")}
                  </span>
                  <span className="support-fab-menu-desc">
                    {t("support.menu.contactDesc")}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  aria-hidden
                  className="support-fab-menu-chevron"
                />
              </button>

              <button
                type="button"
                className="support-fab-menu-item"
                onClick={() => openExternal(bugReportUrl)}
                disabled={!bugReportUrl}
              >
                <span className="support-fab-menu-icon support-fab-menu-icon--bug">
                  <Bug size={18} aria-hidden />
                </span>
                <span className="support-fab-menu-text">
                  <span className="support-fab-menu-label">
                    {t("support.menu.bug")}
                  </span>
                  <span className="support-fab-menu-desc">
                    {t("support.menu.bugDesc")}
                  </span>
                </span>
                <ExternalLink
                  size={14}
                  aria-hidden
                  className="support-fab-menu-chevron"
                />
              </button>

              {hasFaq && (
                <button
                  type="button"
                  className="support-fab-menu-item"
                  onClick={() => openExternal(faqUrl)}
                >
                  <span className="support-fab-menu-icon support-fab-menu-icon--faq">
                    <BookOpen size={18} aria-hidden />
                  </span>
                  <span className="support-fab-menu-text">
                    <span className="support-fab-menu-label">
                      {t("support.menu.faq")}
                    </span>
                    <span className="support-fab-menu-desc">
                      {t("support.menu.faqDesc")}
                    </span>
                  </span>
                  <ExternalLink
                    size={14}
                    aria-hidden
                    className="support-fab-menu-chevron"
                  />
                </button>
              )}
            </nav>
          </>
        ) : (
          <>
            <header className="support-fab-header">
              <button
                type="button"
                className="support-fab-back"
                onClick={() => setView(VIEW_MENU)}
                aria-label={t("support.back")}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <div className="support-fab-header-text">
                <h2 id="support-fab-title" className="support-fab-title">
                  {t("support.contact.title")}
                </h2>
                <p className="support-fab-subtitle">
                  {t("support.contact.subtitle")}
                </p>
              </div>
              <button
                type="button"
                className="support-fab-close"
                onClick={close}
                aria-label={t("support.close")}
              >
                <X size={16} aria-hidden />
              </button>
            </header>

            <ul className="support-fab-channels">
              {contactChannels.length === 0 ? (
                <li className="support-fab-empty">
                  {t("support.contact.empty")}
                </li>
              ) : (
                contactChannels.map((channel) => (
                  <li key={channel.key}>
                    <a
                      className="support-fab-channel"
                      href={channel.href}
                      target={channel.external ? "_blank" : undefined}
                      rel={
                        channel.external ? "noopener noreferrer" : undefined
                      }
                      onClick={close}
                    >
                      <span
                        className={`support-fab-channel-icon support-fab-channel-icon--${channel.key}`}
                      >
                        {channel.icon}
                      </span>
                      <span className="support-fab-channel-text">
                        <span className="support-fab-channel-label">
                          {channel.label}
                        </span>
                        <span className="support-fab-channel-value">
                          {channel.value}
                        </span>
                      </span>
                      <ExternalLink
                        size={14}
                        aria-hidden
                        className="support-fab-channel-arrow"
                      />
                    </a>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>

      <button
        type="button"
        className={`support-fab-button ${isOpen ? "is-open" : ""}`}
        onClick={togglePanel}
        aria-expanded={isOpen}
        aria-controls="support-fab-title"
        aria-label={isOpen ? t("support.close") : t("support.open")}
      >
        <span className="support-fab-button-icon">
          {isOpen ? (
            <X size={22} aria-hidden />
          ) : (
            <LifeBuoy size={22} aria-hidden />
          )}
        </span>
      </button>
    </div>
  );
}
