"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Award, Star, Users, TrendingUp, Calendar, CheckCircle } from "lucide-react";
import Logo from "../../../../public/CalicoLogo.png";
import routes from "../../../routes";
import styles from "./Landing.module.css";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";

const SUBJECTS = [
  'Cálculo Diferencial', 'Cálculo Integral', 'Cálculo Multivariado',
  'Álgebra Lineal', 'Ecuaciones Diferenciales', 'Probabilidad',
  'Física Mecánica', 'Electromagnetismo', 'Termodinámica',
  'Programación', 'Estructuras de Datos', 'Ing. de Software',
  'Economía', 'Estadística', 'Contabilidad',
  'Circuitos Eléctricos', 'Resistencia de Materiales', 'Geometría Analítica',
];

const MOCK_TUTORS = [
  { initials: 'MR', color: '#fdb61e', name: 'María Rodríguez', meta: 'Ing. Sistemas · Sem 6', rating: '4.9', reviews: 32, time: 'Hoy · 4:00 PM' },
  { initials: 'JP', color: '#3b82f6', name: 'Juan Paredes', meta: 'Matemáticas · Sem 8', rating: '4.8', reviews: 18, time: 'Hoy · 6:30 PM' },
];

const STEPS = [
  { num: '01', Icon: BookOpen,  titleKey: 'landing.howItWorks.step1.title', descKey: 'landing.howItWorks.step1.description', delay: '0s' },
  { num: '02', Icon: Calendar,  titleKey: 'landing.howItWorks.step2.title', descKey: 'landing.howItWorks.step2.description', delay: '0.15s' },
  { num: '03', Icon: Award,     titleKey: 'landing.howItWorks.step3.title', descKey: 'landing.howItWorks.step3.description', delay: '0.3s' },
];

