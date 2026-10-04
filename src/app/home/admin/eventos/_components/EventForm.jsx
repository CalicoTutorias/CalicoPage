'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { AdminService } from '@/app/services/core/AdminService';
import { TutorSearchService } from '@/app/services/utils/TutorSearchService';
import { createCourseSearcher } from '@/app/services/utils/CourseSearch';
import { useI18n } from '@/lib/i18n';
import { validateEventDraft } from '@/lib/events/event-rules';
import { earlyBirdDiscount } from '@/lib/payments/event-pricing';
import { MIN_CHARGE_COP } from '@/lib/payments/fees';
import { bogotaLocalToUtc, countKey, utcToBogotaLocalInput } from '@/lib/utils/event-format';
import { CARD, ERROR_BOX, FIELD_ERROR, HINT, INPUT, LABEL, MUTED, errorKey } from './ui';

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const COVER_MAX_BYTES = 5 * 1024 * 1024; // mirrors the presign route
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 5000;
const HTTPS_URL = /^https:\/\/\S+$/;
const LIST_LIMIT = 8;
/** Full-width, left-aligned list option on top of the ghost <Button>. */
const OPTION_BUTTON = 'w-full h-auto justify-start rounded-none px-3 py-2 font-normal text-[var(--calico-ink)] hover:bg-[var(--calico-slate-50)] hover:text-[var(--calico-ink)]';

/** Where each API/rule field shows its message (pricing rules all show under the price). */
const ERROR_SLOT = {
  title: 'title',
  description: 'description',
  coverImageKey: 'cover',
  courseId: 'course',
  tutorIds: 'tutors',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  modality: 'modality',
  autoMeet: 'modality',
  meetingUrl: 'meetingUrl',
  location: 'location',
  price: 'price',
  earlyBirdSlots: 'price',
  earlyBirdPercent: 'price',
};

/**
 * Error slots a change to a form field clears: its own slot plus the slots of
 * the cross-field rules it feeds (start/end, modality/link/location). The
 * early-bird toggle and fields share the price slot, like their rules.
 */
const CLEARED_SLOTS = {
  startsAt: ['startsAt', 'endsAt'],
  endsAt: ['startsAt', 'endsAt'],
  modality: ['modality', 'meetingUrl', 'location'],
  meetMode: ['modality', 'meetingUrl'],
  earlyBird: ['price'],
};
const slotsClearedBy = (key) => CLEARED_SLOTS[key] ?? [ERROR_SLOT[key] ?? key];

const blankToEmpty = (v) => (v === null || v === undefined ? '' : String(v));

function initialForm(event) {
  if (!event) {
    return {
      title: '', description: '', startsAt: '', endsAt: '',
      modality: 'Virtual', meetMode: 'auto', meetingUrl: '', location: '',
      price: '', earlyBird: false, earlyBirdSlots: '', earlyBirdPercent: '', isListed: true,
    };
  }
  return {
    title: event.title ?? '',
    description: event.description ?? '',
    startsAt: event.startsAt ? utcToBogotaLocalInput(event.startsAt) : '',
    endsAt: event.endsAt ? utcToBogotaLocalInput(event.endsAt) : '',
    modality: event.modality,
    meetMode: event.autoMeet ? 'auto' : 'link',
    meetingUrl: event.autoMeet ? '' : blankToEmpty(event.meetingUrl),
    location: blankToEmpty(event.location),
    ...pricingFields(event),
    isListed: Boolean(event.isListed),
  };
}

function pricingFields(event) {
  return {
    price: blankToEmpty(event.price),
    earlyBird: event.earlyBirdSlots != null,
    earlyBirdSlots: blankToEmpty(event.earlyBirdSlots),
    earlyBirdPercent: blankToEmpty(event.earlyBirdPercent),
  };
}

const hasRegistrations = (event) => {
  const s = event?.stats;
  return Boolean(s) && (s.confirmed + s.pending + s.canceled) > 0;
};

function toUtcIso(local) {
  try {
    return bogotaLocalToUtc(local).toISOString();
  } catch {
    return '';
  }
}

/**
 * Create / edit form for an event. Start and end are typed as Colombia
 * wall-clock and sent as UTC. Validation reuses validateEventDraft (the same
 * rules the API applies) plus a few field checks the API does with zod.
 *
 * Editing: modality / autoMeet are fixed once Published; price and early-bird
 * are fixed once there are registrations (or the API answers PRICE_LOCKED),
 * and are then left out of the PATCH. The cover key is only sent when the
 * admin changed the cover (undefined = keep, null = remove).
 *
 * `onSaved(event, { calendarWarning? })` runs after a successful save.
 */
