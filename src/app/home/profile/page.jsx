'use client';

import React, { useEffect, useState } from 'react';
import { UserService } from '../../services/core/UserService';
import { useRouter } from 'next/navigation';
import {
  Edit3,
  Star,
  Calendar,
  Users,
  Settings,
  ArrowRight,
  Plus,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth as firebaseAuth } from '../../../firebaseConfig';
import routes from '../../../routes';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import { UserProfileService } from '../../services/utils/UserProfileService';
import './Profile.css';

const TUTOR_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdxeOSt5jjjSVtXY9amQRiXeufm65-11N4FMvJ96fcxyiN58A/viewform?usp=sharing&ouid=102056237631790140503'; 

// Edit Profile Modal
function EditProfileModal({ open, onClose, userData, onSave, t }) {
  const [formData, setFormData] = useState({
    name: userData?.name || '',
    email: userData?.email || '',
    phone: userData?.phone || '',
    description: userData?.description || ''
  });

  useEffect(() => {
    if (userData) {
      setFormData({
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        description: userData.description || ''
      });
    }
  }, [userData]);

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-5 sm:mb-6">{t('profile.editModal.title')}</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('profile.editModal.name')}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('profile.editModal.phone')}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Enter your phone number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('profile.editModal.description')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              placeholder={t('profile.descriptionPlaceholder')}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
          <button
            onClick={handleSave}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 px-6 rounded-xl font-semibold transition-colors duration-300"
          >
            {t('profile.editModal.save')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 px-6 rounded-xl font-semibold transition-colors duration-300"
          >
            {t('profile.editModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tutor Invite Modal
function TutorInviteModal({ open, onClose, t }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">{t('profile.becomeTutorTitle')}</h3>
        <p className="text-gray-600 mb-5 sm:mb-6 text-sm sm:text-base">
          {t('profile.becomeTutorText')}
        </p>
        <div className="flex gap-3">
          <a
            href={TUTOR_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 px-6 rounded-xl font-semibold text-center transition-colors duration-300"
          >
            {t('profile.goToForm')}
          </a>
          <button 
            onClick={onClose}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 px-6 rounded-xl font-semibold transition-colors duration-300"
          >
            {t('profile.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Change Password Modal
function ChangePasswordModal({ open, onClose, t }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError('');
    setSuccess(false);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validations
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('profile.security.errorEmpty'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('profile.security.errorMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('profile.security.errorMismatch'));
      return;
    }

    setSaving(true);
    try {
      const user = firebaseAuth.currentUser;
      if (!user || !user.email) {
        setError(t('profile.security.errorNoUser'));
        return;
      }

      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      console.error('Error changing password:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError(t('profile.security.errorWrongPassword'));
      } else if (err.code === 'auth/too-many-requests') {
        setError(t('profile.security.errorTooMany'));
      } else if (err.code === 'auth/weak-password') {
        setError(t('profile.security.errorWeakPassword'));
      } else {
        setError(t('profile.security.errorGeneric'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-5 sm:mb-6">
          <div className="p-2 bg-orange-100 rounded-xl">
            <Lock className="w-5 h-5 text-orange-600" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{t('profile.security.changePassword')}</h2>
        </div>

        {success ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-medium">{t('profile.security.success')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('profile.security.currentPassword')}
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder={t('profile.security.currentPasswordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('profile.security.newPassword')}
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder={t('profile.security.newPasswordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('profile.security.confirmPassword')}
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder={t('profile.security.confirmPasswordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 px-6 rounded-xl font-semibold transition-colors duration-300"
              >
                {saving ? t('profile.security.saving') : t('profile.security.save')}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 px-6 rounded-xl font-semibold transition-colors duration-300"
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

const Profile = () => {
  const [userData, setUserData] = useState(null);
  const [tutorCourses, setTutorCourses] = useState([]);
  const [allCoursesMap, setAllCoursesMap] = useState(new Map()); // Map to store course ID -> course object
  const [activeRole, setActiveRole] = useState('student');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const { user, authLoading, logout } = useAuth();
  const { t } = useI18n();

  // Load profile data
  useEffect(() => {
    if (authLoading) return;

    if (!user || !user.isLoggedIn) {
      if (typeof window !== 'undefined') {
        router.push(routes.LANDING);
      }
      return;
    }

    // Use user.uid first, then user.id, then user.email
    const userId = user.uid || user.id || user.email;
    if (!userId) return;

    const loadProfileData = async () => {
      try {
        setLoading(true);

        // Run all data fetches in parallel
        const promises = [];

        // 1. User profile data
        const userPromise = user.uid
          ? UserService.getUserById(user.uid).catch((err) => {
              console.warn('Could not fetch user by UID:', err);
              return null;
            })
          : Promise.resolve(null);
        promises.push(userPromise);

        // 2. Tutor courses (only if tutor)
        const tutorCoursesPromise = user.isTutor && user.uid
          ? UserProfileService.getTutorCourses(user.uid).catch((err) => {
              console.warn('Could not load tutor courses:', err);
              return { success: false };
            })
          : Promise.resolve({ success: false });
        promises.push(tutorCoursesPromise);

        // 3. All courses map
        const allCoursesPromise = UserService.getAllCourses().catch((err) => {
          console.warn('Could not load courses:', err);
          return null;
        });
        promises.push(allCoursesPromise);

        const [userResult, coursesResult, allCoursesResult] = await Promise.all(promises);

        if (userResult) {
          setUserData(userResult);
        }

        if (coursesResult?.success && coursesResult.data) {
          setTutorCourses(Array.isArray(coursesResult.data) ? coursesResult.data : []);
        }

        if (allCoursesResult?.courses) {
          const coursesArray = Array.isArray(allCoursesResult.courses) ? allCoursesResult.courses : [];
          const coursesMap = new Map();
          coursesArray.forEach(course => {
            if (typeof course === 'string') {
              coursesMap.set(course, { id: course, nombre: course, name: course, codigo: course });
            } else {
              const courseId = course.id || course.codigo || course.nombre || course.name;
              if (courseId) {
                coursesMap.set(courseId, course);
                if (course.codigo && course.codigo !== courseId) {
                  coursesMap.set(course.codigo, course);
                }
              }
            }
          });
          setAllCoursesMap(coursesMap);
        }
      } catch (error) {
        console.error('Error loading profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();

    // Set active role
    const saved = typeof window !== 'undefined' ? localStorage.getItem('rol') : null;
    if (user.isTutor && saved === 'tutor') {
      setActiveRole('tutor');
    } else if (saved === 'student') {
      setActiveRole('student');
    } else {
      if (typeof window !== 'undefined') {
        localStorage.setItem('rol', 'student');
      }
      setActiveRole('student');
    }
  }, [authLoading, user, router]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      localStorage.setItem('rol', 'student');
      setActiveRole('student');
      notifyRoleChange('student');
      router.push(routes.LANDING);
    }
  };

  const handleRoleChangeWithRefresh = (newRole) => {
    localStorage.setItem('rol', newRole);
    setActiveRole(newRole);
    notifyRoleChange(newRole);
    
    const homeRoute = newRole === 'tutor' ? routes.TUTOR_INICIO : routes.HOME;
    window.location.href = homeRoute;
  };

  const handleChangeRole = () => {
    if (!user.isTutor) {
      setInviteOpen(true);
      return;
    }
    handleRoleChangeWithRefresh('tutor');
  };

  const handleBackToStudent = () => {
    handleRoleChangeWithRefresh('student');
  };

  const handleSaveProfile = async (formData) => {
    try {
      // Use user.uid if available, otherwise use user.email
      const userId = user.uid || user.id || user.email;
      
      // Try UserService.updateUser first (uses UID)
      if (user.uid) {
        try {
          const result = await UserService.updateUser(user.uid, formData);
          if (result.success && result.user) {
            const profile = result.user.profile || {};
            setUserData({
              ...userData,
              ...formData,
              name: result.user.name || profile.name || formData.name,
              email: result.user.email || userData.email,
            });
            return;
          }
        } catch (error) {
          console.warn('Could not update via UserService, trying UserProfileService:', error);
        }
      }
      
      // Fallback to UserProfileService
      const result = await UserProfileService.updateUserProfile(userId, formData);
      if (result.success || result.user) {
        const updatedUser = result.user || result;
        const profile = updatedUser.profile || {};
        setUserData({
          ...userData,
          ...formData,
          name: updatedUser.name || profile.name || formData.name,
          email: updatedUser.email || userData.email,
        });
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

  const handleManageAvailability = () => {
    router.push(routes.TUTOR_DISPONIBILIDAD);
  };

  const notifyRoleChange = (next) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('role-change', { detail: next }));
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('profile.loadingProfile')}</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <div className="profile-page-container">
        <div className="profile-content-wrapper">

          {/* Profile Card */}
          <div className="profile-card bg-white rounded-2xl sm:rounded-3xl shadow-xl mb-6 sm:mb-8">
            {/* Profile Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="profile-avatar relative">
                <img
                  src='https://avatar.iran.liara.run/public/40'
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4 border-orange-100"
                />
                <div className="absolute -bottom-2 -right-2 p-2 bg-orange-500 rounded-full">
                  <Edit3 className="w-4 h-4 text-white" />
                </div>
              </div>
              
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {userData?.name || user?.name || user?.email?.split('@')[0] || ''}
                </h2>
                <div
                  className="flex items-center gap-4 text-sm text-gray-600"
                  style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}
                >
                  <span className="inline-block" style={{ whiteSpace: 'nowrap' }}>📧 {user?.email || userData?.email || ''}</span>
                  {userData?.phone ? (
                    <span className="inline-block" style={{ whiteSpace: 'nowrap' }}>📱 {userData?.phone}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setEditModalOpen(true)}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors duration-300"
                >
                  <Edit3 className="w-5 h-5" />
                  {t('profile.editProfile')}
                </button>
                
                {user.isTutor && activeRole === 'student' && (
                  <button
                    onClick={handleChangeRole}
                    className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors duration-300"
                  >
                    <Settings className="w-5 h-5" />
                    {t('profile.changeToTutorMode')}
                  </button>
                )}
                
                {activeRole === 'tutor' && (
                  <button
                    onClick={handleBackToStudent}
                    className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors duration-300"
                  >
                    {t('profile.changeToStudentMode')}
                  </button>
                )}
              </div>
            </div>

            {/* Rating Section (for tutors) */}
            {user.isTutor && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="rating-card bg-gray-50 rounded-2xl p-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Star className="w-6 h-6 text-orange-500" />
                    <span className="text-3xl font-bold text-gray-800">
                      {userData?.rating?.toFixed(1) || userData?.averageRating?.toFixed(1) || '0.0'}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">{t('profile.rating')}</p>
                </div>
                
                <div className="rating-card bg-gray-50 rounded-2xl p-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Calendar className="w-6 h-6 text-orange-500" />
                    <span className="text-3xl font-bold text-gray-800">
                      {userData?.sessionsCompleted || userData?.totalSessions || userData?.sessionCount || '0'}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">{t('profile.sessionsCompleted')}</p>
                </div>
                
                <div className="rating-card bg-gray-50 rounded-2xl p-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Users className="w-6 h-6 text-orange-500" />
                    <span className="text-3xl font-bold text-gray-800">
                      {userData?.studentsHelped || userData?.totalStudents || userData?.studentCount || '0'}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">{t('profile.studentsHelped')}</p>
                </div>
              </div>
            )}

            {/* About Section */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-gray-800 mb-4">{t('profile.about')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {userData?.description || t('profile.descriptionPlaceholder')}
              </p>
            </div>

            {/* Courses Section (for tutors) */}
            {user.isTutor && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-800">{t('profile.courses')}</h3>
                  <button className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium">
                    <Plus className="w-4 h-4" />
                    {t('profile.addCourse')}
                  </button>
                </div>
                
                {(() => {
                  // Get courses from tutorCourses or userData.courses, ensure it's always an array
                  const tutorCoursesArray = Array.isArray(tutorCourses) ? tutorCourses : [];
                  const userDataCourses = userData?.courses || [];
                  const userDataCoursesArray = Array.isArray(userDataCourses) ? userDataCourses : [];
                  
                  const allCourses = tutorCoursesArray.length > 0 ? tutorCoursesArray : userDataCoursesArray;
                  
                  if (!Array.isArray(allCourses) || allCourses.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <p>{t('profile.noCourses')}</p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="flex flex-wrap gap-3">
                      {allCourses.map((course, index) => {
                        // Get course ID (could be string or object)
                        const courseId = typeof course === 'string' 
                          ? course 
                          : (course.id || course.codigo || course.nombre || course.name || String(course));
                        
                        // Try to get full course details from map
                        const courseDetails = allCoursesMap.get(courseId) || course;
                        
                        // Extract display name with priority: nombre > name > codigo > courseId
                        const courseName = typeof courseDetails === 'string'
                          ? courseDetails
                          : (courseDetails.nombre || courseDetails.name || courseDetails.codigo || courseId);
                        
                        return (
                          <div key={`${courseId}-${index}`} className="course-tag bg-orange-100 text-orange-800 px-4 py-2 rounded-xl flex items-center gap-2">
                            <span className="font-medium">{courseName}</span>
                            <button className="text-orange-600 hover:text-orange-800">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Availability Management (for tutors) */}
            {user.isTutor && (
              <div className="availability-card bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">{t('profile.availability.title')}</h3>
                    <p className="text-gray-600">{t('profile.availability.description')}</p>
                  </div>
                  <button
                    onClick={handleManageAvailability}
                    className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors duration-300"
                  >
                    <Calendar className="w-5 h-5" />
                    {t('profile.availability.goToAvailability')}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Security Section */}
            <div className="mb-8">
              <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-orange-100 rounded-xl">
                      <Shield className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">{t('profile.security.title')}</h3>
                      <p className="text-gray-600 text-sm">{t('profile.security.description')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPasswordModalOpen(true)}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors duration-300"
                  >
                    <Lock className="w-4 h-4" />
                    {t('profile.security.changePassword')}
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 px-6 rounded-xl font-semibold transition-colors duration-300"
              >
                {t('profile.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EditProfileModal 
        open={editModalOpen} 
        onClose={() => setEditModalOpen(false)} 
        userData={userData}
        onSave={handleSaveProfile}
        t={t}
      />
      <TutorInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        t={t}
      />
      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        t={t}
      />
    </div>
  );
};

export default Profile;
