"use client";

import Link from "next/link";
import { useI18n } from "../../lib/i18n";
import routes from "../../routes";
import styles from "../privacy-policy/privacy-policy.module.css";

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

export default function TermsAndConditionsPage() {
  const { t } = useI18n();

  const section = (baseKey) => ({
    title: t(`termsOfUse.${baseKey}.title`),
    body: t(`termsOfUse.${baseKey}.body`),
    items: t(`termsOfUse.${baseKey}.items`),
    after: t(`termsOfUse.${baseKey}.after`),
  });

  const s1 = section("s1");
  const s2 = section("s2");
  const s3 = section("s3");
  const s4 = section("s4");
  const s5 = section("s5");
  const s6 = section("s6");
  const s7 = section("s7");
  const s8 = section("s8");
  const s9 = section("s9");
  const s10 = section("s10");
  const s11 = section("s11");
  const s12 = section("s12");
  const s13 = section("s13");

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={routes.LANDING} className={styles.backButton}>
          {t("termsOfUse.nav.back")}
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{t("termsOfUse.title")}</h1>
        <p className={styles.lastUpdated}>{t("termsOfUse.lastUpdated")}</p>

        <Paragraph>{t("termsOfUse.intro")}</Paragraph>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s1.title}</h2>
          <Paragraph>{s1.body}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s2.title}</h2>
          <Paragraph>{s2.body}</Paragraph>
          <ListItems items={s2.items} />
          <Paragraph>{s2.after}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s3.title}</h2>
          <Paragraph>{s3.body}</Paragraph>
          <ListItems items={s3.items} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s4.title}</h2>
          <Paragraph>{s4.body}</Paragraph>
          <ListItems items={s4.items} />
          <Paragraph>{s4.after}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s5.title}</h2>
          <Paragraph>{s5.body}</Paragraph>
          <ListItems items={s5.items} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s6.title}</h2>
          <Paragraph>{s6.body}</Paragraph>
          <ListItems items={s6.items} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s7.title}</h2>
          <Paragraph>{s7.body}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s8.title}</h2>
          <Paragraph>{s8.body}</Paragraph>
          <ListItems items={s8.items} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s9.title}</h2>
          <Paragraph>{s9.body}</Paragraph>
          <ListItems items={s9.items} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s10.title}</h2>
          <Paragraph>{s10.body}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s11.title}</h2>
          <Paragraph>{s11.body}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s12.title}</h2>
          <Paragraph>{s12.body}</Paragraph>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{s13.title}</h2>
          <Paragraph>{s13.body}</Paragraph>
          <ul className={styles.list}>
            <li>
              <strong>{t("termsOfUse.s13.emailLabel")}</strong>{" "}
              <a href={`mailto:${t("termsOfUse.s13.email")}`} className={styles.link}>
                {t("termsOfUse.s13.email")}
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>{t("termsOfUse.footerCopyright")}</p>
        <p className={styles.footerLinks}>
          <Link href={routes.PRIVACY_POLICY} className={styles.link}>
            {t("landing.footer.links.privacyPolicy")}
          </Link>
        </p>
      </footer>
    </div>
  );
}