export default function EventForm({ event = null, onSaved, onCancel }) {
  const { t, formatCurrency } = useI18n();
  const isEdit = Boolean(event);
  const modalityLocked = event?.status === 'Published';
  const uid = useId();
  const id = (name) => `${uid}-${name}`;

  const [form, setForm] = useState(() => initialForm(event));
  const [course, setCourse] = useState(event?.course ?? null);
  const [tutors, setTutors] = useState(event?.tutors ?? []);
  const [priceLocked, setPriceLocked] = useState(() => hasRegistrations(event));
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Cover: keep the current URL, a new file to upload, or a removal.
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(event?.coverImageUrl || null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const uploaded = useRef({ file: null, key: null });
  const fileInputRef = useRef(null);

  const [courses, setCourses] = useState([]);
  const [courseQuery, setCourseQuery] = useState('');
  const [tutorQuery, setTutorQuery] = useState('');
  const [tutorResults, setTutorResults] = useState([]);
  const [tutorsLoaded, setTutorsLoaded] = useState(false);

  const minLabel = formatCurrency(MIN_CHARGE_COP, 'COP');
  /** Editing a field drops the errors it may have fixed; the next submit re-validates. */
  const clearErrors = (slots) => setErrors((prev) => (
    slots.some((slot) => prev[slot]) ? { ...prev, ...Object.fromEntries(slots.map((slot) => [slot, null])) } : prev
  ));
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearErrors(slotsClearedBy(key));
  };

  useEffect(() => {
    let active = true;
    TutorSearchService.getMaterias().then((list) => {
      if (active) setCourses(Array.isArray(list) ? list : []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const search = tutorQuery.trim();
    const timer = setTimeout(() => {
      AdminService.listApprovedTutors({ status: 'active', search: search || undefined }).then((res) => {
        if (!active) return;
        setTutorResults(res?.success ? res.tutors || [] : []);
        setTutorsLoaded(true);
      });
    }, search ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tutorQuery]);

  // Revoke the blob preview URL when it changes or on unmount.
  useEffect(() => {
    if (!coverFile || !coverPreview) return undefined;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverFile, coverPreview]);

  const courseSearcher = useMemo(() => createCourseSearcher(courses), [courses]);
  const courseMatches = courseQuery.trim() ? courseSearcher.search(courseQuery).slice(0, LIST_LIMIT) : [];
  const selectedTutorIds = new Set(tutors.map((x) => x.id));
  const tutorMatches = tutorResults.filter((x) => !selectedTutorIds.has(x.id)).slice(0, LIST_LIMIT);

  const errorText = (code) => {
    const key = `admin.events.form.errors.${code}`;
    const text = t(key, { min: minLabel });
    return text === key ? null : text;
  };

  // ─── Cover ───────────────────────────────────────────────────────────

  const pickCover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!COVER_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, cover: errorText('COVER_TYPE_INVALID') }));
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setErrors((prev) => ({ ...prev, cover: errorText('COVER_TOO_LARGE') }));
      return;
    }
    setErrors((prev) => ({ ...prev, cover: null }));
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverRemoved(false);
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverRemoved(true);
  };

  /** undefined = keep the current cover, null = remove it, string = the new key. */
  const resolveCoverKey = async () => {
    if (coverFile) {
      if (uploaded.current.file === coverFile) return uploaded.current.key;
      const res = await AdminEventService.uploadCover(coverFile);
      if (!res.success) throw new Error('COVER_UPLOAD_FAILED');
      uploaded.current = { file: coverFile, key: res.s3Key };
      return res.s3Key;
    }
    if (coverRemoved && event?.coverImageUrl) return null;
    return undefined;
  };

  // ─── Validation and submit ──────────────────────────────────────────

  const buildDraft = () => {
    const virtual = form.modality === 'Virtual';
    const autoMeet = virtual && form.meetMode === 'auto';
    const intOrNull = (v) => (String(v).trim() === '' ? null : Number(v));
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      courseId: course?.id ?? null,
      tutorIds: tutors.map((x) => x.id),
      startsAt: toUtcIso(form.startsAt),
      endsAt: toUtcIso(form.endsAt),
      modality: form.modality,
      autoMeet,
      meetingUrl: virtual && !autoMeet ? form.meetingUrl.trim() || null : null,
      location: virtual ? null : form.location.trim() || null,
      price: form.price.trim() === '' ? null : Number(form.price),
      earlyBirdSlots: form.earlyBird ? intOrNull(form.earlyBirdSlots) : null,
      earlyBirdPercent: form.earlyBird ? intOrNull(form.earlyBirdPercent) : null,
      isListed: form.isListed,
    };
  };

  const validate = (draft) => {
    const found = {};
    if (draft.title.length < TITLE_MIN || draft.title.length > TITLE_MAX) found.title = 'TITLE_INVALID';
    if (!draft.description || draft.description.length > DESCRIPTION_MAX) found.description = 'DESCRIPTION_REQUIRED';
    if (draft.price === null) found.price = 'PRICE_INVALID';
    if (draft.meetingUrl && !HTTPS_URL.test(draft.meetingUrl)) found.meetingUrl = 'MEETING_URL_INVALID';
    const problem = validateEventDraft({ ...draft, price: draft.price ?? 0 });
    if (problem && !found[ERROR_SLOT[problem.field]]) found[ERROR_SLOT[problem.field] ?? 'general'] = problem.code;
    return Object.fromEntries(Object.entries(found).map(([slot, code]) => [slot, errorText(code) ?? code]));
  };

  const restorePricing = () => {
    if (event) setForm((f) => ({ ...f, ...pricingFields(event) }));
  };

  const applyServerError = (res) => {
    if (res.code === 'PRICE_LOCKED') {
      setPriceLocked(true);
      restorePricing();
      setErrors({ price: errorText('PRICE_LOCKED') });
      return;
    }
    if (res.code === 'INVALID_STATE') {
      if (res.field === 'modality' || res.field === 'autoMeet') setErrors({ modality: errorText('MODALITY_LOCKED') });
      else setGeneralError(t('admin.events.errors.INVALID_STATE'));
      return;
    }
    if (res.code === 'VALIDATION_ERROR' && res.rule) {
      const text = errorText(res.rule) || res.error || t('admin.events.form.errors.generic');
      const slot = ERROR_SLOT[res.field];
      if (slot) setErrors({ [slot]: text });
      else setGeneralError(text);
      return;
    }
    setGeneralError(res.error || t(errorKey(res, 'admin.events.form.errors.generic')));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const draft = buildDraft();
    const problems = validate(draft);
    setGeneralError(problems.general ?? null);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setSaving(true);
    let coverImageKey;
    try {
      coverImageKey = await resolveCoverKey();
    } catch {
      setErrors({ cover: errorText('COVER_UPLOAD_FAILED') });
      setSaving(false);
      return;
    }

    const payload = { ...draft, ...(coverImageKey !== undefined ? { coverImageKey } : {}) };
    if (isEdit && modalityLocked) {
      delete payload.modality;
      delete payload.autoMeet;
    }
    if (isEdit && priceLocked) {
      delete payload.price;
      delete payload.earlyBirdSlots;
      delete payload.earlyBirdPercent;
    }

    const res = isEdit
      ? await AdminEventService.update(event.id, payload)
      : await AdminEventService.create(payload);
    if (!res.success) {
      setSaving(false);
      applyServerError(res);
      return;
    }
    // A created draft navigates away: keep the submit disabled until then so a
    // second click can't create a duplicate. Edit mode stays on the page.
    if (isEdit) setSaving(false);
    onSaved(res.event, res.calendarWarning ? { calendarWarning: true } : {});
  };

  // ─── Render helpers ─────────────────────────────────────────────────

  const describedBy = (name, hint) => [hint && id(`${name}-hint`), errors[name] && id(`${name}-error`)].filter(Boolean).join(' ') || undefined;
  const hintEl = (name, text) => (text ? <p id={id(`${name}-hint`)} className={HINT}>{text}</p> : null);
  const errorEl = (name) => (errors[name] ? <p id={id(`${name}-error`)} className={FIELD_ERROR}>{errors[name]}</p> : null);

  const priceNum = Number(form.price);
  const slotsNum = Number(form.earlyBirdSlots);
  const percentNum = Number(form.earlyBirdPercent);
  const earlyBirdPreview = form.earlyBird && priceNum > 0 && slotsNum > 0 && percentNum > 0 && percentNum < 100
    ? t(countKey('admin.events.form.hints.earlyBirdPreview', slotsNum), {
        slots: slotsNum,
        discounted: formatCurrency(priceNum - earlyBirdDiscount(priceNum, percentNum), 'COP'),
        price: formatCurrency(priceNum, 'COP'),
      })
    : null;
  const isVirtual = form.modality === 'Virtual';
  const lockedHint = t('admin.events.form.hints.locked');

  return (
    <form noValidate onSubmit={submit} className={`${CARD} p-4 sm:p-5 flex flex-col gap-5`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-[var(--calico-ink)]">
          {isEdit ? t('admin.events.form.editTitle') : t('admin.events.form.createTitle')}
        </h3>
        {onCancel && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('admin.events.form.actions.cancel')} onClick={onCancel}>
            <X />
          </Button>
        )}
      </div>

      {generalError && <p role="alert" className={ERROR_BOX}>{generalError}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Title */}
        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <label htmlFor={id('title')} className={LABEL}>{t('admin.events.form.fields.title')}</label>
          <input
            id={id('title')}
            type="text"
            maxLength={TITLE_MAX}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={describedBy('title')}
            className={INPUT}
          />
          {errorEl('title')}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <label htmlFor={id('description')} className={LABEL}>{t('admin.events.form.fields.description')}</label>
          <textarea
            id={id('description')}
            rows={5}
            maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy('description')}
            className={INPUT}
          />
          {errorEl('description')}
        </div>

        {/* Cover */}
        <div className="flex flex-col gap-2 min-w-0 md:col-span-2">
          <span className={LABEL}>{t('admin.events.form.fields.cover')}</span>
          {coverPreview ? (
            <div className="flex flex-wrap items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview or remote S3 cover; no next/image remotePatterns configured */}
              <img
                src={coverPreview}
                alt=""
                className="w-56 max-w-full aspect-video object-cover rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] bg-[var(--calico-slate-50)]"
              />
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus />
                  {t('admin.events.form.cover.replace')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={removeCover}>
                  <Trash2 />
                  {t('admin.events.form.cover.remove')}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus />
              {t('admin.events.form.cover.select')}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={COVER_TYPES.join(',')}
            onChange={pickCover}
            className="hidden"
            aria-label={t('admin.events.form.fields.cover')}
          />
          <p className={HINT}>{t('admin.events.form.hints.cover')}</p>
          {errors.cover && <p className={FIELD_ERROR}>{errors.cover}</p>}
        </div>

        {/* Start / end (Colombia time) */}
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('startsAt')} className={LABEL}>{t('admin.events.form.fields.startsAt')}</label>
          <input
            id={id('startsAt')}
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
            aria-invalid={Boolean(errors.startsAt)}
            aria-describedby={describedBy('startsAt', true)}
            className={INPUT}
          />
          {hintEl('startsAt', t('admin.events.form.hints.bogota'))}
          {errorEl('startsAt')}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('endsAt')} className={LABEL}>{t('admin.events.form.fields.endsAt')}</label>
          <input
            id={id('endsAt')}
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set('endsAt', e.target.value)}
            aria-invalid={Boolean(errors.endsAt)}
            aria-describedby={describedBy('endsAt', true)}
            className={INPUT}
          />
          {hintEl('endsAt', t('admin.events.form.hints.bogota'))}
          {errorEl('endsAt')}
        </div>

        {/* Course (optional) */}
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('course')} className={LABEL}>{t('admin.events.form.fields.course')}</label>
          {course ? (
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-[var(--calico-ink)]">
                {course.code ? `${course.code} · ` : ''}{course.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('admin.events.form.course.clear')}
                onClick={() => {
                  setCourse(null);
                  clearErrors(['course']);
                }}
              >
                <X />
              </Button>
            </div>
          ) : (
            <>
              <input
                id={id('course')}
                type="search"
                value={courseQuery}
                onChange={(e) => setCourseQuery(e.target.value)}
                placeholder={t('admin.events.form.course.searchPlaceholder')}
                aria-invalid={Boolean(errors.course)}
                aria-describedby={describedBy('course')}
                className={INPUT}
                autoComplete="off"
              />
              {courseQuery.trim() && (
                <ul className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] divide-y divide-[var(--calico-slate-100)] max-h-56 overflow-y-auto">
                  {courseMatches.length === 0 && <li className={`px-3 py-2 text-sm ${MUTED}`}>{t('admin.events.form.course.noResults')}</li>}
                  {courseMatches.map((c) => (
                    <li key={c.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        className={OPTION_BUTTON}
                        aria-label={t('admin.events.form.course.select', { name: c.name })}
                        onClick={() => {
                          setCourse({ id: c.id, name: c.name, code: c.code });
                          setCourseQuery('');
                          clearErrors(['course']);
                        }}
                      >
                        <span className="font-mono text-xs">{c.code}</span>
                        <span className="min-w-0 truncate">{c.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {errorEl('course')}
        </div>

        {/* Tutors (ordered, ≥ 1) */}
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('tutors')} className={LABEL}>{t('admin.events.form.fields.tutors')}</label>
          {tutors.length === 0 ? (
            <p className={`text-sm ${MUTED}`}>{t('admin.events.form.tutors.none')}</p>
          ) : (
            <ol className="flex flex-wrap gap-2">
              {tutors.map((tutor, index) => (
                <li key={tutor.id} className="flex items-center gap-1 rounded-full border border-[var(--calico-slate-200)] bg-[var(--calico-slate-50)] pl-3 pr-1 py-0.5 text-sm text-[var(--calico-ink)]">
                  <span>{index + 1}. {tutor.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('admin.events.form.tutors.remove', { name: tutor.name })}
                    onClick={() => {
                      setTutors((list) => list.filter((x) => x.id !== tutor.id));
                      clearErrors(['tutors']);
                    }}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <input
            id={id('tutors')}
            type="search"
            value={tutorQuery}
            onChange={(e) => setTutorQuery(e.target.value)}
            placeholder={t('admin.events.form.tutors.searchPlaceholder')}
            aria-invalid={Boolean(errors.tutors)}
            aria-describedby={describedBy('tutors', true)}
            className={INPUT}
            autoComplete="off"
          />
          <ul className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] divide-y divide-[var(--calico-slate-100)] max-h-56 overflow-y-auto">
            {tutorsLoaded && tutorMatches.length === 0 && (
              <li className={`px-3 py-2 text-sm ${MUTED}`}>{t('admin.events.form.tutors.noResults')}</li>
            )}
            {tutorMatches.map((tutor) => (
              <li key={tutor.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className={OPTION_BUTTON}
                  aria-label={t('admin.events.form.tutors.add', { name: tutor.name })}
                  onClick={() => {
                    setTutors((list) => [...list, { id: tutor.id, name: tutor.name, email: tutor.email }]);
                    clearErrors(['tutors']);
                  }}
                >
                  <Plus className="text-[var(--calico-orange-text)]" />
                  <span className="min-w-0 truncate">{tutor.name}</span>
                  <span className={`min-w-0 truncate text-xs ${MUTED}`}>{tutor.email}</span>
                </Button>
              </li>
            ))}
          </ul>
          {hintEl('tutors', t('admin.events.form.hints.tutors'))}
          {errorEl('tutors')}
        </div>

        {/* Modality */}
        <fieldset
          className="flex flex-col gap-2 min-w-0 md:col-span-2"
          disabled={modalityLocked}
          title={modalityLocked ? lockedHint : undefined}
        >
          <legend className={`${LABEL} mb-1`}>{t('admin.events.form.fields.modality')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--calico-ink)]">
            <label htmlFor={id('modality-virtual')} className="flex items-center gap-2">
              <input id={id('modality-virtual')} type="radio" name={id('modality')} value="Virtual" checked={isVirtual} onChange={() => set('modality', 'Virtual')} className="accent-[var(--calico-orange)]" />
              {t('admin.events.form.modality.virtual')}
            </label>
            <label htmlFor={id('modality-inPerson')} className="flex items-center gap-2">
              <input id={id('modality-inPerson')} type="radio" name={id('modality')} value="InPerson" checked={!isVirtual} onChange={() => set('modality', 'InPerson')} className="accent-[var(--calico-orange)]" />
              {t('admin.events.form.modality.inPerson')}
            </label>
          </div>
          {isVirtual && (
            <div className="flex flex-col gap-2 pl-1 sm:pl-6 text-sm text-[var(--calico-ink)]">
              <label htmlFor={id('meetMode-auto')} className="flex items-center gap-2">
                <input id={id('meetMode-auto')} type="radio" name={id('meetMode')} value="auto" checked={form.meetMode === 'auto'} onChange={() => set('meetMode', 'auto')} className="accent-[var(--calico-orange)]" />
                {t('admin.events.form.modality.autoMeet')}
              </label>
              {form.meetMode === 'auto' && !modalityLocked && (
                <p className={`${HINT} pl-6`}>{t('admin.events.form.modality.autoMeetHint')}</p>
              )}
              <label htmlFor={id('meetMode-link')} className="flex items-center gap-2">
                <input id={id('meetMode-link')} type="radio" name={id('meetMode')} value="link" checked={form.meetMode === 'link'} onChange={() => set('meetMode', 'link')} className="accent-[var(--calico-orange)]" />
                {t('admin.events.form.modality.pasteLink')}
              </label>
            </div>
          )}
          {modalityLocked && <p className={HINT}>{lockedHint}</p>}
          {errorEl('modality')}
        </fieldset>

        {isVirtual && form.meetMode === 'link' && (
          <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
            <label htmlFor={id('meetingUrl')} className={LABEL}>{t('admin.events.form.fields.meetingUrl')}</label>
            <input
              id={id('meetingUrl')}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.meetingUrl}
              onChange={(e) => set('meetingUrl', e.target.value)}
              aria-invalid={Boolean(errors.meetingUrl)}
              aria-describedby={describedBy('meetingUrl')}
              className={INPUT}
            />
            {errorEl('meetingUrl')}
          </div>
        )}

        {!isVirtual && (
          <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
            <label htmlFor={id('location')} className={LABEL}>{t('admin.events.form.fields.location')}</label>
            <input
              id={id('location')}
              type="text"
              maxLength={300}
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              aria-invalid={Boolean(errors.location)}
              aria-describedby={describedBy('location')}
              className={INPUT}
            />
            {errorEl('location')}
          </div>
        )}

        {/* Pricing */}
        <fieldset className="flex flex-col gap-3 min-w-0 md:col-span-2" disabled={priceLocked}>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <label htmlFor={id('price')} className={LABEL}>{t('admin.events.form.fields.price')}</label>
            <input
              id={id('price')}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              aria-invalid={Boolean(errors.price)}
              aria-describedby={describedBy('price', true)}
              className={INPUT}
            />
            {hintEl('price', priceLocked ? t('admin.events.form.hints.priceLocked') : t('admin.events.form.hints.price', { min: minLabel }))}
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--calico-ink)]">
            <input
              type="checkbox"
              checked={form.earlyBird}
              onChange={(e) => set('earlyBird', e.target.checked)}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.events.form.fields.earlyBird')}
          </label>
          {form.earlyBird && (
            <div className="flex flex-col gap-2 pl-1 sm:pl-6">
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                <div className="flex flex-col gap-1 min-w-0">
                  <label htmlFor={id('earlyBirdSlots')} className={LABEL}>{t('admin.events.form.fields.earlyBirdSlots')}</label>
                  <input
                    id={id('earlyBirdSlots')}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    step={1}
                    value={form.earlyBirdSlots}
                    onChange={(e) => set('earlyBirdSlots', e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <label htmlFor={id('earlyBirdPercent')} className={LABEL}>{t('admin.events.form.fields.earlyBirdPercent')}</label>
                  <input
                    id={id('earlyBirdPercent')}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    step={1}
                    value={form.earlyBirdPercent}
                    onChange={(e) => set('earlyBirdPercent', e.target.value)}
                    className={INPUT}
                  />
                </div>
              </div>
              <p className={HINT}>{t('admin.events.form.hints.earlyBird', { min: minLabel })}</p>
              {earlyBirdPreview && (
                <p className="text-sm font-medium text-[var(--calico-ink)] bg-[var(--calico-slate-50)] rounded-[var(--radius-lg)] px-3 py-2 self-start">
                  {earlyBirdPreview}
                </p>
              )}
            </div>
          )}
          {errorEl('price')}
        </fieldset>

        {/* Listed */}
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="flex items-center gap-2 text-sm text-[var(--calico-ink)]">
            <input
              type="checkbox"
              checked={form.isListed}
              onChange={(e) => set('isListed', e.target.checked)}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.events.form.fields.isListed')}
          </label>
          <p className={HINT}>{t('admin.events.form.hints.isListed')}</p>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-[var(--calico-slate-100)] pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            {t('admin.events.form.actions.cancel')}
          </Button>
        )}
        <Button type="submit" variant="cta" disabled={saving}>
          {saving
            ? t('admin.events.form.actions.saving')
            : isEdit ? t('admin.events.form.actions.save') : t('admin.events.form.actions.create')}
        </Button>
      </div>
    </form>
  );
}
