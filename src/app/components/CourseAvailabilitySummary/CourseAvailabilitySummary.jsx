'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Building2, Hash, Layers, Tag, Users } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import './CourseAvailabilitySummary.css';

/** UUID v4 — Course.id en Prisma */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

/**
 * Resuelve curso por id UUID o, si falla, por lista (/api/courses) usando code o nombre.
 */
async function resolveCourseRecord(courseId, courseNameFallback) {
  if (courseId && isUuid(courseId.trim())) {
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseId.trim())}`);
      const data = await res.json();
      if (data.success && data.course) return data.course;
    } catch {
      /* fall through */
    }
  }

  if (!courseId && !courseNameFallback) return null;

  try {
    const res = await fetch('/api/courses');
    const data = await res.json();
    const list = data.courses || [];
    const cid = courseId?.trim();
    if (cid) {
      const byId = list.find((c) => c.id === cid);
      if (byId) return byId;
      const byCode = list.find(
        (c) => c.code?.toLowerCase() === cid.toLowerCase()
      );
      if (byCode) return byCode;
    }
    if (courseNameFallback) {
      const byName = list.find((c) => c.name === courseNameFallback);
      if (byName) return byName;
    }
  } catch {
    /* ignore */
  }

  return null;
}

export default function CourseAvailabilitySummary({
  courseId,
  courseNameFallback,
  onCourseResolved,
}) {
  const { t, locale } = useI18n();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  const notifyResolved = useCallback(
    (record) => {
      if (typeof onCourseResolved === 'function') {
        onCourseResolved(record);
      }
    },
    [onCourseResolved]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setFetchFailed(false);
      const record = await resolveCourseRecord(courseId, courseNameFallback);
      if (cancelled) return;
      setCourse(record);
      setLoading(false);
      if (!record && (courseId || courseNameFallback)) {
        setFetchFailed(true);
      }
      notifyResolved(record ?? null);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [courseId, courseNameFallback, notifyResolved]);

  const displayName =
    course?.name || courseNameFallback || t('availability.calendar.defaultCourse');

  const complexityKey = course?.complexity
    ? `availability.courseSummary.complexityLevel.${course.complexity}`
    : null;
  const complexityLabel = complexityKey ? t(complexityKey) : null;

  const formatMoney = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    try {
      return new Intl.NumberFormat(locale === 'en' ? 'en-CO' : 'es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${n}`;
    }
  };

  const basePriceLabel = formatMoney(course?.basePrice);

  const topics = Array.isArray(course?.topics) ? course.topics : [];
  const tutorOfferCount = course?._count?.tutorCourses ?? null;

  return (
    <section className="course-availability-summary" aria-labelledby="course-availability-summary-title">
      <h2 id="course-availability-summary-title" className="course-availability-summary__heading">
        {t('availability.courseSummary.sectionTitle')}
      </h2>

      {loading ? (
        <div className="course-availability-summary__card course-availability-summary__card--skeleton">
          <div className="course-availability-summary__sk-line course-availability-summary__sk-line--lg" />
          <div className="course-availability-summary__sk-grid">
            <div className="course-availability-summary__sk-line" />
            <div className="course-availability-summary__sk-line" />
            <div className="course-availability-summary__sk-line" />
          </div>
        </div>
      ) : (
        <div className="course-availability-summary__card">
          <div className="course-availability-summary__hero">
            <div className="course-availability-summary__hero-icon" aria-hidden>
              <BookOpen size={26} strokeWidth={2} />
            </div>
            <div className="course-availability-summary__hero-text">
              <p className="course-availability-summary__name">{displayName}</p>
              {course?.code ? (
                <p className="course-availability-summary__code">
                  <Hash size={14} aria-hidden className="course-availability-summary__inline-icon" />
                  {course.code}
                </p>
              ) : null}
            </div>
          </div>

          {fetchFailed && !course ? (
            <p className="course-availability-summary__fallback">
              {t('availability.courseSummary.partialInfo')}
            </p>
          ) : null}

          <dl className="course-availability-summary__meta">
            {complexityLabel ? (
              <div className="course-availability-summary__meta-row">
                <dt>
                  <Layers size={16} aria-hidden />
                  {t('availability.courseSummary.complexity')}
                </dt>
                <dd>{complexityLabel}</dd>
              </div>
            ) : null}

            {basePriceLabel ? (
              <div className="course-availability-summary__meta-row">
                <dt>
                  <Tag size={16} aria-hidden />
                  {t('availability.courseSummary.referencePrice')}
                </dt>
                <dd>{basePriceLabel}</dd>
              </div>
            ) : null}

            {course?.department?.name ? (
              <div className="course-availability-summary__meta-row">
                <dt>
                  <Building2 size={16} aria-hidden />
                  {t('availability.courseSummary.department')}
                </dt>
                <dd>{course.department.name}</dd>
              </div>
            ) : null}

            {tutorOfferCount != null && tutorOfferCount >= 0 ? (
              <div className="course-availability-summary__meta-row">
                <dt>
                  <Users size={16} aria-hidden />
                  {t('availability.courseSummary.tutorsTeaching')}
                </dt>
                <dd>
                  {t('availability.courseSummary.tutorsTeachingCount', {
                    count: tutorOfferCount,
                  })}
                </dd>
              </div>
            ) : null}
          </dl>

          {topics.length > 0 ? (
            <div className="course-availability-summary__topics">
              <p className="course-availability-summary__topics-label">
                {t('availability.courseSummary.topicsHeading')}
              </p>
              <ul className="course-availability-summary__topic-chips">
                {topics.slice(0, 10).map((topic) => (
                  <li key={topic.id}>{topic.name}</li>
                ))}
              </ul>
              {topics.length > 10 ? (
                <p className="course-availability-summary__topics-more">
                  {t('availability.courseSummary.moreTopics', {
                    count: topics.length - 10,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
