'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, Star, ShieldCheck, GraduationCap, AlertOctagon } from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import routes from '../../../../routes';
import { useI18n } from '../../../../lib/i18n';

const TABS = [
  { key: 'all',       i18nKey: 'admin.users.tabs.all' },
  { key: 'students',  i18nKey: 'admin.users.tabs.students' },
  { key: 'tutors',    i18nKey: 'admin.users.tabs.tutors' },
  { key: 'admins',    i18nKey: 'admin.users.tabs.admins' },
  { key: 'suspended', i18nKey: 'admin.users.tabs.suspended' },
];

function initials(name) {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function RoleBadges({ u, t }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {u.role === 'ADMIN' && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
          <ShieldCheck className="w-3 h-3" /> {t('admin.users.badge.admin')}
        </span>
      )}
      {u.isTutorApproved ? (
        <span className="text-[11px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
          {t('admin.users.badge.tutor')}
        </span>
      ) : (
        <span className="text-[11px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
          {t('admin.users.badge.student')}
        </span>
      )}
      {!u.isActive && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
          <AlertOctagon className="w-3 h-3" /> {t('admin.users.badge.suspended')}
        </span>
      )}
    </div>
  );
}

function UserRow({ u, t }) {
  const tp = u.tutorProfile;
  const rating = tp?.review && Number(tp.review) > 0 ? Number(tp.review).toFixed(2) : null;
  return (
    <Link
      href={routes.ADMIN_USER_DETAIL(u.id)}
      className="block bg-white rounded-2xl border border-gray-100 hover:border-orange-400 hover:shadow-md transition px-4 py-3.5 group"
    >
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold flex-shrink-0 overflow-hidden">
          {u.profilePictureUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={u.profilePictureUrl} alt="" className="w-full h-full object-cover" />
            : initials(u.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5"><RoleBadges u={u} t={t} /></div>
          <p className="font-semibold text-gray-900 truncate">{u.name || '—'}</p>
          <p className="text-sm text-gray-500 truncate">{u.email}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            {u.career?.name && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> {u.career.name}
              </span>
            )}
            {rating && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> {rating}
                <span className="text-gray-400">({tp.numReview})</span>
              </span>
            )}
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-500 transition flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function AdminUsersPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounce search to avoid hammering the API while typing.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const tm = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(tm);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AdminService.listUsers({
        role: activeTab,
        search: debouncedSearch || undefined,
        limit: 100,
      });
      if (!res.success) throw new Error(res.error || t('admin.users.loadError'));
      setItems(res.users || []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(e.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const emptyMessage = useMemo(() => (loading ? null : t('admin.users.empty')), [loading, t]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">{t('admin.users.title')}</h2>
        <p className="text-xs text-gray-500">{t('admin.users.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 inline-flex gap-1 overflow-x-auto">
        {TABS.map(({ key, i18nKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeTab === key ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-orange-50'
            }`}
          >
            {t(i18nKey)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.users.search')}
          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* Counter */}
      {!loading && !error && (
        <p className="text-xs text-gray-500 -mt-1">
          {t(total === 1 ? 'admin.users.results_one' : 'admin.users.results_other', { count: total })}
        </p>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl px-6 py-12 text-center text-sm text-gray-500">
          {emptyMessage}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {items.map((u) => <UserRow key={u.id} u={u} t={t} />)}
        </div>
      )}
    </div>
  );
}
