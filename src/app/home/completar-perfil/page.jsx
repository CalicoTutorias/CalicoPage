'use client';

/**
 * Completar Perfil — one-screen flow to fill the two fields that Google
 * sign-up never collects: phone and career. Reached from the soft banner and
 * from the post-login redirect for users whose profile is incomplete.
 *
 * It is intentionally NOT a hard gate: the "completar más tarde" link lets the
 * user into the app, and the banner keeps nudging until the profile is done.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Phone } from 'lucide-react';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import { UserService } from '../../services/core/UserService';
import { isProfileComplete } from '../../../lib/utils/profile';
import {
  PHONE_COUNTRY_CODES,
  DEFAULT_PHONE_COUNTRY_CODE,
  joinPhone,
  splitPhone,
} from '../../../lib/utils/phone';
import {
  sanitizePhoneDigits,
  isValidPhoneLocal,
  PHONE_MAX_DIGITS,
} from '../../../lib/utils/validation';

export default function CompleteProfilePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, loading: authLoading, refreshUserData } = useAuth();

  const initialPhone = useMemo(() => splitPhone(user?.phone || ''), [user?.phone]);

  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCareerId, setSelectedCareerId] = useState('');
  const [careers, setCareers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill from whatever the user already has (e.g. career set but phone not).
  useEffect(() => {
    setPhoneCountryCode(initialPhone.code);
    setPhoneNumber(initialPhone.local);
  }, [initialPhone]);

  useEffect(() => {
    if (user?.careerId) setSelectedCareerId(user.careerId);
  }, [user?.careerId]);

  // Load the same career catalogue the registration form uses.
  useEffect(() => {
    fetch('/api/majors')
      .then((r) => r.json())
      .then((data) => { if (data.success) setCareers(data.majors); })
      .catch(() => {});
  }, []);

  // Guards: bounce out if not logged in, or if the profile is already complete.
  useEffect(() => {
    if (authLoading) return;
    if (!user?.isLoggedIn) {
      router.replace(routes.LOGIN);
      return;
    }
    if (isProfileComplete(user)) {
      router.replace(routes.HOME);
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedCareerId) {
      setError(t('auth.completeProfile.errors.careerRequired'));
      return;
    }
    if (!phoneNumber || !isValidPhoneLocal(phoneNumber)) {
      setError(t('auth.completeProfile.errors.invalidPhone'));
      return;
    }

    setSaving(true);
    try {
      const fullPhone = joinPhone(phoneCountryCode, phoneNumber);
      const result = await UserService.updateUser(user.uid, {
        phoneNumber: fullPhone,
        careerId: selectedCareerId,
      });

      if (!result.success) throw new Error('update-failed');

      await refreshUserData();
      router.replace(routes.HOME);
    } catch (err) {
      console.error('Complete profile error:', err);
      setError(t('auth.completeProfile.errors.saveFailed'));
      setSaving(false);
    }
  };

  // While auth is resolving, render nothing to avoid a flash of the form.
  if (authLoading || !user?.isLoggedIn) return null;

  return (
    <main className="min-h-full flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 text-orange-500 mb-3">
            <GraduationCap className="w-6 h-6" />
          </span>
          <h1 className="text-2xl font-bold text-gray-800">
            {t('auth.completeProfile.title')}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {t('auth.completeProfile.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <label className="mb-1 text-sm text-slate-500 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4" /> {t('auth.completeProfile.major')}
          </label>
          <select
            className="w-full mb-4 p-2 border rounded-lg text-sm bg-white"
            value={selectedCareerId}
            onChange={(e) => setSelectedCareerId(e.target.value)}
          >
            <option value="">{t('auth.completeProfile.majorPlaceholder')}</option>
            {careers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <label className="mb-1 text-sm text-slate-500 flex items-center gap-1.5">
            <Phone className="w-4 h-4" /> {t('auth.completeProfile.phone')}
          </label>
          <div className="flex gap-2 mb-1">
            <select
              className="p-2 border rounded-lg text-sm bg-white max-w-[6.5rem] flex-shrink-0"
              value={phoneCountryCode}
              onChange={(e) => setPhoneCountryCode(e.target.value)}
              aria-label="Código de país"
            >
              {PHONE_COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code} title={c.label}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              className="flex-1 min-w-0 p-2 border rounded-lg placeholder:text-gray-400 text-sm bg-white"
              placeholder={t('auth.completeProfile.phonePlaceholder')}
              value={phoneNumber}
              maxLength={PHONE_MAX_DIGITS}
              onChange={(e) => setPhoneNumber(sanitizePhoneDigits(e.target.value).slice(0, PHONE_MAX_DIGITS))}
            />
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-snug">
            {t('auth.completeProfile.phoneHelp')}
          </p>

          {error && (
            <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition disabled:opacity-60"
          >
            {saving ? t('auth.completeProfile.saving') : t('auth.completeProfile.submit')}
          </button>

          <button
            type="button"
            onClick={() => router.push(routes.HOME)}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline self-center"
          >
            {t('auth.completeProfile.later')}
          </button>
        </form>
      </div>
    </main>
  );
}
