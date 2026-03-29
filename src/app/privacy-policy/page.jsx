"use client";

import Link from "next/link";
import styles from "./privacy-policy.module.css";
import routes from "../../routes";
import { useI18n } from "../../lib/i18n";

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
  const p = (key) => t(`privacyPolicy.${key}`);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={routes.LANDING} className={styles.backButton}>
          {t("termsOfUse.nav.back")}
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{p("title")}</h1>
        <p className={styles.lastUpdated}>{p("lastUpdated")}</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s1.title")}</h2>
          <Paragraph>{p("s1.body")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s2.title")}</h2>
          <Paragraph>{p("s2.intro")}</Paragraph>
          <h3 className={styles.subsectionTitle}>{p("s2.sub1Title")}</h3>
          <ListItems items={t("privacyPolicy.s2.sub1Items")} />
          <h3 className={styles.subsectionTitle}>{p("s2.sub2Title")}</h3>
          <ListItems items={t("privacyPolicy.s2.sub2Items")} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s3.title")}</h2>
          <Paragraph>{p("s3.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s3.items")} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s4.title")}</h2>
          <Paragraph>{p("s4.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s4.items")} />
          <Paragraph>{p("s4.noSell")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s5.title")}</h2>
          <Paragraph>{p("s5.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s5.items")} />
          <Paragraph>{p("s5.after")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s6.title")}</h2>
          <Paragraph>{p("s6.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s6.items")} />
          <Paragraph>{p("s6.after")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s7.title")}</h2>
          <Paragraph>{p("s7.body")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s8.title")}</h2>
          <Paragraph>{p("s8.body")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s9.title")}</h2>
          <Paragraph>{p("s9.intro")}</Paragraph>
          <ListItems items={t("privacyPolicy.s9.items")} />
          <Paragraph>{p("s9.after")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s10.title")}</h2>
          <Paragraph>{p("s10.body")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s11.title")}</h2>
          <Paragraph>{p("s11.body")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s12.title")}</h2>
          <Paragraph>{p("s12.body")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s13.title")}</h2>
          <Paragraph>{p("s13.intro")}</Paragraph>
          <ul className={styles.list}>
            <li>
              <strong>{p("s13.emailLabel")}</strong>{" "}
              <a href={`mailto:${p("s13.email")}`} className={styles.link}>
                {p("s13.email")}
              </a>
            </li>
            <li>
              <strong>{p("s13.websiteLabel")}</strong>{" "}
              <a href={p("s13.websiteUrl")} className={styles.link} target="_blank" rel="noopener noreferrer">
                {p("s13.websiteUrl")}
              </a>
            </li>
          </ul>
          <Paragraph>{p("s13.after")}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{p("s14.title")}</h2>
          <Paragraph>{p("s14.body")}</Paragraph>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>{p("footerCopyright")}</p>
        <p className={styles.footerLinks}>
          <Link href={routes.TERMS_AND_CONDITIONS} className={styles.link}>
            {t("landing.footer.links.termsAndConditions")}
          </Link>
        </p>
      </footer>
    </div>
  );
}
