"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, BookOpen, Award, Clock } from "lucide-react";
import Logo from "../../../../public/CalicoLogo.png";
import Logo2 from "../../../../public/Logo2.png";
import CalicoLogo from "../../../../public/CalicoLogo.png";
import routes from "../../../routes";
import styles from "./Landing.module.css";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useI18n();

  /* Detectar scroll */
  useEffect(() => {
    const handleScroll = () => {
      const isScrolledNow = window.scrollY > 10;
      if (isScrolledNow !== scrolled) setScrolled(isScrolledNow);
    };
    document.addEventListener("scroll", handleScroll, { passive: true });
    return () => document.removeEventListener("scroll", handleScroll);
  }, [scrolled]);

  /* Verificar que estamos en el cliente */
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) return null;

  return (
    <>
      {/* ------------------------  HEADER  ------------------------ */}
      <header
        className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}
      >
        <div className={styles.headerInner}>
          {/* Logo */}
          <Image src={CalicoLogo} alt="Calico" className={styles.logoImg} priority />

          {/* Acciones */}
          <div className={styles.actions}>
            <Link className={styles.privacyLink} href={routes.TERMS_AND_CONDITIONS}>
              {t('landing.header.termsAndConditions')}
            </Link>
            <Link
              className={styles.privacyLink}
              href={routes.PRIVACY_POLICY}
            >
              {t('landing.header.privacyPolicy')}
            </Link>
            {user.isLoggedIn ? (
              <Link
                className={`${styles.btn} ${
                  scrolled ? styles.btnSecondaryScrolled : styles.btnSecondary
                }`}
                href={routes.PROFILE}
              >
                {t('landing.header.viewProfile')}
              </Link>
            ) : (
              <>
                <Link
                  className={`${styles.btn} ${
                    scrolled ? styles.btnPrimaryScrolled : styles.btnPrimary
                  }`}
                  href={routes.REGISTER}
                >
                  {t('landing.header.signUp')}
                </Link>
                <Link
                  className={`${styles.btn} ${
                    scrolled ? styles.btnSecondaryScrolled : styles.btnSecondary
                  }`}
                  href={routes.LOGIN}
                >
                  {t('landing.header.login')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------  HERO  -------------------------- */}
      <section
        className={`${styles.hero} ${
          scrolled ? styles.heroHidden : styles.heroVisible
        }`}
      >
        <div className={styles.heroInner}>
          {/* Modern Split Layout */}
          <div className={styles.heroContainer}>
            {/* Left Side - Content */}
            <div className={styles.heroLeft}>
              
              <h1 className={styles.heroTitle}>
                {t('landing.hero.title', { accent: t('landing.hero.titleAccent') })}
              </h1>
              
              <p className={styles.heroSubtitle}>
                {t('landing.hero.subtitle')}
              </p>
              
              {/* CTA Buttons */}
              <div className={styles.heroCTAWrapper}>
                <Link className={styles.ctaButton} href={routes.HOME}>
                  <span>{t('landing.hero.cta.startLearning')}</span>
                  <span className={styles.ctaButtonIcon}>→</span>
                </Link>
                <Link className={styles.ctaButtonSecondary} href={routes.REGISTER}>
                  {t('landing.hero.cta.becomeTutor')}
                </Link>
              </div>
            </div>
            
            {/* Right Side - Visual */}
            <div className={styles.heroRight}>
              <div className={styles.heroVisual}>
                <div className={styles.heroLogoWrapper}>
                  <Image src={Logo} alt="Monitorias Uniandes" className={styles.heroLogo} sizes="(max-width: 700px) 120vw, 650px"/>
                </div>
                
                {/* Floating Elements */}
                <div className={styles.heroFloatingElements}>
                  <div className={styles.floatingElement} style={{'--delay': '0s'}}>
                    <Users className={styles.floatingIcon} />
                  </div>
                  <div className={styles.floatingElement} style={{'--delay': '0.5s'}}>
                    <BookOpen className={styles.floatingIcon} />
                  </div>
                  <div className={styles.floatingElement} style={{'--delay': '1s'}}>
                    <Award className={styles.floatingIcon} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------  KEY POINTS  -------------------- */}
      <section className={styles.keyPoints}>
        <div className={styles.keyPointsInner}>
          <h2 className={styles.keyPointsTitle}>{t('landing.keyPoints.title')}</h2>
          <div className={styles.keyPointsGrid}>
            <div className={styles.keyPointCard}>
              <div className={styles.keyPointIcon}>
                <Users className={styles.keyPointIconSvg} />
              </div>
              <h3 className={styles.keyPointTitle}>{t('landing.keyPoints.cards.expertTutors.title')}</h3>
              <p className={styles.keyPointDescription}>
                {t('landing.keyPoints.cards.expertTutors.description')}
              </p>
            </div>

            <div className={styles.keyPointCard}>
              <div className={styles.keyPointIcon}>
                <Clock className={styles.keyPointIconSvg} />
              </div>
              <h3 className={styles.keyPointTitle}>{t('landing.keyPoints.cards.flexibleSessions.title')}</h3>
              <p className={styles.keyPointDescription}>
                {t('landing.keyPoints.cards.flexibleSessions.description')}
              </p>
            </div>

            <div className={styles.keyPointCard}>
              <div className={styles.keyPointIcon}>
                <BookOpen className={styles.keyPointIconSvg} />
              </div>
              <h3 className={styles.keyPointTitle}>{t('landing.keyPoints.cards.personalizedMethods.title')}</h3>
              <p className={styles.keyPointDescription}>
                {t('landing.keyPoints.cards.personalizedMethods.description')}
              </p>
            </div>

            <div className={styles.keyPointCard}>
              <div className={styles.keyPointIcon}>
                <Award className={styles.keyPointIconSvg} />
              </div>
              <h3 className={styles.keyPointTitle}>{t('landing.keyPoints.cards.provenResults.title')}</h3>
              <p className={styles.keyPointDescription}>
                {t('landing.keyPoints.cards.provenResults.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------  STATISTICS  -------------------- */}
      <section className={styles.statistics}>
        <div className={styles.statisticsInner}>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>500+</div>
            <div className={styles.statLabel}>{t('landing.statistics.activeStudents')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>150+</div>
            <div className={styles.statLabel}>{t('landing.statistics.expertTutors')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>1000+</div>
            <div className={styles.statLabel}>{t('landing.statistics.completedSessions')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>4.8</div>
            <div className={styles.statLabel}>{t('landing.statistics.averageRating')}</div>
          </div>
        </div>
      </section>

      {/* ------------------------  ABOUT  ------------------------- */}
      <section className={styles.about}>
        <div className={styles.aboutInner}>
          <h2 className={styles.sectionTitle}>{t('landing.about.title')}</h2>
          <div className={styles.sectionLine} />
          <p className={styles.sectionText}>
            {t('landing.about.description')}
          </p>
        </div>

        {/* ------------ FEATURES GRID ------------- */}
        <div className={styles.featuresGrid}>
          {/* Card 1 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Users />
            </div>
            <h3 className={styles.featureTitle}>{t('landing.about.features.community.title')}</h3>
            <p className={styles.featureText}>
              {t('landing.about.features.community.description')}
            </p>
          </div>

          {/* Card 2 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <BookOpen />
            </div>
            <h3 className={styles.featureTitle}>{t('landing.about.features.learning.title')}</h3>
            <p className={styles.featureText}>
              {t('landing.about.features.learning.description')}
            </p>
          </div>

          {/* Card 3 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Award />
            </div>
            <h3 className={styles.featureTitle}>{t('landing.about.features.quality.title')}</h3>
            <p className={styles.featureText}>
              {t('landing.about.features.quality.description')}
            </p>
          </div>

          {/* Card 4 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Clock />
            </div>
            <h3 className={styles.featureTitle}>{t('landing.about.features.flexibility.title')}</h3>
            <p className={styles.featureText}>
              {t('landing.about.features.flexibility.description')}
            </p>
          </div>
        </div>

        {/* ----------------  MISIÓN ---------------- */}
        <div className={styles.mission}>
          <div className={styles.missionContent}>
            <h3 className={styles.missionTitle}>{t('landing.about.mission.title')}</h3>
            <p className={styles.missionText}>
              {t('landing.about.mission.description')}
            </p>
          </div>
          <div className={styles.missionEmojiWrapper}>
            <div className={styles.missionEmojiCircle}>🎓</div>
          </div>
        </div>
      </section>

      {/* ------------------------  FOOTER  ------------------------ */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerContent}>
            <div className={styles.footerBrand}>
              <Image src={CalicoLogo} alt="Calico" className={styles.footerLogo} />
              <p className={styles.footerTagline}>{t('landing.footer.tagline')}</p>
            </div>
            
            <div className={styles.footerLinks}>
              <h4 className={styles.footerLinksTitle}>{t('landing.footer.links.title')}</h4>
              <ul className={styles.footerLinksList}>
                <li>
                  <Link href={routes.TERMS_AND_CONDITIONS} className={styles.footerLink}>
                    {t('landing.footer.links.termsAndConditions')}
                  </Link>
                </li>
                <li>
                  <Link
                    href={routes.PRIVACY_POLICY}
                    className={styles.footerLink}
                  >
                    {t('landing.footer.links.privacyPolicy')}
                  </Link>
                </li>
                <li>
                  <Link
                    href={routes.HOME}
                    className={styles.footerLink}
                  >
                    {t('landing.footer.links.findTutors')}
                  </Link>
                </li>
                <li>
                  <Link
                    href={routes.REGISTER}
                    className={styles.footerLink}
                  >
                    {t('landing.footer.links.register')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          <div className={styles.footerBottom}>
            <p className={styles.footerCopyright}>
              © 2026 Calico Tutorías. {t('landing.footer.rights')}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
