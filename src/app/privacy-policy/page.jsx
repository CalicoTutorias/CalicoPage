"use client";

import Link from "next/link";
import { useI18n } from "../../lib/i18n";
import routes from "../../routes";
import styles from "./privacy-policy.module.css";

function Paragraph({ children }) {
  if (children == null || typeof children !== "string" || !children.trim()) return null;
  return <p className={styles.text}>{children}</p>;
}

function ListItems({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className={styles.list}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicy() {
  const { t } = useI18n();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={routes.LANDING} className={styles.backButton}>
          {t("privacyPolicy.nav.back")}
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{t("privacyPolicy.title")}</h1>
        <p className={styles.lastUpdated}>{t("privacyPolicy.lastUpdated")}</p>

        {/* 1 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s1.title")}</h2>
          <Paragraph>{t("privacyPolicy.s1.body")}</Paragraph>
        </section>

        {/* 2 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s2.title")}</h2>
          <Paragraph>{t("privacyPolicy.s2.intro")}</Paragraph>
          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s2.sub1Title")}</h3>
          <ListItems items={t("privacyPolicy.s2.sub1Items")} />
          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s2.sub2Title")}</h3>
          <ListItems items={t("privacyPolicy.s2.sub2Items")} />
        </section>

        {/* 3 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s3.title")}</h2>
          <Paragraph>{t("privacyPolicy.s3.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s3.items")} />
        </section>

        {/* 4 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s4.title")}</h2>
          <Paragraph>{t("privacyPolicy.s4.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s4.items")} />
          <p className={styles.text}>
            <strong>{t("privacyPolicy.s4.noSell")}</strong>
          </p>
        </section>

        {/* 5 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s5.title")}</h2>
          <Paragraph>{t("privacyPolicy.s5.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s5.items")} />
          <Paragraph>{t("privacyPolicy.s5.after")}</Paragraph>
        </section>

        {/* 6 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s6.title")}</h2>
          <Paragraph>{t("privacyPolicy.s6.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s6.items")} />
          <Paragraph>{t("privacyPolicy.s6.after")}</Paragraph>
        </section>

        {/* 7 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s7.title")}</h2>
          <Paragraph>{t("privacyPolicy.s7.body")}</Paragraph>
        </section>

        {/* 8 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s8.title")}</h2>
          <Paragraph>{t("privacyPolicy.s8.body")}</Paragraph>
        </section>

        {/* 9 — Google Calendar (subsections) */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s9.title")}</h2>
          <Paragraph>{t("privacyPolicy.s9.intro")}</Paragraph>

          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s9.sub1Title")}</h3>
          <Paragraph>{t("privacyPolicy.s9.sub1Intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s9.sub1Items")} />

          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s9.sub2Title")}</h3>
          <Paragraph>{t("privacyPolicy.s9.sub2Intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s9.sub2Items")} />
          <Paragraph>{t("privacyPolicy.s9.sub2After")}</Paragraph>

          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s9.sub3Title")}</h3>
          <Paragraph>{t("privacyPolicy.s9.sub3Body")}</Paragraph>

          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s9.sub4Title")}</h3>
          <Paragraph>{t("privacyPolicy.s9.sub4Body")}</Paragraph>

          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s9.sub5Title")}</h3>
          <p className={styles.text}>
            {t("privacyPolicy.s9.sub5Intro")}{" "}
            <a
              href={t("privacyPolicy.s9.sub5PolicyUrl")}
              className={styles.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("privacyPolicy.s9.sub5PolicyLabel")}
            </a>
            {t("privacyPolicy.s9.sub5After")}
          </p>
          <ListItems items={t("privacyPolicy.s9.sub5Items")} />

          <h3 className={styles.subsectionTitle}>{t("privacyPolicy.s9.sub6Title")}</h3>
          <p className={styles.text}>
            {t("privacyPolicy.s9.sub6Body")}{" "}
            <a
              href={t("privacyPolicy.s9.sub6LinkUrl")}
              className={styles.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("privacyPolicy.s9.sub6LinkLabel")}
            </a>
            {t("privacyPolicy.s9.sub6After")}
          </p>
        </section>

        {/* 10 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s10.title")}</h2>
          <Paragraph>{t("privacyPolicy.s10.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s10.items")} />
          <Paragraph>{t("privacyPolicy.s10.after")}</Paragraph>
        </section>

        {/* 11 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s11.title")}</h2>
          <Paragraph>{t("privacyPolicy.s11.body")}</Paragraph>
        </section>

        {/* 12 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s12.title")}</h2>
          <Paragraph>{t("privacyPolicy.s12.body")}</Paragraph>
        </section>

        {/* 13 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s13.title")}</h2>
          <Paragraph>{t("privacyPolicy.s13.body")}</Paragraph>
        </section>

        {/* 14 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s14.title")}</h2>
          <Paragraph>{t("privacyPolicy.s14.intro")}</Paragraph>
          <ul className={styles.list}>
            <li>
              <strong>{t("privacyPolicy.s14.emailLabel")}</strong>{" "}
              <a href={`mailto:${t("privacyPolicy.s14.email")}`} className={styles.link}>
                {t("privacyPolicy.s14.email")}
              </a>
            </li>
            <li>
              <strong>{t("privacyPolicy.s14.websiteLabel")}</strong>{" "}
              <a
                href={t("privacyPolicy.s14.websiteUrl")}
                className={styles.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("privacyPolicy.s14.websiteUrl")}
              </a>
            </li>
          </ul>
          <Paragraph>{t("privacyPolicy.s14.after")}</Paragraph>
        </section>

        {/* 15 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("privacyPolicy.s15.title")}</h2>
          <Paragraph>{t("privacyPolicy.s15.body")}</Paragraph>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>{t("privacyPolicy.footerCopyright")}</p>
        <p className={styles.footerLinks}>
          <Link href={routes.TERMS_AND_CONDITIONS} className={styles.link}>
            {t("landing.footer.links.termsAndConditions")}
          </Link>
        </p>
      </footer>
    </div>
  );
}