const VIEW_BENEFITS = ['benefit1', 'benefit2', 'benefit3', 'benefit4'];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [view, setView] = useState('student');
  const rootRef = useRef(null);
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const showLoggedIn = !loading && user?.isLoggedIn;

  useEffect(() => {
    const handleScroll = () => {
      const now = window.scrollY > 10;
      if (now !== scrolled) setScrolled(now);
    };
    document.addEventListener("scroll", handleScroll, { passive: true });
    return () => document.removeEventListener("scroll", handleScroll);
  }, [scrolled]);

  useEffect(() => {
    if (!rootRef.current) return;
    const els = rootRef.current.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.dataset.reveal = 'visible';
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.12 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const isStudent = view === 'student';
  const accentVars = isStudent
    ? { '--accent': '#fdb61e', '--accent-dark': '#e8840a', '--accent-light': 'rgba(253,182,30,0.1)', '--accent-border': 'rgba(253,182,30,0.3)', '--accent-text': '#7a4a00' }
    : { '--accent': '#3b82f6', '--accent-dark': '#2563eb', '--accent-light': 'rgba(59,130,246,0.1)', '--accent-border': 'rgba(59,130,246,0.3)', '--accent-text': '#fff' };

  return (
    <div ref={rootRef} className={styles.landingRoot}>

      {/* ─── HEADER ──────────────────────────────── */}
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.headerInner}>
          <Image src={Logo} alt="Calico" className={styles.logoImg} priority />
          <nav className={styles.actions}>
            <Link className={styles.navLink} href={routes.TERMS_AND_CONDITIONS}>
              {t('landing.header.termsAndConditions')}
            </Link>
            <Link className={styles.navLink} href={routes.PRIVACY_POLICY}>
              {t('landing.header.privacyPolicy')}
            </Link>
            {showLoggedIn ? (
              <Link
                className={`${styles.btn} ${scrolled ? styles.btnPrimaryScrolled : styles.btnPrimary}`}
                href={routes.HOME}
              >
                {t('landing.header.viewProfile')}
              </Link>
            ) : (
              <>
                <Link
                  className={`${styles.btn} ${scrolled ? styles.btnPrimaryScrolled : styles.btnPrimary} ${loading ? styles.headerBtnLoading : ''}`}
                  href={routes.REGISTER}
                >
                  {t('landing.header.signUp')}
                </Link>
                <Link
                  className={`${styles.btn} ${scrolled ? styles.btnSecondaryScrolled : styles.btnSecondary} ${loading ? styles.headerBtnLoading : ''}`}
                  href={routes.LOGIN}
                >
                  {t('landing.header.login')}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ─── HERO ────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.blobOrange} aria-hidden="true" />
        <div className={styles.blobBlue} aria-hidden="true" />

        <div className={styles.heroInner}>
          <div className={styles.heroGrid}>

            {/* Left — copy */}
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle}>
                {t('landing.hero.titleBefore')}{' '}
                <span className={styles.heroAccent}>{t('landing.hero.titleAccent')}</span>
                <br />{t('landing.hero.titleAfter')}
              </h1>
              <p className={styles.heroSubtitle}>{t('landing.hero.subtitle')}</p>

              {/* Social proof row */}
              <div className={styles.socialProof}>
                <div className={styles.socialLive}>
                  <span className={styles.socialLiveDot} />
                  <span>{t('landing.hero.social.live')}</span>
                </div>
                <div className={styles.socialDivider} />
                <div className={styles.socialRating}>
                  <Star size={13} className={styles.starIcon} />
                  <span>4.9</span>
                </div>
                <div className={styles.socialDivider} />
              </div>

              <div className={styles.heroCTAs}>
                <Link className={styles.ctaPrimary} href={routes.LOGIN}>
                  {t('landing.hero.cta.startLearning')}
                  <span className={styles.ctaArrow} aria-hidden="true">→</span>
                </Link>
                <Link className={styles.ctaSecondary} href={routes.LOGIN}>
                  {t('landing.hero.cta.becomeTutor')}
                </Link>
              </div>
            </div>

            {/* Right — tutor search card + floaters */}
            <div className={styles.heroVisualArea}>

              {/* Floating confirmation — top left */}
              <div className={styles.floatConfirm}>
                <CheckCircle size={14} className={styles.floatConfirmIcon} />
                <span>{t('landing.hero.social.confirmed')}</span>
              </div>

              {/* Main tutor card */}
              <div className={styles.tutorCard}>
                <div className={styles.tutorCardHead}>
                  <span className={styles.tutorCardSubject}>{t('landing.hero.card.subject')}</span>
                  <span className={styles.tutorCardAvail}>{t('landing.hero.card.available')}</span>
                </div>
                {MOCK_TUTORS.map((tutor) => (
                  <div key={tutor.name} className={styles.tutorRow}>
                    <div className={styles.tutorAvatar} style={{ background: tutor.color }}>
                      {tutor.initials}
                    </div>
                    <div className={styles.tutorInfo}>
                      <div className={styles.tutorName}>{tutor.name}</div>
                      <div className={styles.tutorMeta}>{tutor.meta}</div>
                      <div className={styles.tutorRatingRow}>
                        <Star size={10} className={styles.tutorStar} />
                        <span className={styles.tutorRatingNum}>{tutor.rating}</span>
                        <span className={styles.tutorReviews}>({tutor.reviews})</span>
                      </div>
                    </div>
                    <div className={styles.tutorRight}>
                      <div className={styles.tutorTime}>{tutor.time}</div>
                      <button className={styles.tutorBookBtn}>{t('landing.hero.card.book')}</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Floating sessions count — bottom right */}
              <div className={styles.heroFloatBadge}>
                <Users size={14} />
                <span>{t('landing.hero.social.sessions')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.heroWave} aria-hidden="true">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,30 C240,80 480,0 720,40 C960,80 1200,8 1440,45 L1440,80 L0,80 Z" fill="#f9f7f4"/>
          </svg>
        </div>
      </section>


      {/* wave: stats (#f9f7f4) → toggle (#fff) */}
      <div className={styles.waveDown} aria-hidden="true">
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,0 C360,60 1080,0 1440,40 L1440,60 L0,60 Z" fill="#fff"/>
        </svg>
      </div>

      {/* ─── STUDENT / TUTOR TOGGLE ─────────────── */}
      <section className={styles.toggleSection} style={accentVars}>
        <div className={styles.toggleWrap}>
          <div className={styles.toggleBar} data-reveal>
            <button
              className={`${styles.toggleBtn} ${isStudent ? styles.toggleBtnStudentActive : ''}`}
              onClick={() => setView('student')}
            >
              {t('landing.toggle.studentTab')}
            </button>
            <button
              className={`${styles.toggleBtn} ${!isStudent ? styles.toggleBtnTutorActive : ''}`}
              onClick={() => setView('tutor')}
            >
              {t('landing.toggle.tutorTab')}
            </button>
          </div>

          <div key={view} className={styles.toggleContent}>
              <div className={styles.toggleTextSide}>
                <span className={styles.toggleLabel}>
                  {isStudent ? t('landing.forStudents.label') : t('landing.forTutors.label')}
                </span>
                <h2 className={styles.toggleHeading}>
                  {isStudent ? t('landing.forStudents.title') : t('landing.forTutors.title')}
                </h2>
                <p className={styles.toggleSubtitle}>
                  {isStudent ? t('landing.forStudents.subtitle') : t('landing.forTutors.subtitle')}
                </p>
                <ul className={styles.benefitsList}>
                  {VIEW_BENEFITS.map((k) => (
                    <li key={`${view}-${k}`} className={styles.benefit}>
                      <span className={styles.benefitCheck} aria-hidden="true" />
                      <span>{t(`landing.${isStudent ? 'forStudents' : 'forTutors'}.${k}`)}</span>
                    </li>
                  ))}
                </ul>
                <Link className={styles.toggleCTA} href={isStudent ? routes.LOGIN : routes.REGISTER}>
                  {isStudent ? t('landing.forStudents.cta') : t('landing.forTutors.cta')} →
                </Link>
              </div>

              <div className={styles.toggleVisual}>
                <div className={styles.toggleCard}>
                  {isStudent ? (
                    <TrendingUp size={36} className={styles.toggleCardIcon} />
                  ) : (
                    <Award size={36} className={styles.toggleCardIcon} />
                  )}
                  <p className={styles.toggleCardText}>
                    {isStudent ? t('landing.toggle.student.card') : t('landing.toggle.tutor.card')}
                  </p>
                  <span className={styles.toggleCardCta}>
                    {isStudent ? t('landing.forStudents.cta') : t('landing.forTutors.cta')} →
                  </span>
                </div>
              </div>
          </div>
        </div>
      </section>

      {/* wave: toggle (#fff) → how-it-works (#f9f7f4) */}
      <div className={styles.waveDownWarm} aria-hidden="true">
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,40 C480,0 960,60 1440,20 L1440,60 L0,60 Z" fill="#f9f7f4"/>
        </svg>
      </div>

      {/* ─── HOW IT WORKS ───────────────────────── */}
      <section className={styles.howItWorks}>
        <div className={styles.sectionWrap}>
          <span className={styles.sectionLabel} data-reveal>{t('landing.howItWorks.label')}</span>
          <h2 className={styles.sectionHeading} data-reveal style={{ transitionDelay: '0.1s' }}>
            {t('landing.howItWorks.title')}
          </h2>
        </div>

        <div className={styles.stepsTrack}>
          {STEPS.map(({ num, Icon, titleKey, descKey, delay }, idx) => (
            <div
              key={num}
              className={`${styles.stepRow} ${idx % 2 === 1 ? styles.stepRowReverse : ''}`}
              data-reveal
              style={{ transitionDelay: delay }}
            >
              <div className={styles.stepNumBg}>{num}</div>
              <div className={styles.stepBody}>
                <div className={styles.stepIconBox}>
                  <Icon className={styles.stepIconSvg} />
                </div>
                <h3 className={styles.stepTitle}>{t(titleKey)}</h3>
                <p className={styles.stepDesc}>{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* wave: how-it-works (#f9f7f4) → subjects (#fff) */}
      <div className={styles.waveDownWhite} aria-hidden="true">
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,20 C360,60 1080,0 1440,50 L1440,60 L0,60 Z" fill="#fff"/>
        </svg>
      </div>

      {/* ─── SUBJECTS ───────────────────────────── */}
      <section className={styles.subjectsSection}>
        <div className={styles.sectionWrap}>
          <span className={styles.sectionLabel} data-reveal>{t('landing.subjects.label')}</span>
          <h2 className={styles.sectionHeading} data-reveal style={{ transitionDelay: '0.1s' }}>
            {t('landing.subjects.title')}
          </h2>
          <p className={styles.sectionSub} data-reveal style={{ transitionDelay: '0.2s' }}>
            {t('landing.subjects.subtitle')}
          </p>
          <div className={styles.subjectsGrid} data-reveal style={{ transitionDelay: '0.3s' }}>
            {SUBJECTS.map((subj) => (
              <span key={subj} className={styles.subjectPill}>{subj}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────── */}
      <section className={styles.finalCtaSection}>
        <div className={styles.finalCtaBlob} aria-hidden="true" />
        <div className={styles.finalCtaInner} data-reveal>
          <h2 className={styles.finalCtaTitle}>{t('landing.finalCta.title')}</h2>
          <p className={styles.finalCtaSub}>{t('landing.finalCta.subtitle')}</p>
          <div className={styles.finalCtaBtns}>
            <Link className={styles.finalBtnPrimary} href={routes.LOGIN}>
              {t('landing.finalCta.primaryCta')}
            </Link>
            <Link className={styles.finalBtnSecondary} href={routes.LOGIN}>
              {t('landing.finalCta.secondaryCta')}
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerContent}>
            <div className={styles.footerBrand}>
              <Image src={Logo} alt="Calico" className={styles.footerLogo} width={120} height={40} />
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
                  <Link href={routes.PRIVACY_POLICY} className={styles.footerLink}>
                    {t('landing.footer.links.privacyPolicy')}
                  </Link>
                </li>
                <li>
                  <Link href={routes.LOGIN} className={styles.footerLink}>
                    {t('landing.footer.links.findTutors')}
                  </Link>
                </li>
                <li>
                  <Link href={routes.REGISTER} className={styles.footerLink}>
                    {t('landing.footer.links.register')}
                  </Link>
                </li>
              </ul>
            </div>
            <div className={styles.footerGetStarted}>
              <h4 className={styles.footerLinksTitle}>{t('landing.footer.getStarted.title')}</h4>
              <ul className={styles.footerLinksList}>
                <li>
                  <Link href={routes.REGISTER} className={`${styles.footerLink} ${styles.footerLinkHighlight}`}>
                    {t('landing.footer.getStarted.register')}
                  </Link>
                </li>
                <li>
                  <Link href={routes.LOGIN} className={styles.footerLink}>
                    {t('landing.footer.getStarted.findTutors')}
                  </Link>
                </li>
                <li>
                  <Link href={routes.REGISTER} className={styles.footerLink}>
                    {t('landing.footer.getStarted.becomeTutor')}
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
    </div>
  );
}
