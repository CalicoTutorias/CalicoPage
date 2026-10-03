"use client";

/**
 * Public event page (client side of /eventos/[slug]).
 *
 * Loads the event (plus the viewer's registration) on mount and after every
 * action. The CTA area is driven by the pure `ctaState`. Query params:
 *  - ?inscribir=1 — back from login: open the confirmation step once;
 *  - ?encuesta=1  — from the survey email: open the survey (or log in first);
 *  - ?ref=<src>   — acquisition source, kept only if it matches SOURCE_RE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle, Ban, BookOpen, CalendarCheck, CalendarDays, CalendarX2, CheckCircle2,
  ChevronRight, Lock, MapPin, MessageSquareHeart, Video, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventService } from '../../services/core/EventService';
import { clearPendingBooking, savePendingBooking } from '../../services/utils/pendingBooking';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import { formatEventDate, formatEventTimeRange, joinNames } from '../../../lib/utils/event-format';
import { withReturnTo } from '../../../lib/utils/returnTo';
import routes from '../../../routes';
import EventPriceTag from '../../components/Events/EventPriceTag';
import RegisterConfirmModal from '../../components/Events/RegisterConfirmModal';
import CancelRegistrationModal from '../../components/Events/CancelRegistrationModal';
import EventSurveyModal from '../../components/Events/EventSurveyModal';
import TutorAvatar from '../../components/Events/TutorAvatar';
import EventsHeader from '../EventsHeader';
import styles from '../eventos.module.css';

const SOURCE_RE = /^[a-z0-9_-]{1,40}$/;

/**
 * Which CTA the event page shows, in priority order:
 * canceled → surveyPending → ended → registered → closed → register.
 */
export function ctaState(event, myRegistration, isLoggedIn) {
  const registration = isLoggedIn ? myRegistration : null;
  if (event.status === 'Canceled') return 'canceled';
  if (registration?.surveyStatus === 'pending') return 'surveyPending';
  if (event.hasEnded) return 'ended';
  if (registration?.status === 'Confirmed') return 'registered';
  if (!event.registrationOpen) return 'closed';
  return 'register';
}

function Callout({ icon: Icon, title, text, tone }) {
  const toneClass = tone === 'danger' ? styles.calloutDanger : tone === 'accent' ? styles.calloutAccent : '';
  return (
    <div className={`${styles.callout} ${toneClass}`.trim()} role="status">
      <Icon aria-hidden="true" />
      <div>
        <p className={styles.calloutTitle}>{title}</p>
        {text && <p className={styles.calloutText}>{text}</p>}
      </div>
    </div>
  );
}

