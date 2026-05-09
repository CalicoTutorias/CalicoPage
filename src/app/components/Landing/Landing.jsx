"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import {
  Award,
  Star,
  Users,
  TrendingUp,
  CheckCircle,
  UserSearch,
  CreditCard,
  ClipboardList,
  CalendarSync,
  CircleDollarSign,
} from "lucide-react";
import Logo from "../../../../public/CalicoLogo.png";
import routes from "../../../routes";
import styles from "./Landing.module.css";
import YarnPathOverlay from "./YarnPathOverlay";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import LocaleSwitcher from "../LocaleSwitcher";

const MOCK_TUTORS = [
  { initials: 'MR', color: '#fdb61e', name: 'María Rodríguez', meta: 'Ing. Sistemas · Sem 6', rating: '4.9', reviews: 32, time: 'Hoy · 4:00 PM' },
  { initials: 'JP', color: '#3b82f6', name: 'Juan Paredes', meta: 'Matemáticas · Sem 8', rating: '4.8', reviews: 18, time: 'Hoy · 6:30 PM' },
];

const STUDENT_STEPS = [
  { num: '01', Icon: UserSearch, titleKey: 'landing.howItWorks.step1.title', descKey: 'landing.howItWorks.step1.description', delay: '0s' },
  { num: '02', Icon: CreditCard, titleKey: 'landing.howItWorks.step2.title', descKey: 'landing.howItWorks.step2.description', delay: '0.08s' },
  { num: '03', Icon: Star, titleKey: 'landing.howItWorks.step3.title', descKey: 'landing.howItWorks.step3.description', delay: '0.16s' },
];

const TUTOR_STEPS = [
  { num: '01', Icon: ClipboardList, titleKey: 'landing.howItWorks.tutorStep1.title', descKey: 'landing.howItWorks.tutorStep1.description', delay: '0s' },
  { num: '02', Icon: CalendarSync, titleKey: 'landing.howItWorks.tutorStep2.title', descKey: 'landing.howItWorks.tutorStep2.description', delay: '0.08s' },
  { num: '03', Icon: CircleDollarSign, titleKey: 'landing.howItWorks.tutorStep3.title', descKey: 'landing.howItWorks.tutorStep3.description', delay: '0.16s' },
];

const VIEW_BENEFITS = ['benefit1', 'benefit2', 'benefit3', 'benefit4'];

