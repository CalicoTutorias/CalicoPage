'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Shield, Lock, Eye, EyeOff, Settings, LogOut, X, GraduationCap, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import routes from '../../../routes';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import { AuthService } from '../../services/utils/AuthService';
import { UserService } from '../../services/core/UserService';
import './Profile.css';


// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, profilePictureUrl, size = 'lg', isTutor = false }) {
  const initials = (name || '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

  const sizeClass = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-10 h-10 text-sm';
  const ringClass = isTutor ? 'ring-blue-100' : 'ring-orange-100';
  const fallbackBg = isTutor ? 'bg-blue-600' : 'bg-orange-500';

  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ring-4 ${ringClass}`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full ring-4 ${ringClass} ${fallbackBg} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ─── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({ open, onClose, userData, onSave, t, isTutor = false }) {
  const [form, setForm] = useState({ name: '', phone: '', bio: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && userData) {
      setForm({
        name: userData.name || '',
        phone: userData.phone || '',
        bio: isTutor ? (userData.bio || '') : '',
      });
    }
  }, [open, userData, isTutor]);

  if (!open) return null;

  const focusRing = isTutor ? 'focus:ring-blue-400' : 'focus:ring-orange-400';
  const saveBtn = isTutor ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('profile.editModal.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">{t('profile.editModal.name')}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${focusRing} focus:border-transparent transition`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">{t('profile.editModal.phone')}</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${focusRing} focus:border-transparent transition`}
            />
          </div>
          {isTutor && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">{t('profile.editModal.description')}</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={3}
                className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${focusRing} focus:border-transparent transition resize-none`}
                placeholder={t('profile.descriptionPlaceholder')}
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const ok = await onSave(form);
                if (ok !== false) onClose();
              } finally {
                setSaving(false);
              }
            }}
            className={`flex-1 ${saveBtn} text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {saving ? t('profile.security.saving') : t('profile.editModal.save')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-60"
          >
            {t('profile.editModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ open, onClose, t, isTutor = false }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setForm({ current: '', next: '', confirm: '' });
    setShow({ current: false, next: false, confirm: false });
    setError('');
    setSuccess(false);
    setSaving(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.current || !form.next || !form.confirm) { setError(t('profile.security.errorEmpty')); return; }
    if (form.next.length < 6) { setError(t('profile.security.errorMinLength')); return; }
    if (form.next !== form.confirm) { setError(t('profile.security.errorMismatch')); return; }

    setSaving(true);
    try {
      await AuthService.changePassword(form.current, form.next);
      setSuccess(true);
      setTimeout(handleClose, 2000);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('INVALID_CREDENTIALS') || msg.includes('incorrect')) {
        setError(t('profile.security.errorWrongPassword'));
      } else {
        setError(t('profile.security.errorGeneric'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const focusRing = isTutor ? 'focus:ring-blue-400' : 'focus:ring-orange-400';
  const submitBtn = isTutor
    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300'
    : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300';
  const lockWrap = isTutor ? 'bg-blue-100' : 'bg-orange-100';
  const lockIcon = isTutor ? 'text-blue-600' : 'text-orange-600';

  const PasswordField = ({ field, label, placeholder }) => (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show[field] ? 'text' : 'password'}
          value={form[field]}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          className={`w-full px-3.5 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${focusRing} focus:border-transparent transition`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow({ ...show, [field]: !show[field] })}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 ${lockWrap} rounded-lg`}>
              <Lock className={`w-4 h-4 ${lockIcon}`} />
            </div>
            <h2 className="text-lg font-semibold text-gray-800">{t('profile.security.changePassword')}</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-medium text-sm">{t('profile.security.success')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            <PasswordField field="current" label={t('profile.security.currentPassword')} placeholder={t('profile.security.currentPasswordPlaceholder')} />
            <PasswordField field="next" label={t('profile.security.newPassword')} placeholder={t('profile.security.newPasswordPlaceholder')} />
            <PasswordField field="confirm" label={t('profile.security.confirmPassword')} placeholder={t('profile.security.confirmPasswordPlaceholder')} />
            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                disabled={saving}
                className={`flex-1 ${submitBtn} text-white py-2.5 rounded-xl text-sm font-semibold transition`}
              >
                {saving ? t('profile.security.saving') : t('profile.security.save')}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold transition"
              >
                {t('profile.editModal.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


// ─── Main Profile Component ────────────────────────────────────────────────────

const Profile = () => {
  const router = useRouter();
  const { user, loading: authLoading, logout, refreshUserData } = useAuth();
  const { t } = useI18n();

  // Local override for fields the user edits in-session
  const [localData, setLocalData] = useState(null);
  const [activeRole, setActiveRole] = useState('student');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && (!user || !user.isLoggedIn)) {
      router.push(routes.LANDING);
    }
  }, [authLoading, user, router]);

  // Sync role from localStorage once
  useEffect(() => {
    if (!user?.isLoggedIn) return;
    const saved = typeof window !== 'undefined' ? localStorage.getItem('rol') : null;
    if (user.isTutor && saved === 'tutor') setActiveRole('tutor');
    else setActiveRole('student');
  }, [user?.isLoggedIn, user?.isTutor]);

  // Display data: prefer local edits, fall back to context
  const displayData = localData ?? {
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    bio: activeRole === 'tutor' ? (user?.tutorProfile?.bio || '') : '',
    profilePictureUrl: user?.profilePictureUrl || null,
    careerName: user?.career?.name || null,
  };

  const handleSaveProfile = useCallback(async (formData) => {
    if (!user?.uid) return false;
    try {
      // Always update user profile (name, phone)
      const userUpdatePromise = UserService.updateUser(user.uid, {
        name: formData.name,
        phoneNumber: formData.phone,
      });

      // Only update bio for tutors (students don't have bio)
      let bioUpdatePromise = Promise.resolve({ success: true });
      if (activeRole === 'tutor') {
        // Update tutor profile bio via /api/tutor/profile
        bioUpdatePromise = fetch('/api/tutor/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('calico_auth_token')}`,
          },
          body: JSON.stringify({ bio: formData.bio }),
        }).then(res => res.json());
      }

      const [userResult, bioResult] = await Promise.all([userUpdatePromise, bioUpdatePromise]);

      if (userResult?.success && bioResult?.success) {
        await refreshUserData();
        // Use server state so name, bio, phone, avatar, carrera stay in sync
        setLocalData(null);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error saving profile:', err);
      return false;
    }
  }, [user?.uid, activeRole, refreshUserData]);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    localStorage.setItem('rol', 'student');
    router.push(routes.LANDING);
  };

  const handleRoleChange = (newRole) => {
    localStorage.setItem('rol', newRole);
    setActiveRole(newRole);
    window.dispatchEvent(new CustomEvent('role-change', { detail: newRole }));
    window.location.href = newRole === 'tutor' ? routes.TUTOR_INICIO : routes.HOME;
  };

  if (authLoading) {
    return (
      <div className="profile-view-canvas profile-view-canvas--student min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.isLoggedIn) return null;

  const isTutor = activeRole === 'tutor';
  const profileCanvasClass =
    activeRole === 'tutor'
      ? 'profile-view-canvas tutor-app-canvas-fill'
      : 'profile-view-canvas profile-view-canvas--student';

  return (
    <div className={profileCanvasClass}>
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── Left column: identity card ─────────────────── */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Banner */}
              <div className={isTutor ? 'h-24 bg-gradient-to-r from-blue-700 to-blue-500' : 'h-24 bg-gradient-to-r from-orange-400 to-amber-400'} />

              {/* Avatar + edit */}
              <div className="px-5 pb-5">
                <div className="flex items-end justify-between -mt-10 mb-3">
                  <div className="ring-4 ring-white rounded-full">
                    <Avatar name={displayData.name} profilePictureUrl={displayData.profilePictureUrl} isTutor={isTutor} />
                  </div>
                  <button
                    onClick={() => setEditModalOpen(true)}
                    className={
                      isTutor
                        ? 'profile-action-btn flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition'
                        : 'profile-action-btn flex items-center gap-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-xl transition'
                    }
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{t('profile.editProfile')}</span>
                  </button>
                </div>

                <h1 className="text-lg font-bold text-gray-900 leading-tight">{displayData.name || '—'}</h1>
                <p className="text-xs text-gray-500 mt-0.5 break-all">{displayData.email}</p>
                {displayData.phone && <p className="text-xs text-gray-500 mt-0.5"> {displayData.phone}</p>}
                {displayData.careerName && (
                  <span
                    className={
                      isTutor
                        ? 'inline-block mt-2 text-xs font-medium bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full'
                        : 'inline-block mt-2 text-xs font-medium bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full'
                    }
                  >
                    {displayData.careerName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: details ──────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

            {/* About - Only for tutors */}
            {activeRole === 'tutor' && (
              <div className="bg-white rounded-2xl shadow-sm px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{t('profile.about')}</h2>
                {displayData.bio ? (
                  <>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">
                      {displayData.bio}
                    </p>
                    <p className="text-xs text-gray-400 leading-relaxed italic">
                      {t('profile.aboutTutorDescription')}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-400 italic leading-relaxed mb-3">
                      {t('profile.descriptionPlaceholder')}
                    </p>
                    <p className="text-xs text-gray-400 leading-relaxed italic">
                      {t('profile.aboutTutorDescription')}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Role card */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {user.isTutor ? (
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {activeRole === 'tutor' ? t('profile.changeToStudentMode') : t('profile.changeToTutorMode')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activeRole === 'tutor' ? t('profile.tutorModeActive') : t('profile.studentModeActive')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRoleChange(activeRole === 'tutor' ? 'student' : 'tutor')}
                    className="profile-action-btn flex items-center gap-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition flex-shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{t('profile.changeRole')}</span>
                  </button>
                </div>
              ) : user.tutorApplicationStatus === 'Pending' ? (
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-xl flex-shrink-0">
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{t('profile.tutorApplicationPending')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('profile.tutorApplicationPendingText')}</p>
                  </div>
                </div>
              ) : user.tutorApplicationStatus === 'Rejected' ? (
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t('profile.reapplyAsTutor')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('profile.rejectedApplicationText')}</p>
                  </div>
                  <Link
                    href={routes.APPLY_TUTOR}
                    className="profile-action-btn flex items-center gap-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-xl transition flex-shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{t('profile.apply')}</span>
                  </Link>
                </div>
              ) : (
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-orange-50 rounded-xl flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{t('profile.becomeTutorTitle')}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t('profile.becomeTutorText')}</p>
                    </div>
                  </div>
                  <Link
                    href={routes.APPLY_TUTOR}
                    className="profile-action-btn flex items-center gap-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-xl transition flex-shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{t('profile.goToForm')}</span>
                  </Link>
                </div>
              )}

              <div className="border-t border-gray-100" />

              {/* Security */}
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={isTutor ? 'p-2 bg-blue-50 rounded-xl flex-shrink-0' : 'p-2 bg-orange-50 rounded-xl flex-shrink-0'}>
                    <Shield className={isTutor ? 'w-4 h-4 text-blue-600' : 'w-4 h-4 text-orange-500'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{t('profile.security.title')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('profile.security.description')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPasswordModalOpen(true)}
                  className="profile-action-btn flex items-center gap-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition flex-shrink-0"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t('profile.security.changePassword')}</span>
                </button>
              </div>

              <div className="border-t border-gray-100" />

              {/* Logout */}
              <div className="px-5 py-3">
                <button
                  onClick={handleLogout}
                  className="profile-action-btn flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl transition w-full justify-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t('profile.logout')}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      <EditProfileModal open={editModalOpen} onClose={() => setEditModalOpen(false)} userData={displayData} onSave={handleSaveProfile} t={t} isTutor={activeRole === 'tutor'} />
      <ChangePasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} t={t} />
    </div>
  );
};

export default Profile;