export default function EventDetailView({ slug }) {
  const { t, locale, formatCurrency } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const isLoggedIn = !!user?.isLoggedIn;
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsRegister = searchParams?.get('inscribir') === '1';
  const wantsSurvey = searchParams?.get('encuesta') === '1';
  const rawRef = (searchParams?.get('ref') || '').toLowerCase();
  const source = SOURCE_RE.test(rawRef) ? rawRef : undefined;

  // status: 'loading' | 'ready' | 'notFound' | 'error'
  const [data, setData] = useState({ status: 'loading', event: null, myRegistration: null });
  const [modal, setModal] = useState(null); // 'register' | 'cancel' | 'survey' | null
  const [notice, setNotice] = useState(null); // events.detail.<key>
  // null until decided, then 'register' | 'survey' | 'login' | 'none'.
  const [arrival, setArrival] = useState(null);
  const latestRequest = useRef(0);
  const arrivalHandled = useRef(false);

  // State is only touched in the response callback, never synchronously in
  // the effect body (react-hooks/set-state-in-effect). Out-of-order responses
  // are dropped.
  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    return EventService.getBySlug(slug).then((res) => {
      if (requestId !== latestRequest.current) return;
      if (res.success && res.event) {
        setData({ status: 'ready', event: res.event, myRegistration: res.myRegistration ?? null });
      } else if ((res.code || res.error) === 'EVENT_NOT_FOUND' || res.status === 404) {
        setData({ status: 'notFound', event: null, myRegistration: null });
      } else {
        // A failed background refresh keeps what is already on screen.
        setData((prev) => (prev.event ? prev : { status: 'error', event: null, myRegistration: null }));
      }
    });
  }, [slug]);

  // Re-fetch when the session resolves: myRegistration depends on the viewer.
  useEffect(() => {
    load();
  }, [load, isLoggedIn]);

  const { event, myRegistration } = data;
  const state = event ? ctaState(event, myRegistration, isLoggedIn) : null;

  // Arrival intents (?inscribir=1 / ?encuesta=1) are decided once, as soon as
  // both the event and the session are known — while rendering, so no effect
  // has to set state.
  if (arrival === null && data.status === 'ready' && !authLoading) {
    let next = 'none';
    if (wantsRegister && isLoggedIn && state === 'register') next = 'register';
    else if (wantsSurvey && !isLoggedIn) next = 'login';
    else if (wantsSurvey && state === 'surveyPending') next = 'survey';
    setArrival(next);
    if (next === 'register' || next === 'survey') setModal(next);
  }

  // Side effects of that decision, once (ref guard).
  useEffect(() => {
    if (!arrival || arrival === 'none' || arrivalHandled.current) return;
    arrivalHandled.current = true;
    if (arrival === 'register') clearPendingBooking();
    if (arrival === 'login') {
      router.push(withReturnTo(routes.LOGIN, routes.EVENT_DETAIL(slug, { encuesta: 1 })));
    }
  }, [arrival, router, slug]);

  const startRegister = () => {
    if (!isLoggedIn) {
      const target = routes.EVENT_DETAIL(slug, { inscribir: 1, ref: source });
      savePendingBooking(target);
      router.push(withReturnTo(routes.LOGIN, target));
      return;
    }
    setNotice(null);
    setModal('register');
  };

  const closeModal = useCallback(() => setModal(null), []);
  const closeAndRefresh = useCallback(() => {
    setModal(null);
    load();
  }, [load]);
  const handleCanceled = useCallback(({ refundable }) => {
    setModal(null);
    setNotice(refundable ? 'canceledRefundNotice' : 'canceledNotice');
    load();
  }, [load]);
  const handleSurveySubmitted = useCallback(() => {
    setModal(null);
    setNotice('surveyThanksNotice');
    load();
  }, [load]);

  const formatRating = (rating) =>
    Number(rating).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

  const renderCta = () => {
    if (authLoading) return <div className={`${styles.skeleton} ${styles.ctaSkeleton}`} aria-hidden="true" />;
    const isVirtual = event.modality === 'Virtual';

    switch (state) {
      case 'canceled':
        return (
          <Callout
            icon={AlertTriangle}
            tone="danger"
            title={t('events.detail.canceledTitle')}
            text={t('events.detail.canceledText')}
          />
        );
      case 'surveyPending':
        return (
          <>
            <Callout
              icon={MessageSquareHeart}
              tone="accent"
              title={t('events.detail.endedTitle')}
              text={t('events.detail.surveyPendingText')}
            />
            <Button type="button" variant="cta" size="xl" className={styles.ctaButton} onClick={() => setModal('survey')}>
              {t('events.detail.answerSurvey')}
            </Button>
          </>
        );
      case 'ended':
        return (
          <Callout icon={CalendarCheck} title={t('events.detail.endedTitle')} text={t('events.detail.endedText')} />
        );
      case 'registered':
        return (
          <>
            <span className={styles.registeredBadge}>
              <CheckCircle2 aria-hidden="true" />
              {t('events.detail.registeredBadge')}
            </span>
            {isVirtual && myRegistration.meetingUrl && (
              <Button asChild variant="cta" size="xl" className={styles.ctaButton}>
                <a href={myRegistration.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Video aria-hidden="true" />
                  {t('events.detail.joinSession')}
                </a>
              </Button>
            )}
            {isVirtual && !myRegistration.meetingUrl && (
              <p className={styles.hint}>{t('events.detail.linkSoon')}</p>
            )}
            {!isVirtual && event.location && (
              <p className={styles.locationBox}>
                <MapPin aria-hidden="true" />
                <span>{event.location}</span>
              </p>
            )}
            {myRegistration.canCancel && (
              <Button
                type="button"
                variant="ghost"
                className={styles.ctaButton}
                onClick={() => {
                  setNotice(null);
                  setModal('cancel');
                }}
              >
                {t('events.detail.cancelRegistration')}
              </Button>
            )}
          </>
        );
      case 'closed':
        return <Callout icon={Lock} title={t('events.detail.closedTitle')} text={t('events.detail.closedText')} />;
      default: {
        const isPaid = Number(event.price) > 0;
        const price = isPaid && event.earlyBird?.remaining > 0 ? event.earlyBird.discountedPrice : event.price;
        return (
          <>
            <Button type="button" variant="cta" size="xl" className={styles.ctaButton} onClick={startRegister}>
              {isPaid
                ? t('events.detail.registerPaid', { price: formatCurrency(price) })
                : t('events.detail.registerFree')}
            </Button>
            {!isLoggedIn && <p className={styles.hint}>{t('events.detail.loginHint')}</p>}
          </>
        );
      }
    }
  };

  const renderEvent = () => {
    const isVirtual = event.modality === 'Virtual';
    const ModalityIcon = isVirtual ? Video : MapPin;
    const modalityLabel = t(isVirtual ? 'events.common.virtual' : 'events.common.inPerson');
    const tutors = event.tutors ?? [];

    return (
      <article className={styles.detail}>
        <div className={`${styles.cover} ${event.coverImageUrl ? '' : styles.coverEmpty}`.trim()}>
          {event.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote S3 cover; no next/image remotePatterns configured
            <img src={event.coverImageUrl} alt="" />
          ) : (
            <div className={styles.coverPlaceholder} aria-hidden="true">
              <CalendarDays />
            </div>
          )}
        </div>

        <div className={styles.head}>
          <div className={styles.chips}>
            {event.status === 'Canceled' && (
              <span className={`${styles.chip} ${styles.chipDanger}`}>
                <Ban aria-hidden="true" />
                {t('events.common.canceled')}
              </span>
            )}
            {event.course && (
              <span className={styles.chip}>
                <BookOpen aria-hidden="true" />
                {event.course.name}
                {event.course.code && <span className={styles.chipCode}>{event.course.code}</span>}
              </span>
            )}
            <span className={styles.chip}>
              <ModalityIcon aria-hidden="true" />
              {modalityLabel}
            </span>
          </div>
          <h1 className={styles.detailTitle}>{event.title}</h1>
          {tutors.length > 0 && (
            <p className={styles.byline}>
              {t('events.common.with')} {joinNames(tutors.map((tutor) => tutor.name), locale)}
            </p>
          )}
        </div>

        <aside className={styles.panel}>
          <ul className={styles.facts}>
            <li className={styles.fact}>
              <span className={styles.factIcon} aria-hidden="true"><CalendarDays /></span>
              <span className={styles.factText}>
                <span className={styles.factPrimary}>{formatEventDate(event.startsAt, locale)}</span>
                <span className={styles.factSecondary}>
                  {formatEventTimeRange(event.startsAt, event.endsAt, locale)} ({t('events.common.bogotaTime')})
                </span>
              </span>
            </li>
            <li className={styles.fact}>
              <span className={styles.factIcon} aria-hidden="true"><ModalityIcon /></span>
              <span className={styles.factText}>
                <span className={styles.factPrimary}>{modalityLabel}</span>
                {!isVirtual && event.location && (
                  <span className={styles.factSecondary}>{event.location}</span>
                )}
              </span>
            </li>
          </ul>
          <hr className={styles.divider} />
          {/* "N discounted spots left" only means something while registration is open. */}
          <EventPriceTag
            price={event.price}
            earlyBird={event.registrationOpen ? event.earlyBird : null}
            size="lg"
          />
          <div className={styles.cta}>{renderCta()}</div>
        </aside>

        <div className={styles.content}>
          {event.description && (
            <section>
              <h2 className={styles.sectionTitle}>{t('events.detail.about')}</h2>
              <p className={styles.description}>{event.description}</p>
            </section>
          )}

          {tutors.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>{t('events.detail.tutors')}</h2>
              <ul className={styles.tutorList}>
                {tutors.map((tutor) => (
                  <li key={tutor.id}>
                    <Link href={routes.TUTOR_DETAIL(tutor.id)} className={styles.tutorLink}>
                      <TutorAvatar tutor={tutor} size="lg" />
                      <span className={styles.tutorInfo}>
                        <span className={styles.tutorName}>{tutor.name}</span>
                        <span className={styles.tutorRating}>
                          {tutor.numReview > 0 && tutor.rating != null
                            ? t('events.detail.tutorRating', {
                              rating: formatRating(tutor.rating),
                              count: tutor.numReview,
                            })
                            : t('events.detail.noReviews')}
                        </span>
                      </span>
                      <ChevronRight className={styles.tutorChevron} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className={styles.container}>
      <EventsHeader backHref={routes.EVENTS} backLabel={t('events.detail.backToEvents')} />

      <main className={styles.detailMain} aria-busy={data.status === 'loading'}>
        {notice && (
          <div className={styles.notice} role="status">
            <CheckCircle2 aria-hidden="true" />
            <span className={styles.noticeText}>{t(`events.detail.${notice}`)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('events.detail.dismissNotice')}
              onClick={() => setNotice(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}

        {data.status === 'loading' && (
          <div className={styles.detail} aria-hidden="true">
            <div className={`${styles.cover} ${styles.skeleton}`} />
            <div className={styles.head}>
              <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
              <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
          </div>
        )}

        {data.status === 'notFound' && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><CalendarX2 /></span>
            <h1 className={styles.emptyTitle}>{t('events.detail.notFound')}</h1>
            <p className={styles.emptyText}>{t('events.detail.notFoundText')}</p>
            <Button asChild variant="cta">
              <Link href={routes.EVENTS}>{t('events.detail.seeAllEvents')}</Link>
            </Button>
          </div>
        )}

        {data.status === 'error' && (
          <div className={styles.empty} role="alert">
            <span className={styles.emptyIcon} aria-hidden="true"><CalendarX2 /></span>
            <p className={styles.emptyTitle}>{t('events.detail.loadError')}</p>
            <Button type="button" variant="outline" onClick={load}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {data.status === 'ready' && renderEvent()}
      </main>

      {event && modal === 'register' && (
        <RegisterConfirmModal event={event} source={source} onClose={closeAndRefresh} onRegistered={load} />
      )}
      {event && modal === 'cancel' && myRegistration && (
        <CancelRegistrationModal
          event={event}
          myRegistration={myRegistration}
          onClose={closeModal}
          onCanceled={handleCanceled}
        />
      )}
      {event && modal === 'survey' && (
        <EventSurveyModal event={event} onClose={closeModal} onSubmitted={handleSurveySubmitted} />
      )}
    </div>
  );
}