export default function Landing() {
  // Start as false so server and client agree on the initial render (no hydration mismatch).
  // The useEffect below updates this on the client after hydration.
  const [hasToken, setHasToken] = useState(false);

  const [scrolled, setScrolled] = useState(false);
  const [view, setView] = useState('student');
  const [subjectCategories, setSubjectCategories] = useState([]);
  // Re-scan reveal targets when categories arrive — they mount post-fetch and
  // would otherwise stay hidden behind the global `[data-reveal]` opacity.
  const rootRef = useScrollReveal([subjectCategories]);
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const showLoggedIn = !loading && user?.isLoggedIn;

  // Read localStorage only on the client, after hydration.
  useEffect(() => {
    setHasToken(!!localStorage.getItem('calico_auth_token'));
  }, []);

  // Fetch subjects/courses from the DB and group by department for the
  // "Cobertura" section. Public endpoint — no auth needed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/courses');
        if (!res.ok) return;
        const json = await res.json();
        const courses = Array.isArray(json?.courses) ? json.courses : [];
        const OTHER = 'Otras materias';
        const groups = new Map();
        for (const c of courses) {
          if (!c?.name) continue;
          const deptName = c?.department?.name || OTHER;
          if (!groups.has(deptName)) groups.set(deptName, []);
          groups.get(deptName).push(c.name);
        }
        // Sort tags within each group; sort categories alphabetically but push
        // "Otras materias" to the end so departments lead.
        const categories = Array.from(groups.entries())
          .map(([title, tags]) => ({ title, tags: tags.slice().sort((a, b) => a.localeCompare(b, 'es')) }))
          .sort((a, b) => {
            if (a.title === OTHER) return 1;
            if (b.title === OTHER) return -1;
            return a.title.localeCompare(b.title, 'es');
          });
        if (!cancelled) setSubjectCategories(categories);
      } catch (err) {
        console.error('[Landing] Failed to load subjects:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // router is intentionally excluded from deps: useRouter() is stable and
  // including it caused the effect to re-run only on scroll-triggered re-renders.
  useEffect(() => {
    if (!loading && user.isLoggedIn) {
      router.replace(routes.HOME);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user.isLoggedIn]);

  useEffect(() => {
    const handleScroll = () => {
      const now = window.scrollY > 10;
      if (now !== scrolled) setScrolled(now);
    };
    document.addEventListener("scroll", handleScroll, { passive: true });
    return () => document.removeEventListener("scroll", handleScroll);
  }, [scrolled]);

  // While a token exists and auth is still resolving (or already confirmed),
  // render nothing — the redirect effect will fire as soon as loading settles.
  // This prevents painting the landing page before the redirect happens.
  if (hasToken && (loading || user.isLoggedIn)) return null;

  const isStudent = view === 'student';
  const accentVars = isStudent
    ? { '--accent': '#fdb61e', '--accent-dark': '#e8840a', '--accent-light': 'rgba(253,182,30,0.1)', '--accent-border': 'rgba(253,182,30,0.3)', '--accent-text': '#7a4a00' }
    : { '--accent': '#3b82f6', '--accent-dark': '#2563eb', '--accent-light': 'rgba(59,130,246,0.1)', '--accent-border': 'rgba(59,130,246,0.3)', '--accent-text': '#fff' };

  return (
    <div ref={rootRef} className={styles.landingRoot}>
      <YarnPathOverlay isStudent={isStudent} />

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
            <div className={styles.headerLocaleWrap}>
              <LocaleSwitcher />
            </div>
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
      <section id="hero-section" className={styles.hero}>
        <div className={styles.blobOrange} aria-hidden="true" />
        <div className={styles.blobBlue} aria-hidden="true" />

        <div className={styles.heroInner}>
          <div className={styles.heroGrid}>

            {/* Left — copy */}
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle}>
                {t('landing.hero.titleBefore')}{' '}
                <span className={styles.heroAccent}>{t('landing.hero.titleAccent')}</span>
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
                  <Star className={styles.starIcon} aria-hidden />
                  <span>4.9</span>
                </div>
                <div className={styles.socialDivider} />
              </div>

              <div className={styles.heroCTAs}>
                <Link className={styles.ctaPrimary} href={routes.REGISTER}>
                  {t('landing.hero.cta.startLearning')}
                  <span className={styles.ctaArrow} aria-hidden="true">→</span>
                </Link>
                <Link className={styles.ctaSecondary} href={routes.REGISTER}>
                  {t('landing.hero.cta.becomeTutor')}
                </Link>
              </div>
            </div>

            {/* Right — tutor search card + floaters */}
            <div className={styles.heroVisualArea}>

              {/* Floating confirmation — top left */}
              <div className={styles.floatConfirm}>
                <CheckCircle className={styles.floatConfirmIcon} aria-hidden />
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
                        <Star className={styles.tutorStar} aria-hidden />
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
                <Users className={styles.heroFloatBadgeIcon} aria-hidden />
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


      {/* ─── STUDENT / TUTOR TOGGLE ─────────────── */}
      <section id="student-section" className={styles.toggleSection} style={accentVars}>
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
                <Link className={styles.toggleCTA} href={routes.REGISTER}>
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

      {/* ─── HOW IT WORKS (students + tutors) ───── */}
      <section className={styles.howItWorks}>
        <div className={styles.sectionWrap}>
          <span className={styles.sectionLabel} data-reveal>{t('landing.howItWorks.label')}</span>
          <h2 className={styles.sectionHeading} data-reveal style={{ transitionDelay: '0.1s' }}>
            {t('landing.howItWorks.title')}
          </h2>
          <p className={styles.sectionSub} data-reveal style={{ transitionDelay: '0.15s' }}>
            {t('landing.howItWorks.subtitle')}
          </p>
        </div>

        <div className={styles.howItWorksGrid}>
          <div className={styles.howItWorksColumn}>
            <h3 className={styles.howItWorksBlockTitle}>{t('landing.howItWorks.studentBlock')}</h3>
            <div className={styles.stepsTrack}>
              {STUDENT_STEPS.map(({ num, Icon, titleKey, descKey, delay }) => (
                <div
                  key={num}
                  className={styles.stepRow}
                  data-reveal
                  style={{ transitionDelay: delay }}
                >
                  <div className={styles.stepNumBg}>{num}</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepIconBox}>
                      <Icon className={styles.stepIconSvg} strokeWidth={2} />
                    </div>
                    <h3 className={styles.stepTitle}>{t(titleKey)}</h3>
                    <p className={styles.stepDesc}>{t(descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.howItWorksColumn} ${styles.howItWorksColumnTutor}`}>
            <h3 className={styles.howItWorksBlockTitle}>{t('landing.howItWorks.tutorBlock')}</h3>
            <div className={styles.stepsTrack}>
              {TUTOR_STEPS.map(({ num, Icon, titleKey, descKey, delay }) => (
                <div
                  key={num}
                  className={`${styles.stepRow} ${styles.stepRowTutor}`}
                  data-reveal
                  style={{ transitionDelay: delay }}
                >
                  <div className={styles.stepNumBg}>{num}</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepIconBox}>
                      <Icon className={styles.stepIconSvg} strokeWidth={2} />
                    </div>
                    <h3 className={styles.stepTitle}>{t(titleKey)}</h3>
                    <p className={styles.stepDesc}>{t(descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* wave: how-it-works (#f9f7f4) → subjects (#fff) */}
      <div className={styles.waveDownWhite} aria-hidden="true">
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,20 C360,60 1080,0 1440,50 L1440,60 L0,60 Z" fill="#fff"/>
        </svg>
      </div>

      {/* ─── SUBJECTS / COVERAGE ───────────────── */}
      <section className={styles.subjectsSection}>
        <div className={`${styles.sectionWrap} ${styles.subjectsSectionInner}`}>
          <span className={styles.sectionLabel} data-reveal>{t('landing.subjects.label')}</span>
          <h2 className={styles.sectionHeading} data-reveal style={{ transitionDelay: '0.1s' }}>
            {t('landing.subjects.title')}
          </h2>
          <p className={styles.sectionSub} data-reveal style={{ transitionDelay: '0.2s' }}>
            {t('landing.subjects.subtitle')}
          </p>

          <div className={styles.subjectCategories}>
            {subjectCategories.map(({ title, tags }, idx) => (
              <div
                key={title}
                className={styles.subjectCategory}
                data-reveal
                style={{ transitionDelay: `${0.1 + idx * 0.08}s` }}
              >
                <h3 className={styles.subjectCategoryTitle}>{title}</h3>
                <div className={styles.subjectTiles}>
                  {tags.map((tag) => (
                    <span key={`${title}-${tag}`} className={styles.subjectTile}>{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className={styles.subjectBreadthNote} data-reveal style={{ transitionDelay: '0.35s' }}>
            {t('landing.subjects.breadthNote')}
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerContent}>
            <div className={styles.footerBrand} data-reveal>
              <Image src={Logo} alt="Calico" className={styles.footerLogo} width={120} height={40} />
              <p className={styles.footerTagline}>{t('landing.footer.tagline')}</p>
            </div>
            <div className={styles.footerLinks} data-reveal style={{ transitionDelay: '0.08s' }}>
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
                  <Link href={routes.REGISTER} className={styles.footerLink}>
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
            <div className={styles.footerGetStarted} data-reveal style={{ transitionDelay: '0.16s' }}>
              <h4 className={styles.footerLinksTitle}>{t('landing.footer.getStarted.title')}</h4>
              <ul className={styles.footerLinksList}>
                <li>
                  <Link href={routes.REGISTER} className={`${styles.footerLink} ${styles.footerLinkHighlight}`}>
                    {t('landing.footer.getStarted.register')}
                  </Link>
                </li>
                <li>
                  <Link href={routes.REGISTER} className={styles.footerLink}>
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
          <div className={styles.footerBottom} data-reveal style={{ transitionDelay: '0.2s' }}>
            <p className={styles.footerCopyright}>
              © 2026 Calico Tutorías. {t('landing.footer.rights')}
            </p>
            <div className={styles.footerLocale}>
              <LocaleSwitcher variant="onDark" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
