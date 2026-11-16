'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Search, XCircle,
} from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';
import CourseFormModal, { diffCoursePayload } from './_components/CourseFormModal';

const PAGE_SIZE = 20;

/** Error del API → mensaje legible (códigos conocidos traducidos). */
const API_ERROR_KEYS = {
  COURSE_EXISTS: 'admin.courses.errors.courseExists',
  INVALID_CAREER: 'admin.courses.errors.invalidCareer',
  CAREER_REQUIRED: 'admin.courses.errors.careerRequired',
  INVALID_CODE: 'admin.courses.errors.invalidCode',
};

export default function AdminCoursesPage() {
  const { t, formatCurrency } = useI18n();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [coursesReload, setCoursesReload] = useState(0);
  // Resultado de la última consulta; `key` dice a qué búsqueda/página pertenece.
  const [coursesResult, setCoursesResult] = useState({ key: null, courses: [], total: 0 });

  const [suggestionsReload, setSuggestionsReload] = useState(0);
  const [suggestionsResult, setSuggestionsResult] = useState({ key: null, suggestions: [] });
  const [careers, setCareers] = useState([]);

  // { mode: 'create' | 'edit' | 'approve', course?, suggestion? }
  const [modal, setModal] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const apiError = useCallback(
    (code, fallbackKey) => (API_ERROR_KEYS[code] ? t(API_ERROR_KEYS[code]) : code || t(fallbackKey)),
    [t],
  );

  // ── Catálogo paginado (búsqueda y paginación en el servidor) ──────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const coursesKey = `${debouncedSearch}|${page}|${coursesReload}`;
  const coursesLoading = coursesResult.key !== coursesKey;
  const { courses, total } = coursesResult;

  useEffect(() => {
    // `cancelled` descarta respuestas viejas si el admin escribe o pagina más rápido que el API.
    let cancelled = false;
    AdminService.listAdminCourses({
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.success) throw new Error(res.error || t('admin.courses.errors.load'));
        const lastPage = Math.max(0, Math.ceil((res.total ?? 0) / PAGE_SIZE) - 1);
        // La página pedida ya no existe (el total bajó): salta a la última.
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setCoursesResult({ key: coursesKey, courses: res.courses || [], total: res.total ?? 0 });
      })
      .catch((err) => {
        if (cancelled) return;
        setCoursesResult({ key: coursesKey, courses: [], total: 0 });
        setError(err.message || t('admin.courses.errors.load'));
      });
    return () => { cancelled = true; };
  }, [coursesKey, debouncedSearch, page, t]);

  // ── Sugerencias y carreras ─────────────────────────────────────────────
  const suggestionsLoading = suggestionsResult.key !== suggestionsReload;
  const { suggestions } = suggestionsResult;

  useEffect(() => {
    let cancelled = false;
    AdminService.listCourseSuggestions({ status: 'Pending' })
      .then((res) => {
        if (cancelled) return;
        if (!res.success) throw new Error(res.error || t('admin.courses.errors.load'));
        setSuggestionsResult({ key: suggestionsReload, suggestions: res.suggestions || [] });
      })
      .catch((err) => {
        if (cancelled) return;
        setSuggestionsResult({ key: suggestionsReload, suggestions: [] });
        setError(err.message || t('admin.courses.errors.load'));
      });
    return () => { cancelled = true; };
  }, [suggestionsReload, t]);

  useEffect(() => {
    fetch('/api/majors')
      .then((res) => res.json())
      .then((data) => setCareers(
        (data?.majors || [])
          .map((career) => ({ id: career.id, code: career.code, name: career.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ))
      .catch(() => setError(t('admin.courses.errors.load')));
  }, [t]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reloadCourses = () => setCoursesReload((n) => n + 1);
  const reloadSuggestions = () => setSuggestionsReload((n) => n + 1);

  // ── Acciones del modal ─────────────────────────────────────────────────
  const notify = (message) => {
    setError('');
    setFlash(message);
  };

  const submitModal = async (payload) => {
    if (modal.mode === 'create') {
      const res = await AdminService.createCourse(payload);
      if (!res.success) return { error: apiError(res.error, 'admin.courses.errors.create') };
      setModal(null);
      notify(t('admin.courses.flash.created'));
      reloadCourses();
      return {};
    }

    if (modal.mode === 'edit') {
      const changes = diffCoursePayload(modal.course, payload);
      if (Object.keys(changes).length === 0) {
        setModal(null);
        return {};
      }
      const res = await AdminService.updateCourse(modal.course.id, changes);
      if (!res.success) return { error: apiError(res.error, 'admin.courses.errors.update') };
      setCoursesResult((current) => ({
        ...current,
        courses: current.courses.map((course) => (
          course.id === res.course.id ? { ...course, ...res.course } : course
        )),
      }));
      setModal(null);
      notify(t('admin.courses.flash.updated'));
      return {};
    }

    // approve
    const res = await AdminService.approveCourseSuggestion(modal.suggestion.id, payload);
    if (!res.success) return { error: apiError(res.error, 'admin.courses.errors.approve') };
    setModal(null);
    notify(t('admin.courses.flash.approved'));
    reloadSuggestions();
    reloadCourses();
    return {};
  };

  const reject = async (suggestion) => {
    setActingId(suggestion.id);
    setError('');
    setFlash('');
    try {
      const res = await AdminService.rejectCourseSuggestion(suggestion.id);
      if (!res.success) throw new Error(res.error || t('admin.courses.errors.reject'));
      setFlash(t('admin.courses.flash.rejected'));
      reloadSuggestions();
    } catch (err) {
      setError(err.message || t('admin.courses.errors.reject'));
    } finally {
      setActingId(null);
    }
  };

  const openCreate = () => setModal({ mode: 'create', course: null });
  const openEdit = (course) => setModal({ mode: 'edit', course });
  const openApprove = (suggestion) => setModal({
    mode: 'approve',
    suggestion,
    course: { code: suggestion.code, name: suggestion.name },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-orange-100 rounded-xl">
          <BookOpen className="w-5 h-5 text-orange-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-800">{t('admin.courses.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl leading-relaxed">
            {t('admin.courses.subtitle')}
          </p>
        </div>
      </div>

      {flash && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">{flash}</div>}
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Catálogo */}
      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 sm:mr-auto">{t('admin.courses.table.title')}</h3>
          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('admin.courses.table.searchPlaceholder')}
              aria-label={t('admin.courses.table.searchPlaceholder')}
              className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="w-4 h-4" />
            {t('admin.courses.create')}
          </button>
        </div>

        {coursesLoading && courses.length === 0 ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : courses.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            {debouncedSearch
              ? t('admin.courses.table.emptySearch', { search: debouncedSearch })
              : t('admin.courses.table.empty')}
          </p>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${coursesLoading ? 'opacity-60' : ''}`} aria-busy={coursesLoading}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">{t('admin.courses.table.code')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">{t('admin.courses.table.name')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">{t('admin.courses.table.career')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">{t('admin.courses.table.complexity')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('admin.courses.table.basePrice')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('admin.courses.table.tutors')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('admin.courses.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {courses.map((course) => {
                  const aliasCount = Array.isArray(course.aliases) ? course.aliases.length : 0;
                  return (
                    <tr key={course.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 align-top font-mono text-xs font-semibold text-gray-800 whitespace-nowrap">{course.code}</td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-gray-800">{course.name}</p>
                        {aliasCount > 0 && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-xs" title={course.aliases.join(', ')}>
                            {t(aliasCount === 1 ? 'admin.courses.table.aliasesCount_one' : 'admin.courses.table.aliasesCount_other', { count: aliasCount })}
                            {': '}
                            {course.aliases.join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap" title={course.career?.name}>{course.career?.code || '—'}</td>
                      <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap">{t(`admin.courses.complexity.${course.complexity}`)}</td>
                      <td className="px-4 py-3 align-top text-right text-gray-800 whitespace-nowrap">{formatCurrency(Number(course.basePrice || 0), 'COP')}</td>
                      <td className="px-4 py-3 align-top text-right text-gray-600">{course.approvedTutorCount ?? 0}</td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(course)}
                          aria-label={t('admin.courses.table.editAria', { code: course.code })}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {t('admin.courses.table.edit')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-gray-500">
              {t('admin.courses.table.pagination.page', { page: page + 1, total: totalPages })}
              {' · '}
              {t(total === 1 ? 'admin.courses.table.pagination.count_one' : 'admin.courses.table.pagination.count_other', { count: total })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0 || coursesLoading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label={t('admin.courses.table.pagination.previous')}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages || coursesLoading}
                onClick={() => setPage((p) => p + 1)}
                aria-label={t('admin.courses.table.pagination.next')}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Sugerencias pendientes */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">{t('admin.courses.suggestions.title')}</h3>
            <p className="text-xs text-gray-500">{t('admin.courses.suggestions.subtitle')}</p>
          </div>
          <span className="text-xs font-semibold text-orange-600 bg-orange-50 rounded-full px-2 py-1">
            {suggestions.length}
          </span>
        </div>

        {suggestionsLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">{t('admin.courses.suggestions.empty')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="py-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">{suggestion.code}</p>
                    <p className="text-sm text-gray-700 truncate">{suggestion.name}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {suggestion.requester?.name || suggestion.requester?.email || t('admin.courses.suggestions.unknownRequester')}
                  </p>
                  {suggestion.notes && <p className="text-xs text-gray-600 mt-2">{suggestion.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openApprove(suggestion)} disabled={actingId === suggestion.id} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    {t('admin.courses.suggestions.approve')}
                  </button>
                  <button type="button" onClick={() => reject(suggestion)} disabled={actingId === suggestion.id} className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">
                    <XCircle className="w-4 h-4" />
                    {t('admin.courses.suggestions.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <CourseFormModal
          key={modal.course?.id || modal.suggestion?.id || modal.mode}
          mode={modal.mode}
          course={modal.course}
          careers={careers}
          onSubmit={submitModal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
