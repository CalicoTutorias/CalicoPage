"use client";

import React, { useId } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { GROUP_SURCHARGE_PER_HOUR_COP } from '../../../lib/sessions/group-session';

/**
 * "¿Van más personas?" block of the booking form: how many people take the
 * session (up to what the tutor accepts) and the emails of the guests.
 *
 * Purely presentational — the form owns the state. The student who books
 * pays for every seat; guests are invited by email once the payment is
 * confirmed, and can also be invited later from the session, so the emails
 * are optional here. Rules: src/lib/sessions/group-session.js.
 */
export default function GroupBookingSection({
    maxGroupSize,
    groupSize,
    onGroupSizeChange,
    emails,
    onEmailsChange,
    emailError = '',
    disabled = false,
}) {
    const { t, formatCurrency } = useI18n();
    const uid = useId();
    const guests = Math.max(0, groupSize - 1);

    const setEmail = (index, value) => {
        const next = [...emails];
        next[index] = value;
        onEmailsChange(next);
    };

    return (
        <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[var(--calico-orange-text)]" aria-hidden="true" />
                {t('booking.group.title')}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
                {t('booking.group.hint', { surcharge: formatCurrency(GROUP_SURCHARGE_PER_HOUR_COP) })}
            </p>

            <div className="flex items-center gap-3" role="group" aria-label={t('booking.group.title')}>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t('booking.group.fewer')}
                    disabled={disabled || groupSize <= 1}
                    onClick={() => onGroupSizeChange(groupSize - 1)}
                >
                    <Minus aria-hidden="true" />
                </Button>
                <p className="text-sm font-semibold text-gray-900 min-w-[7.5rem] text-center" aria-live="polite">
                    {groupSize === 1 ? t('booking.group.onlyMe') : t('booking.group.people', { count: groupSize })}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t('booking.group.more')}
                    disabled={disabled || groupSize >= maxGroupSize}
                    onClick={() => onGroupSizeChange(groupSize + 1)}
                >
                    <Plus aria-hidden="true" />
                </Button>
            </div>
            {groupSize >= maxGroupSize && (
                <p className="text-xs text-gray-500 mt-2">{t('booking.group.max', { count: maxGroupSize })}</p>
            )}

            {guests > 0 && (
                <div className="mt-4 space-y-2">
                    <p className="text-xs text-gray-500">{t('booking.group.emailsHint')}</p>
                    {Array.from({ length: guests }, (_, index) => (
                        <div key={index}>
                            <label htmlFor={`${uid}-guest-${index}`} className="sr-only">
                                {t('booking.group.guestLabel', { number: index + 1 })}
                            </label>
                            <input
                                id={`${uid}-guest-${index}`}
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                value={emails[index] || ''}
                                onChange={(e) => setEmail(index, e.target.value)}
                                placeholder={t('booking.group.guestPlaceholder', { number: index + 1 })}
                                disabled={disabled}
                                aria-invalid={Boolean(emailError)}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--calico-orange-soft)] focus:border-[var(--calico-orange)] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    ))}
                    {emailError && (
                        <p role="alert" className="text-xs text-[var(--calico-danger-strong)]">{emailError}</p>
                    )}
                </div>
            )}
        </div>
    );
}
