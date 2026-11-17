"use client";

import React from 'react';
import Link from 'next/link';
import { CalendarPlus, Minus, Plus } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { Button } from '@/components/ui/button';
import routes from '../../../routes';

/**
 * "¿Necesitas más tiempo?" — end of the checkout summary (tutorías en bloque).
 *
 * 1 hour booked → offers the next consecutive hour with its price and block
 * discount, and a link to book another session with the same tutor.
 * Block booked → a − / + stepper to adjust the duration.
 *
 * Purely presentational: the parent owns the block end and the quote
 * (/api/payments/quote decides whether the next hour fits and its price).
 * Spec: docs/specs/features/batch-tutorias.md §6
 */
export default function ExtendSessionBox({
    hours,
    start,
    end,
    next,
    maxConsecutiveHours,
    tutorId,
    courseId,
    tutorName,
    loading = false,
    disabled = false,
    onAddHour,
    onRemoveHour,
}) {
    const { t, locale, formatCurrency } = useI18n();
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';
    const fmtTime = (d) => new Date(d).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' });

    const canGrow = Boolean(next?.available) && !disabled && !loading;
    const isBlock = hours > 1;
    const tutorUrl = tutorId ? routes.TUTOR_DETAIL(tutorId, { courseId }) : null;
    const nextRange = next ? `${fmtTime(end)} – ${fmtTime(next.endTimestamp)}` : '';

    // Nothing to offer: the tutor takes one hour at a time and there is no
    // tutor link to go back to.
    if (maxConsecutiveHours <= 1 && !tutorUrl) return null;

    return (
        <section
            aria-label={t('booking.extend.aria')}
            className="rounded-[var(--radius-lg)] border border-[var(--calico-orange-soft)] bg-[var(--calico-orange-soft)] p-4 space-y-3"
        >
            <p className="text-[length:var(--type-xs)] font-semibold uppercase tracking-wide text-[var(--calico-orange-text)]">
                {isBlock ? t('booking.extend.blockTitle') : t('booking.extend.title')}
            </p>

            {isBlock ? (
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        onClick={onRemoveHour}
                        disabled={disabled || loading}
                        aria-label={t('booking.extend.removeHour')}
                    >
                        <Minus />
                    </Button>
                    <div className="flex-1 text-center" aria-live="polite">
                        <p className="text-[length:var(--type-h3)] font-bold text-[var(--calico-ink)]">
                            {t(hours === 1 ? 'booking.extend.hourOne' : 'booking.extend.hours', { count: hours })}
                        </p>
                        <p className="text-[length:var(--type-xs)] text-[var(--calico-body-muted)]">
                            {fmtTime(start)} – {fmtTime(end)}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        onClick={onAddHour}
                        disabled={!canGrow}
                        aria-label={t('booking.extend.addHour')}
                    >
                        <Plus />
                    </Button>
                </div>
            ) : (
                maxConsecutiveHours > 1 && next?.available && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onAddHour}
                        disabled={!canGrow}
                        className="w-full h-auto justify-start gap-3 py-2.5 whitespace-normal text-left"
                    >
                        <Plus />
                        <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-[var(--calico-ink)]">{t('booking.extend.addOne')}</span>
                            <span className="block text-[length:var(--type-xs)] text-[var(--calico-body-muted)]">
                                {nextRange} · {formatCurrency(next.price)}
                            </span>
                        </span>
                        {next.percent > 0 && (
                            <span className="rounded-full bg-[var(--calico-green-muted)] px-2 py-0.5 text-[length:var(--type-xs)] font-bold text-[var(--calico-green)]">
                                −{next.percent} %
                            </span>
                        )}
                    </Button>
                )
            )}

            {next && (
                <p className="text-[length:var(--type-xs)] text-[var(--calico-body-muted)]">
                    {next.available
                        ? (isBlock
                            ? t('booking.extend.nextPrice', { range: nextRange, price: formatCurrency(next.price), percent: next.percent })
                            : t('booking.extend.explain', { max: maxConsecutiveHours }))
                        : t('booking.extend.nextUnavailable')}
                </p>
            )}
            {!next && isBlock && (
                <p className="text-[length:var(--type-xs)] text-[var(--calico-body-muted)]">
                    {t('booking.extend.maxReached', { max: maxConsecutiveHours, tutor: tutorName || t('booking.slotGone.tutorFallback') })}
                </p>
            )}

            {tutorUrl && (
                <div className="border-t border-[var(--calico-orange-soft)] pt-3">
                    <Link
                        href={tutorUrl}
                        className="inline-flex items-center gap-1.5 text-[length:var(--type-body-sm)] font-semibold text-[var(--calico-orange-text)] hover:text-[var(--calico-orange-text-hover)]"
                    >
                        <CalendarPlus className="size-4" />
                        {t('booking.extend.anotherSession', { tutor: tutorName || t('booking.slotGone.tutorFallback') })}
                    </Link>
                    <p className="mt-1 text-[length:var(--type-xs)] text-[var(--calico-body-muted)]">
                        {t('booking.extend.anotherSessionHint')}
                    </p>
                </div>
            )}
        </section>
    );
}
