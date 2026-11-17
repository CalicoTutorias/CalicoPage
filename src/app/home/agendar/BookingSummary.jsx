"use client";

import React from 'react';
import { BookOpen, User, Calendar } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';

/**
 * Read-only summary card. Lives in the left column on desktop (sticky) and
 * stacks above the form on mobile. All data comes from URL search params via
 * the parent page — this component is purely presentational.
 *
 * `pricing` (optional) is the server-validated coupon preview
 * ({ originalAmount, batchDiscountAmount, couponDiscountAmount, discountAmount,
 * amount, couponCode }). `quote` (optional) is /api/payments/quote: the price
 * of each hour of a block and the block discount. `footer` renders at the
 * end of the card (the "¿Necesitas más tiempo?" box).
 */
export default function BookingSummary({ session, pricing = null, quote = null, footer = null }) {
    const { t, locale, formatCurrency } = useI18n();
    const hasCoupon = Boolean(pricing && Number(pricing.couponDiscountAmount ?? pricing.discountAmount) > 0);
    const batchOff = Number(pricing?.batchDiscountAmount ?? quote?.batchDiscountAmount ?? 0);
    const couponOff = hasCoupon ? Number(pricing.couponDiscountAmount ?? pricing.discountAmount) : 0;
    const listAmount = Number(pricing?.originalAmount ?? quote?.listAmount ?? 0);
    const hasDiscount = batchOff > 0 || hasCoupon;
    const total = pricing ? pricing.amount : (session.price || null);
    const hours = Number(quote?.hours ?? 1);
    const ladder = hours > 1 && Array.isArray(quote?.hourly) ? quote.hourly : [];
    const pricePerHour = Number(quote?.pricePerHour ?? 0);
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';

    const start = new Date(session.scheduledDateTime);
    const end = new Date(session.endDateTime);
    const formattedDate = start.toLocaleDateString(localeStr, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const timeRange = `${start.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t('availability.confirmationModal.course')}
                </h3>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-orange-500" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm leading-snug pt-1.5 break-words min-w-0">
                        {session.course || '—'}
                    </p>
                </div>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t('availability.confirmationModal.tutor')}
                </h3>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-900 text-sm break-words min-w-0">
                        {session.tutorName || session.tutorEmail || '—'}
                    </p>
                </div>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t('availability.confirmationModal.sessionDetails')}
                </h3>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{timeRange}</p>
                        <p className="text-xs text-[#FF8C00] capitalize mt-0.5">{formattedDate}</p>
                        {hours > 1 && (
                            <p className="text-xs text-[var(--calico-body-muted)] mt-0.5">
                                {t('booking.extend.blockSummary', { count: hours })}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {ladder.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        {t('booking.extend.perHourTitle')}
                    </h3>
                    <ul className="space-y-1.5">
                        {ladder.map((h) => (
                            <li key={h.index} className="flex items-center gap-2 text-sm">
                                <span className="w-16 shrink-0 text-[var(--calico-body-muted)]">
                                    {t('booking.extend.hourN', { n: h.index + 1 })}
                                </span>
                                <span className="flex-1 h-1.5 rounded-full bg-[var(--calico-slate-100)] overflow-hidden" aria-hidden="true">
                                    <span
                                        className={`block h-full rounded-full ${h.percent > 0 ? 'bg-[var(--calico-green)]' : 'bg-[var(--calico-slate-300)]'}`}
                                        style={{ width: `${pricePerHour > 0 ? Math.round((h.price / pricePerHour) * 100) : 100}%` }}
                                    />
                                </span>
                                <span className="font-semibold text-[var(--calico-ink)]">{formatCurrency(h.price)}</span>
                                <span className="w-11 text-right text-xs font-bold text-[var(--calico-green)]">
                                    {h.percent > 0 ? `−${h.percent} %` : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="pt-4 border-t border-gray-100 space-y-1.5">
                {hasDiscount && (
                    <>
                        <div className="flex justify-between items-baseline text-sm">
                            <span className="text-gray-500">
                                {batchOff > 0 ? t('booking.extend.listPrice', { count: hours }) : t('booking.coupon.before')}
                            </span>
                            <span className="text-gray-400 line-through">
                                {formatCurrency(listAmount)}
                            </span>
                        </div>
                        {batchOff > 0 && (
                            <div className="flex justify-between items-baseline text-sm">
                                <span className="text-[var(--calico-green)] font-semibold">{t('booking.extend.blockDiscount')}</span>
                                <span className="text-[var(--calico-green)] font-semibold">−{formatCurrency(batchOff)}</span>
                            </div>
                        )}
                        {hasCoupon && (
                            <div className="flex justify-between items-baseline text-sm">
                                <span className="text-gray-500">
                                    {t('booking.coupon.summaryCoupon', { code: pricing.couponCode })}
                                </span>
                                <span className="text-emerald-600 font-semibold">
                                    −{formatCurrency(couponOff)}
                                </span>
                            </div>
                        )}
                    </>
                )}
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-500">
                        {t('availability.confirmationModal.total')}
                    </span>
                    {total ? (
                        <span className="text-xl font-bold text-gray-900">
                            {formatCurrency(total)}
                        </span>
                    ) : (
                        <span className="text-base font-medium text-gray-400">
                            {t('booking.coupon.calculating')}
                        </span>
                    )}
                </div>
                {hours > 1 && total ? (
                    <p className="text-xs text-[var(--calico-body-muted)] text-right">
                        {t('booking.extend.avgPerHour', { price: formatCurrency(Math.round(total / hours)) })}
                    </p>
                ) : null}
            </div>
            {footer}
        </div>
    );
}
