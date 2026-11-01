'use client';

import { useEffect, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { countKey } from '@/lib/utils/event-format';
import ConfirmDialog from './ConfirmDialog';
import { CARD, ERROR_BOX, INK, MUTED, TABLE_WRAP, TD, TH, TR, errorKey, percent } from './ui';

/** Counts of one closed question, every option in its fixed order, with its share of the answers. */
function AnswerTable({ rows, labelFor, t }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (total === 0) return <p className={`text-sm ${MUTED}`}>{t('admin.events.survey.noAnswers')}</p>;
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>{t('admin.events.survey.columns.answer')}</th>
            <th className={`${TH} text-right`}>{t('admin.events.survey.columns.people')}</th>
            <th className={`${TH} text-right`}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value} className={TR}>
              <td className={`${TD} ${INK}`}>{labelFor(r.value)}</td>
              <td className={`${TD} text-right ${INK}`}>{r.count}</td>
              <td className={`${TD} text-right ${MUTED}`}>{percent(r.count, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Survey results of one event: response and attendance rates, averages,
 * how people heard about it (+ the "other" answers), whether they would
 * recommend it, and the tutor reviews, each of which can be removed from the
 * tutor's public profile.
 */
export default function SurveyTab({ eventId }) {
  const { t, locale } = useI18n();
  const [results, setResults] = useState(null);
  const [loadError, setLoadError] = useState(null); // i18n key
  const [reviewToDelete, setReviewToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null); // i18n key

  useEffect(() => {
    let active = true;
    AdminEventService.survey(eventId).then((res) => {
      if (!active) return;
      if (res.success) setResults(res.results);
      else setLoadError(errorKey(res, 'admin.events.survey.load'));
    });
    return () => { active = false; };
  }, [eventId]);

  if (loadError) return <p className={ERROR_BOX}>{t(loadError)}</p>;
  if (!results) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  const average = (v) => (v == null
    ? '—'
    : `★ ${Number(v).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 })}`);
  const tutors = results.tutors || [];
  const reviews = results.reviews || [];
  const responseCount = results.responseCount ?? 0;
  const confirmedCount = results.confirmedCount ?? 0;
  const attendedCount = results.attendedCount ?? 0;

  const closeDeleteDialog = () => {
    setReviewToDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const res = await AdminEventService.deleteReview(eventId, reviewToDelete.id);
    if (!res.success) {
      setDeleting(false);
      setDeleteError(errorKey(res, 'admin.events.survey.deleteReviewError'));
      return;
    }
    // The averages change too, so reload the results instead of patching the list.
    const fresh = await AdminEventService.survey(eventId);
    setDeleting(false);
    if (fresh.success) setResults(fresh.results);
    closeDeleteDialog();
  };

  const cards = [
    {
      key: 'responses',
      value: percent(results.responseRate),
      // The noun agrees with the total (es: "1 de 1 confirmado"), not with the responses.
      detail: t(countKey('admin.events.survey.responsesValue', confirmedCount), { count: responseCount, total: confirmedCount }),
    },
    {
      key: 'attendance',
      value: percent(results.attendanceRate),
      detail: t(countKey('admin.events.survey.attendanceValue', attendedCount), { count: attendedCount }),
    },
    {
      key: 'eventAverage',
      value: average(results.eventAverage),
      // Only attendees rate the event (eventRating is required when attended).
      detail: t(countKey('admin.events.survey.ratingsCount', attendedCount), { count: attendedCount }),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.key} className={`${CARD} px-4 py-3 min-w-0`}>
            <dt className={`text-xs uppercase tracking-wider ${MUTED}`}>{t(`admin.events.survey.${c.key}`)}</dt>
            <dd className={`text-xl font-bold ${INK}`}>{c.value}</dd>
            <dd className={`text-xs ${MUTED}`}>{c.detail}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="flex flex-col gap-2 min-w-0">
          <h4 className={`text-sm font-bold ${INK}`}>{t('admin.events.survey.heardFromTitle')}</h4>
          <AnswerTable
            rows={results.heardFrom || []}
            labelFor={(value) => t(`events.survey.heardFromOptions.${value}`)}
            t={t}
          />
          {(results.heardFromOther || []).length > 0 && (
            <div className="flex flex-col gap-1">
              <p className={`text-xs font-semibold ${MUTED}`}>{t('admin.events.survey.heardFromOther')}</p>
              <ul className="flex flex-col gap-1">
                {/* Free text with no id; read-only, API order (newest first). */}
                {results.heardFromOther.map((text, i) => (
                  <li key={i} className={`${CARD} px-3 py-2 text-sm break-words ${INK}`}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2 min-w-0">
          <h4 className={`text-sm font-bold ${INK}`}>{t('admin.events.survey.recommendTitle')}</h4>
          <AnswerTable
            rows={results.recommend || []}
            labelFor={(value) => t(`events.survey.recommendOptions.${value}`)}
            t={t}
          />
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h4 className={`text-sm font-bold ${INK}`}>{t('admin.events.survey.tutorAverages')}</h4>
        {tutors.length === 0 ? (
          <p className={`text-sm ${MUTED}`}>{t('admin.events.survey.noRatings')}</p>
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('admin.events.survey.columns.tutor')}</th>
                  <th className={`${TH} text-right`}>{t('admin.events.survey.columns.average')}</th>
                  <th className={`${TH} text-right`}>{t('admin.events.survey.columns.count')}</th>
                </tr>
              </thead>
              <tbody>
                {tutors.map((x) => (
                  <tr key={x.tutorId} className={TR}>
                    <td className={`${TD} ${INK}`}>{x.name}</td>
                    <td className={`${TD} text-right whitespace-nowrap ${INK}`}>{average(x.average)}</td>
                    <td className={`${TD} text-right ${MUTED}`}>{x.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className={`text-sm font-bold ${INK}`}>{t('admin.events.survey.reviews')}</h4>
        {reviews.length === 0 ? (
          <p className={`text-sm ${MUTED}`}>{t('admin.events.survey.noReviews')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => (
              <li key={r.id} className={`${CARD} px-4 py-3 flex items-start justify-between gap-3`}>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className={`font-semibold ${INK}`}>{r.tutorName}</span>
                    <span className="flex items-center gap-0.5 text-[var(--calico-orange-text)]" aria-label={`${r.rating}/5`}>
                      <Star className="w-3.5 h-3.5 fill-current" />
                      {r.rating}
                    </span>
                    <span className={MUTED}>{t('admin.events.survey.reviewBy', { name: r.studentName })}</span>
                  </div>
                  {r.comment && <p className={`text-sm whitespace-pre-line break-words ${INK}`}>{r.comment}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={t('admin.events.survey.deleteReview', { name: r.studentName, tutor: r.tutorName })}
                  onClick={() => setReviewToDelete(r)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(reviewToDelete)}
        title={t('admin.events.survey.deleteReviewConfirm.title')}
        message={reviewToDelete && t('admin.events.survey.deleteReviewConfirm.body', {
          name: reviewToDelete.studentName,
          tutor: reviewToDelete.tutorName,
        })}
        confirmLabel={t('admin.events.survey.deleteReviewConfirm.confirm')}
        destructive
        busy={deleting}
        error={deleteError ? t(deleteError) : null}
        onConfirm={confirmDelete}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
}
